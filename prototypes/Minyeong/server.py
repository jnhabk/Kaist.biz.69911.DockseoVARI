"""모임 기록·요약 프로토타입 서버.

실행:      python server.py
테스트:    python server.py --mock data/c2-ai-response.json   (API 대신 준비된 응답을 읽음, C2)

API 키는 이 서버만 .env에서 읽고, 브라우저로는 보내지 않는다.
"""

import json
import os
import re
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from summarize import (
    ISSUE_SCHEMA,
    SummaryFailed,
    apply_names,
    build_issue,
    build_result,
    call_claude,
    list_speakers,
    parse_transcript,
    to_text,
)

HERE = Path(__file__).parent
PORT = int(os.environ.get("PORT", "8000"))
SAMPLE = HERE / "data" / "sample-meeting.txt"
# 모임 하나당 JSON 파일 하나. 실명과 대화 원문이 들어 있어 .gitignore 대상이다.
RECORDS = HERE / "records"
RECORD_ID = re.compile(r"^\d{8}-\d{6}(-\d+)?$")


def load_env():
    """.env의 KEY=VALUE 줄을 환경 변수로. 파일이 없어도 서버는 뜬다."""
    env = HERE / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def mock_file():
    if "--mock" not in sys.argv:
        return None
    i = sys.argv.index("--mock")
    if i + 1 >= len(sys.argv):
        sys.exit("--mock 뒤에 응답 파일 경로를 적어 주세요.")
    path = (HERE / sys.argv[i + 1]).resolve()
    if not path.exists():
        sys.exit(f"테스트 응답 파일을 찾을 수 없어요: {sys.argv[i + 1]}")
    return path


MOCK = None


EMPTY = {"status": "empty", "message": "'화자: 발언' 형태나 클로바노트 형식의 대화를 넣어 주세요."}


def _need_key():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SummaryFailed("ANTHROPIC_API_KEY가 없어요. prototypes/Minyeong/.env에 키를 넣어 주세요.")


def _log_ungrounded(issue):
    for v in issue["views"]:
        if not v["grounded"]:
            print(f"[근거 확인 안 됨] {v['member']}: {v['quote']}")


def _record_path(record_id):
    if not RECORD_ID.match(record_id or ""):
        return None
    return RECORDS / f"{record_id}.json"


def load_record(record_id):
    path = _record_path(record_id)
    if not path or not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save_record(record):
    RECORDS.mkdir(exist_ok=True)
    _record_path(record["id"]).write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")


def clean_meeting(meeting):
    """모임 정보: 날짜(YYYY-MM-DD, 없거나 이상하면 오늘), 장소, 읽은 책."""
    meeting = meeting if isinstance(meeting, dict) else {}
    date = str(meeting.get("date", "")).strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        date = datetime.now().strftime("%Y-%m-%d")
    return {
        "date": date,
        "place": str(meeting.get("place", "")).strip()[:60],
        "book": str(meeting.get("book", "")).strip()[:100],
    }


def new_record(utterances, names, result, meeting):
    """정리 결과를 자동 저장한다. 큐레이션·발제의 재료로 쓰기 쉽게 항목별로 나눠 둔다."""
    now = datetime.now()
    record_id = now.strftime("%Y%m%d-%H%M%S")
    n = 1
    while _record_path(record_id).exists():
        n += 1
        record_id = f"{now:%Y%m%d-%H%M%S}-{n}"
    record = {
        "id": record_id,
        "saved_at": now.isoformat(timespec="seconds"),
        "test_mode": bool(MOCK),
        "meeting": clean_meeting(meeting),
        "members": list(dict.fromkeys(who for who, _ in utterances)),
        "names": names,
        "utterances": [{"speaker": who, "text": said} for who, said in utterances],
        "result": result,
        "expanded": {},
    }
    save_record(record)
    return record


def list_records():
    if not RECORDS.exists():
        return []
    items = []
    for path in sorted(RECORDS.glob("*.json"), reverse=True):
        try:
            r = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        items.append({
            "id": r["id"],
            "saved_at": r.get("saved_at", ""),
            "meeting": r.get("meeting") or {"date": r.get("saved_at", "")[:10], "place": "", "book": ""},
            "one_line": r.get("result", {}).get("one_line", ""),
            "members": r.get("members", []),
            "test_mode": r.get("test_mode", False),
        })
    # 모임 날짜 최신순, 같은 날이면 나중에 저장한 것 먼저
    items.sort(key=lambda i: (i["meeting"]["date"], i["saved_at"]), reverse=True)
    return items


