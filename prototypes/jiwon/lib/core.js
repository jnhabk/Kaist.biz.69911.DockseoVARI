// 발제 질문 프로토타입의 핵심 규칙. Node 기능을 쓰지 않아서 브라우저에서도 그대로 시험할 수 있다.
// 규칙의 출처: docs/specs/jiwon-discussion-questions.md (P0)

export const MIN_MEMBERS = 2;
export const MIN_UNDERLINES = 5;
export const MAX_QUESTIONS = 4;
export const MAX_EVIDENCE = 2;

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

// 밑줄 문장과 멤버가 모두 있는 기록만 센다.
function usableRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.filter((r) => cleanText(r?.underline) && cleanText(r?.member));
}

export function countRecords(records) {
  const usable = usableRecords(records);
  const members = new Set(usable.map((r) => cleanText(r.member)));
  return { members: members.size, underlines: usable.length };
}

// 최소 기준 메시지 하나. 기준을 넘으면 null.
// n = 기록한 멤버가 2명이 되려면 더 필요한 멤버 수, m = 밑줄이 5개가 되려면 더 필요한 밑줄 수.
export function minimumMessage({ members, underlines }) {
  const needMembers = Math.max(0, MIN_MEMBERS - members);
  const needUnderlines = Math.max(0, MIN_UNDERLINES - underlines);
  if (needMembers === 0 && needUnderlines === 0) return null;

  const parts = [];
  if (needMembers > 0) parts.push(`멤버 ${needMembers}명`);
  if (needUnderlines > 0) parts.push(`밑줄 ${needUnderlines}개`);
  // "명"은 받침이 있어 "이", "개"는 받침이 없어 "가".
  const particle = needUnderlines > 0 ? "가" : "이";
  return `기록이 더 필요해요. ${parts.join(", ")}${particle} 더 있어야 질문을 만들 수 있어요.`;
}

// 같은 문장은 하나로 묶고, 이번 생성에서만 쓰는 임시 라벨(#1, #2…)을 붙인다.
// 멤버 이름은 몇 명이 그었는지 세는 데에만 쓰고 결과에 남기지 않는다.
export function buildLabels(records) {
  const byText = new Map();
  for (const r of usableRecords(records)) {
    const text = cleanText(r.underline);
    const key = text.replace(/\s+/g, " ");
    let entry = byText.get(key);
    if (!entry) {
      entry = { text, members: new Set(), thoughts: [] };
      byText.set(key, entry);
    }
    entry.members.add(cleanText(r.member));
    const thought = cleanText(r.thought);
    if (thought) entry.thoughts.push(thought);
  }
  return [...byText.values()].map((entry, i) => ({
    label: `#${i + 1}`,
    text: entry.text,
    memberCount: entry.members.size,
    thoughts: entry.thoughts,
  }));
}

// AI에게 보내는 내용. 이름과 사용자 ID는 들어가지 않는다.
export function buildUserPrompt(book, labels) {
  const lines = [
    "## 책 정보",
    `제목: ${cleanText(book?.title) || "(없음)"}`,
    `저자: ${cleanText(book?.author) || "(없음)"}`,
    `소개: ${cleanText(book?.description) || "(없음)"}`,
    "",
    "## 멤버들의 밑줄",
  ];
  for (const l of labels) {
    lines.push("", `${l.label} (멤버 ${l.memberCount}명이 밑줄)`, `문장: ${l.text}`);
    if (l.thoughts.length > 0) {
      lines.push("멤버들의 생각:");
      for (const t of l.thoughts) lines.push(`- ${t}`);
    }
  }
  return lines.join("\n");
}

function stripCodeFence(text) {
  const match = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(text);
  return match ? match[1] : text;
}

// AI 응답을 확인한다. 근거 라벨이 하나라도 없는 라벨이면 그 질문은 버린다.
// 화면에 보낼 인용문은 AI 텍스트가 아니라 원본 기록(labels)에서 가져온다.
export function validateQuestions(rawText, labels) {
  let data;
  try {
    data = JSON.parse(stripCodeFence(String(rawText ?? "")));
  } catch {
    return { questions: [], dropped: [], parseError: true };
  }

  const byLabel = new Map(labels.map((l) => [l.label, l]));
  const list = Array.isArray(data?.questions) ? data.questions : [];
  const kept = [];
  const dropped = [];

  for (const q of list) {
    const question = cleanText(q?.question);
    const evidence = Array.isArray(q?.evidence)
      ? [...new Set(q.evidence.map((e) => String(e).trim()))]
      : [];
    const unknown = evidence.filter((e) => !byLabel.has(e));

    let reason = null;
    if (!question) reason = "질문 문장이 없음";
    else if (evidence.length === 0) reason = "근거가 없음";
    else if (unknown.length > 0) reason = `없는 라벨 ${unknown.join(", ")}`;
    else if (evidence.length > MAX_EVIDENCE) reason = `근거가 ${MAX_EVIDENCE}개보다 많음`;

    if (reason) {
      dropped.push({ question, evidence, reason });
      continue;
    }
    kept.push({
      question,
      quotes: evidence.map((e) => ({
        text: byLabel.get(e).text,
        memberCount: byLabel.get(e).memberCount,
      })),
    });
  }

  return { questions: kept.slice(0, MAX_QUESTIONS), dropped, parseError: false };
}
