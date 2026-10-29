"""모임 기록·요약 프로토타입 서버.

실행:      python server.py
테스트:    python server.py --mock data/c2-ai-response.json   (API 대신 준비된 응답을 읽음, C2)

API 키는 이 서버만 .env에서 읽고, 브라우저로는 보내지 않는다.
"""

import json
import os
import sys
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


def summarize(transcript, names):
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
    return {"status": "ok", "result": result}


def expand(transcript, names, topic):
    """[더 알아보기]: 그 밖에 나온 이야기 하나를 쟁점 카드로 펼친다."""
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
                return self._json(expand(transcript, names, str(body.get("topic", ""))))
            self._json(summarize(transcript, names))
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
