"""모임 기록·요약 핵심 규칙: 대화 읽기, AI 호출, 결과 정리와 인용 확인.

스펙: docs/specs/Minyeong-meeting-summary.md
"""

import json
import re
from pathlib import Path

HERE = Path(__file__).parent
MODEL = "claude-sonnet-5-5"
MAX_ISSUES = 3
MAX_OPEN_QUESTIONS = 3

# AI가 돌려줄 형식. 항목을 못 찾으면 빈 문자열이나 빈 목록을 돌려주게 한다.
ISSUE_SCHEMA = {
    "type": "object",
    "properties": {
        "question": {"type": "string"},
        "views": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "member": {"type": "string"},
                    "view": {"type": "string"},
                    "quote": {"type": "string"},
                },
                "required": ["member", "view", "quote"],
                "additionalProperties": False,
            },
        },
        "divergence_reason": {"type": "string"},
        "common_ground": {"type": "string"},
        "ai_questions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["question", "views", "divergence_reason", "common_ground", "ai_questions"],
    "additionalProperties": False,
}
MAX_AI_QUESTIONS = 2

SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        "one_line": {"type": "string"},
        "issues": {"type": "array", "items": ISSUE_SCHEMA},
        "members": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "premise": {"type": "string"},
                    "main_thought": {"type": "string"},
                },
                "required": ["name", "premise", "main_thought"],
                "additionalProperties": False,
            },
        },
        "open_questions": {"type": "array", "items": {"type": "string"}},
        "other_topics": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["one_line", "issues", "members", "open_questions", "other_topics"],
    "additionalProperties": False,
}


class SummaryFailed(Exception):
    """AI 호출이나 응답 읽기가 실패함. 화면에는 '지금 정리할 수 없어요'가 나간다."""


# 클로바노트 등에서 내보낸 형식: '참석자 1 00:03' 줄 다음에 발언이 온다.
_HEADER = re.compile(r"^(.{1,20}?)\s+\d{1,2}:\d{2}(?::\d{2})?$")
# 한 줄 형식: '화자: 발언'
_INLINE = re.compile(r"^([^:：]{1,20})\s*[:：]\s*(.+)$")


def parse_transcript(text):
    """대화 텍스트를 [(화자, 발언), ...]으로. 두 형식을 모두 읽는다.

    - '화자: 발언' 한 줄 형식
    - '화자 00:03' 머리줄 + 다음 줄들의 발언 (클로바노트 내보내기)
    화자 표시가 없는 줄은 앞 발언에 이어 붙인다.
    """
    utterances = []
    pending = None  # 머리줄을 읽고 발언을 기다리는 화자
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        header = _HEADER.match(line)
        if header:
            pending = header.group(1).strip()
            continue
        if pending:
            utterances.append((pending, line))
            pending = None
            continue
        m = _INLINE.match(line)
        if m:
            utterances.append((m.group(1).strip(), m.group(2).strip()))
        elif utterances:
            name, said = utterances[-1]
            utterances[-1] = (name, f"{said} {line}")
    return utterances


def list_speakers(utterances):
    """화자 이름 맞추기 화면용: [{label, first}, ...] 처음 나온 순서대로."""
    seen = {}
    for name, said in utterances:
        if name not in seen:
            seen[name] = said[:80]
    return [{"label": k, "first": v} for k, v in seen.items()]


def apply_names(utterances, names):
    """화자 표시를 멤버가 적은 실명으로 바꾼다. 비어 있거나 이상한 이름은 원래 표시를 쓴다."""
    clean = {}
    for label, name in (names or {}).items():
        name = str(name).strip()
        if name and len(name) <= 20 and ":" not in name and "：" not in name:
            clean[str(label)] = name
    return [(clean.get(who, who), said) for who, said in utterances]


def to_text(utterances):
    """AI에게 보낼 대화: 한 줄에 '화자: 발언'."""
    return "\n".join(f"{who}: {said}" for who, said in utterances)


def _normalize(s):
    """인용 비교용: 공백 차이만 무시한다. 문장부호 허용 여부는 C2 결과를 보고 정한다(스펙 열린 문제)."""
    return re.sub(r"\s+", " ", s).strip()