def summarize(transcript, names, meeting=None):
    utterances = apply_names(parse_transcript(transcript), names)
    if not utterances:
        return EMPTY
    try:
        if MOCK:
            raw = MOCK.read_text(encoding="utf-8")
        else:
            _need_key()
            raw = call_claude(to_text(utterances))
        result = build_result(raw, utterances)
    except SummaryFailed as e:
        print(f"[정리 실패] {e}")
        return {"status": "failed"}
    for issue in result["issues"]:
        _log_ungrounded(issue)
    record = new_record(utterances, names, result, meeting)
    print(f"[저장] records/{record['id']}.json")
    return {"status": "ok", "record": record}


def expand(transcript, names, topic, record_id=None):
    """[더 알아보기]: 그 밖에 나온 이야기 하나를 쟁점 카드로 펼친다.

    record_id가 있으면 저장된 원문을 쓰고, 펼친 카드를 그 기록에 더해 저장한다.
    """
    record = load_record(record_id) if record_id else None
    if record:
        utterances = [(u["speaker"], u["text"]) for u in record["utterances"]]
    else:
        utterances = apply_names(parse_transcript(transcript), names)
    topic = topic.strip()[:200]
    if not utterances or not topic:
        return EMPTY
    try:
        if MOCK:
            raise SummaryFailed("테스트 모드에서는 더 알아보기를 쓰지 않아요")
        _need_key()
        raw = call_claude(to_text(utterances), "prompt-expand.md", ISSUE_SCHEMA, f"<topic>{topic}</topic>")
        issue = build_issue(raw, utterances)
    except SummaryFailed as e:
        print(f"[더 알아보기 실패] {e}")
        return {"status": "failed"}
    _log_ungrounded(issue)
    if record:
        record["expanded"][topic] = issue
        save_record(record)
    return {"status": "ok", "issue": issue}


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, ctype, body):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _json(self, obj, status=200):
        self._send(status, "application/json; charset=utf-8", json.dumps(obj, ensure_ascii=False))

    def do_GET(self):
        if self.path == "/":
            return self._send(200, "text/html; charset=utf-8", (HERE / "public" / "index.html").read_bytes())
        if self.path == "/api/sample":
            return self._json({"transcript": SAMPLE.read_text(encoding="utf-8"), "testMode": MOCK.name if MOCK else None})
        if self.path == "/api/records":
            return self._json({"records": list_records()})
        if self.path.startswith("/api/records/"):
            record = load_record(self.path.rsplit("/", 1)[-1])
            if record:
                return self._json({"record": record})
            return self._json({"status": "not_found"}, 404)
        self._send(404, "text/plain; charset=utf-8", "없는 주소예요.")

    def do_POST(self):
        if self.path not in ("/api/speakers", "/api/summarize", "/api/expand"):
            return self._send(404, "text/plain; charset=utf-8", "없는 주소예요.")
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 500_000:
                return self._json({"status": "failed"}, 413)
            body = json.loads(self.rfile.read(length) or b"{}")
            transcript = str(body.get("transcript", ""))
            names = body.get("names") if isinstance(body.get("names"), dict) else {}
            if self.path == "/api/speakers":
                return self._json({"speakers": list_speakers(parse_transcript(transcript))})
            if self.path == "/api/expand":
                return self._json(expand(transcript, names, str(body.get("topic", "")), body.get("record_id")))
            self._json(summarize(transcript, names, body.get("meeting")))
        except Exception as e:  # 화면에는 늘 같은 실패 안내를 보낸다
            print(f"[서버 오류] {e}")
            self._json({"status": "failed"}, 500)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    load_env()
    MOCK = mock_file()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"모임 기록·요약 프로토타입: http://localhost:{PORT}")
    if MOCK:
        print(f"테스트 모드: API 대신 {MOCK.name} 을(를) 읽어요.")
    elif not os.environ.get("ANTHROPIC_API_KEY"):
        print("API 키가 없어요. 정리하기를 누르면 '지금 정리할 수 없어요'가 나와요.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