def quote_is_grounded(member, quote, utterances):
    """그 멤버의 실제 발언 안에 인용이 그대로 있으면 True."""
    q = _normalize(quote)
    if not q:
        return False
    return any(name == member and q in _normalize(said) for name, said in utterances)


def call_claude(transcript, prompt_file="prompt.md", schema=SUMMARY_SCHEMA, extra=""):
    """Claude에게 대화를 보내 JSON 문자열을 받는다. 실패하면 SummaryFailed.

    extra: 대화 뒤에 붙일 요청(예: 더 알아보기 주제).
    """
    import anthropic

    client = anthropic.Anthropic(timeout=180.0, max_retries=1)
    system = (HERE / prompt_file).read_text(encoding="utf-8")
    content = f"<transcript>\n{transcript}\n</transcript>" + (f"\n\n{extra}" if extra else "")
    try:
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=system,
            output_config={"format": {"type": "json_schema", "schema": schema}},
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.AuthenticationError:
        raise SummaryFailed("API 키가 올바르지 않아요 (401)")
    except anthropic.RateLimitError:
        raise SummaryFailed("호출 한도를 넘었어요 (429)")
    except anthropic.APITimeoutError:
        raise SummaryFailed("응답 시간이 초과됐어요")
    except anthropic.APIConnectionError:
        raise SummaryFailed("API 서버에 연결하지 못했어요")
    except anthropic.APIStatusError as e:
        raise SummaryFailed(f"API 오류 {e.status_code}: {e.message}")

    if response.stop_reason != "end_turn":
        raise SummaryFailed(f"응답이 정상적으로 끝나지 않았어요 (stop_reason: {response.stop_reason})")
    return "".join(b.text for b in response.content if b.type == "text")


def _load(raw_text):
    try:
        data = json.loads(raw_text)
    except (json.JSONDecodeError, TypeError):
        raise SummaryFailed("AI 응답을 JSON으로 읽지 못했어요")
    if not isinstance(data, dict):
        raise SummaryFailed("AI 응답 형식이 예상과 달라요")
    return data


def check_issue(issue, utterances):
    """쟁점 카드 하나: 멤버별 생각마다 인용이 실제 발언에 있는지 grounded 표시를 붙인다(숨기지 않음)."""
    views = []
    for v in issue.get("views") or []:
        if not isinstance(v, dict) or not v.get("member"):
            continue
        quote = v.get("quote", "")
        views.append({
            "member": v["member"],
            "view": v.get("view", ""),
            "quote": quote,
            "grounded": quote_is_grounded(v["member"], quote, utterances),
        })
    ai_questions = [q for q in issue.get("ai_questions") or [] if isinstance(q, str) and q.strip()]
    return {
        "question": issue.get("question", ""),
        "views": views,
        "divergence_reason": issue.get("divergence_reason", ""),
        "common_ground": issue.get("common_ground", ""),
        "ai_questions": ai_questions[:MAX_AI_QUESTIONS],
    }


def build_issue(raw_text, utterances):
    """[더 알아보기] 응답(쟁점 카드 하나)을 화면용으로."""
    return check_issue(_load(raw_text), utterances)


def build_result(raw_text, utterances):
    """AI 응답(JSON 문자열)을 화면용 결과로 정리한다.

    쟁점은 최대 3개, 남은 질문은 최대 3개. 넘치는 쟁점은 '그 밖에 나온 이야기'로 제목만 옮긴다.
    """
    data = _load(raw_text)

    issues = [i for i in data.get("issues") or [] if isinstance(i, dict) and i.get("question")]
    other_topics = [t for t in data.get("other_topics") or [] if isinstance(t, str) and t.strip()]
    other_topics = [i["question"] for i in issues[MAX_ISSUES:]] + other_topics

    shown_issues = [check_issue(issue, utterances) for issue in issues[:MAX_ISSUES]]

    members = [m for m in data.get("members") or [] if isinstance(m, dict) and m.get("name")]
    open_questions = [q for q in data.get("open_questions") or [] if isinstance(q, str) and q.strip()]

    return {
        "one_line": data.get("one_line", "") or "",
        "issues": shown_issues,
        "members": members,
        "open_questions": open_questions[:MAX_OPEN_QUESTIONS],
        "other_topics": other_topics,
    }
