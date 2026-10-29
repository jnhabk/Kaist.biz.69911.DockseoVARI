import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, "data");
const storeFile = path.join(dataDir, "store.json");
try { process.loadEnvFile(path.join(root, ".env")); } catch { /* optional local configuration */ }
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT) || 3030;
const model = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const KST = "Asia/Seoul";
const makeId = () => randomUUID();
const token = (bytes = 24) => randomBytes(bytes).toString("base64url");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const isoNow = () => new Date().toISOString();
const clean = (v, max = 2000) => typeof v === "string" ? v.trim().slice(0, max) : "";
const asArray = (v) => Array.isArray(v) ? v : [];
let state = { users: [], spaces: [], meetings: [] };
let writeQueue = Promise.resolve();

async function loadStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const parsed = JSON.parse(await fs.readFile(storeFile, "utf8"));
    state = { users: asArray(parsed.users), spaces: asArray(parsed.spaces), meetings: asArray(parsed.meetings) };
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    await persist();
  }
}

function persist() {
  const snapshot = JSON.stringify(state, null, 2);
  writeQueue = writeQueue.then(async () => {
    await fs.writeFile(`${storeFile}.tmp`, snapshot, "utf8");
    await fs.rename(`${storeFile}.tmp`, storeFile);
  });
  return writeQueue;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const getUser = (id) => state.users.find((u) => u.id === id);
const getSpace = (id) => state.spaces.find((s) => s.id === id && !s.deletedAt);
const getMeeting = (id) => state.meetings.find((m) => m.id === id);
const isMember = (space, userId) => space?.members?.some((m) => m.userId === userId && !m.leftAt);
const membership = (space, userId) => space.members.find((m) => m.userId === userId && !m.leftAt);
const isOwner = (space, userId) => space.ownerId === userId;
const isSpaceStaff = (space, meeting, userId) => isOwner(space, userId) || meeting.hostId === userId;
const kstDateKey = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: KST, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const isEnded = (meeting) => Date.now() >= Date.parse(meeting.endAt);

async function bodyJson(req) {
  let raw = "";
  for await (const part of req) {
    raw += part;
    if (raw.length > 1_000_000) fail(413, "요청이 너무 커요.");
  }
  try { return raw ? JSON.parse(raw) : {}; }
  catch { fail(400, "JSON 형식이 올바르지 않아요."); }
}

function send(res, status, type, body, headers = {}) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
  res.end(body);
}
const json = (res, status, value) => send(res, status, "application/json; charset=utf-8", JSON.stringify(value));

function authenticate(req, optional = false) {
  const supplied = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "")?.[1];
  const user = supplied && state.users.find((u) => u.accessHash === hash(supplied) && !u.disabledAt);
  if (!user && !optional) fail(401, "개인 접속 링크로 다시 들어와 주세요.");
  return user || null;
}

function requireSpace(spaceId, userId) {
  const space = getSpace(spaceId);
  if (!space || !isMember(space, userId)) fail(404, "공간을 찾을 수 없어요.");
  return space;
}

function roundForViewer(meeting, userId) {
  const space = getSpace(meeting.spaceId);
  const counts = new Map();
  for (const record of meeting.records) counts.set(record.authorId, (counts.get(record.authorId) || 0) + 1);
  const attending = space.members.filter((m) => !m.leftAt && meeting.attendance[m.userId] === "attending");
  const ready = attending.filter((m) => (counts.get(m.userId) || 0) > 0).length;
  const members = space.members.filter((m) => !m.leftAt).map((m) => ({
    id: m.userId,
    name: getUser(m.userId)?.name || "탈퇴한 멤버",
    owner: space.ownerId === m.userId,
    host: meeting.hostId === m.userId,
    attendance: meeting.snapshot?.attendance?.[m.userId] || meeting.attendance[m.userId] || "unanswered",
    prepared: meeting.snapshot ? meeting.snapshot.preparedIds.includes(m.userId) : (counts.get(m.userId) || 0) > 0,
  }));
  const records = meeting.records
    .filter((r) => r.visibility === "public" || r.authorId === userId)
    .map((r) => ({ ...r, authorName: getUser(r.authorId)?.name || "탈퇴한 멤버" }));
  const sources = [...(meeting.book?.source ? [{ kind: "book", label: "도서 자료", ...meeting.book.source }] : [])];
  if (meeting.reference?.text || meeting.reference?.url) sources.push({ kind: "host", label: "host 제공 자료", url: meeting.reference.url, text: meeting.reference.text });
  return {
    ...meeting,
    records,
    members,
    readiness: meeting.snapshot
      ? { attending: meeting.snapshot.denominator, ready: meeting.snapshot.numerator, percent: meeting.snapshot.percent, goalReached: meeting.snapshot.denominator > 0 && meeting.snapshot.numerator / meeting.snapshot.denominator >= 0.75 }
      : { attending: attending.length, ready, percent: attending.length ? Math.round(ready / attending.length * 100) : null, goalReached: attending.length > 0 && ready / attending.length >= 0.75 },
    sources,
  };
}

function listSpaces(userId) {
  return state.spaces.filter((s) => !s.deletedAt && isMember(s, userId)).map((s) => ({ id: s.id, name: s.name, owner: s.ownerId === userId }));
}

function clearSessionShare(user) {
  const access = token(32);
  user.accessHash = hash(access);
  user.accessVersion = (user.accessVersion || 0) + 1;
  return access;
}

function inviteUrl(req, invite) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  return `${url.origin}/?invite=${encodeURIComponent(invite)}`;
}
function accessUrl(req, access) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  return `${url.origin}/?access=${encodeURIComponent(access)}`;
}

function publicUser(user) {
  return { id: user.id, name: user.name };
}

function meetingForMember(id, userId) {
  const meeting = getMeeting(id);
  if (!meeting) fail(404, "회차를 찾을 수 없어요.");
  const space = requireSpace(meeting.spaceId, userId);
  return { meeting, space };
}

function deadlineAt(meeting) {
  return Date.parse(meeting.startAt) - meeting.deadlineHours * 60 * 60 * 1000;
}

function usableLabels(meeting) {
  const space = getSpace(meeting.spaceId);
  const grouped = new Map();
  for (const r of meeting.records) {
    if (meeting.attendance[r.authorId] !== "attending") continue;
    const line = clean(r.quote, 1200);
    const thought = clean(r.thought, 2000);
    if (!line && !thought) continue;
    const key = line.replace(/\s+/g, " ");
    const entry = grouped.get(key) || { text: line, memberIds: new Set(), thoughts: [] };
    entry.memberIds.add(r.authorId);
    if (thought) entry.thoughts.push(thought);
    grouped.set(key, entry);
  }
  return [...grouped.values()].map((entry, index) => ({
    label: `#${index + 1}`,
    text: entry.text,
    memberCount: entry.memberIds.size,
    thoughts: entry.thoughts,
  }));
}

function cleanAiGuide(raw, labels, sources) {
  let data;
  try { data = JSON.parse(String(raw).replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")); }
  catch { throw new Error("AI 응답을 JSON으로 읽지 못했어요."); }
  const allowedKinds = ["opening", "core", "closing"];
  const questions = Array.isArray(data.questions) ? data.questions.slice(0, 5) : [];
  if (questions.length !== 5) throw new Error("발제문은 시작 1개, 핵심 3개, 마무리 1개 질문이어야 해요.");
  const cleaned = questions.map((q, i) => {
    const kind = allowedKinds.includes(q.kind) ? q.kind : i === 0 ? "opening" : i === 4 ? "closing" : "core";
    const question = clean(q.question, 600);
    const followUp = clean(q.followUp, 400);
    if (!question || !followUp) throw new Error("질문과 보조 질문을 모두 확인할 수 없어요.");
    return { kind, question, followUp };
  });
  if (cleaned.filter((q) => q.kind === "opening").length !== 1 || cleaned.filter((q) => q.kind === "core").length !== 3 || cleaned.filter((q) => q.kind === "closing").length !== 1) {
    cleaned[0].kind = "opening";
    cleaned[1].kind = "core"; cleaned[2].kind = "core"; cleaned[3].kind = "core"; cleaned[4].kind = "closing";
  }
  const textToAvoid = labels.flatMap((l) => l.thoughts).filter((x) => x.length > 24);
  for (const q of cleaned) {
    if (/누구님|누가 쓴|작성자|기록한 멤버/i.test(q.question) || textToAvoid.some((t) => q.question.includes(t) || q.followUp.includes(t))) {
      throw new Error("작성자나 개인 경험이 드러나는 발제문을 걸렀어요.");
    }
  }
  return { questions: cleaned, sources, generatedAt: isoNow(), mode: "ai" };
}

function discussionPrompt(meeting, labels) {
  const noRecord = labels.length === 0;
  const context = [
    `책 제목: ${clean(meeting.book.title, 300)}`,
    `저자: ${clean(meeting.book.author, 200) || "미상"}`,
    `국내 도서 검색 제공처 소개(공식 출처 여부 별도 확인): ${clean(meeting.book.description, 4000) || "없음"}`,
    `host 제공 자료(링크 내용은 자동 수집하지 않음): ${clean(meeting.reference?.text, 6000) || "없음"}`,
    noRecord ? "참석자 기록이 없습니다. 이 사실을 숨기지 말고 책 자료가 있으면 그 범위에서, 자료가 없으면 범용 질문을 만드세요. 책 장면이나 줄거리를 추측하지 마세요." : "참석 상태가 참석인 멤버들의 기록만 있습니다. 불참·미응답 멤버의 내용은 제외했습니다.",
    ...labels.map((l) => `${l.label} (공개 인용 ${l.memberCount}명): ${l.text || "(문구 없음)"}\n생각(비공개 포함, 아이디어로만 사용하고 구체적 정황이나 문장을 출력하지 말 것): ${l.thoughts.join(" / ") || "없음"}`),
  ].join("\n\n");
  return {
    system: "너는 소규모 독서모임의 발제를 돕는다. 입력 자료에 없는 책의 내용, 인물, 장면, 결말을 추측하지 않는다. 비공개 기록의 개인 경험이나 문장을 공개하지 않고 일반적인 토론 주제로만 바꾼다. 작성자를 지목하거나 누가 어떤 생각을 했는지 암시하지 않는다. 발제 질문 자체에는 기록 문장을 직접 인용하지 않는다. 다음 JSON만 출력한다: {\"questions\":[{\"kind\":\"opening|core|closing\",\"question\":\"...\",\"followUp\":\"...\"}]} 질문은 시작 1개, 핵심 3개, 마무리 1개이며 각각 보조 질문이 하나씩 있어야 한다. 한국어로, 모임에서 말하기 쉬운 자연스러운 질문으로 쓴다.",
    user: context,
  };
}

async function callAnthropic(meeting, labels) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY가 설정되지 않았어요.");
  const { system, user } = discussionPrompt(meeting, labels);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 3500, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Anthropic API 오류 (${response.status}): ${clean(data.error?.message, 300) || "요청 실패"}`);
  const output = asArray(data.content).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  return cleanAiGuide(output, labels, makeGuideSources(meeting));
}

function makeGuideSources(meeting) {
  const sources = [];
  if (meeting.book?.source?.url) sources.push({ title: meeting.book.source.title || "도서 정보", url: meeting.book.source.url, provider: meeting.book.source.provider || "도서 검색" });
  if (meeting.reference?.url) sources.push({ title: "host 제공 자료", url: meeting.reference.url, provider: "host 제공" });
  return sources;
}

async function generateFor(meeting, mode = "manual") {
  if (meeting.status !== "scheduled") throw new Error("취소된 회차는 발제문을 만들 수 없어요.");
  const generationId = makeId();
  meeting.generation = { ...(meeting.generation || {}), status: "generating", generationId, attempt: (meeting.generation?.attempt || 0) + 1, lastError: "" };
  const version = meeting.generation.version || 0;
  await persist();
  try {
    const labels = usableLabels(meeting);
    const guide = await callAnthropic(meeting, labels);
    if (meeting.generation.generationId !== generationId || meeting.generation.version !== version || meeting.status !== "scheduled") return;
    meeting.guide = guide;
    meeting.generation = { ...meeting.generation, status: "complete", firstAttemptFailed: false, nextAttemptAt: null, lastError: "" };
  } catch (err) {
    if (meeting.generation.generationId !== generationId || meeting.generation.version !== version) return;
    const attempt = meeting.generation.attempt || 1;
    meeting.generation = {
      ...meeting.generation,
      status: "failed",
      firstAttemptFailed: meeting.generation.firstAttemptFailed || !meeting.guide,
      lastError: clean(err.message, 400),
      nextAttemptAt: mode === "automatic" && attempt < 3 ? new Date(Date.now() + 60_000).toISOString() : null,
    };
    console.error(`[발제문 생성 실패] ${meeting.id}: ${err.message}`);
  }
  await persist();
}

function snapshotMeeting(meeting) {
  if (meeting.status !== "scheduled" || meeting.snapshot || Date.now() < Date.parse(meeting.startAt)) return;
  const space = getSpace(meeting.spaceId);
  const attending = space?.members.filter((m) => !m.leftAt && meeting.attendance[m.userId] === "attending") || [];
  const ready = attending.filter((m) => meeting.records.some((r) => r.authorId === m.userId)).map((m) => m.userId);
  meeting.snapshot = {
    capturedAt: isoNow(),
    attendeeIds: attending.map((m) => m.userId),
    attendance: Object.fromEntries(space.members.filter((m) => !m.leftAt).map((m) => [m.userId, meeting.attendance[m.userId] || "unanswered"])),
    preparedIds: ready,
    numerator: ready.length,
    denominator: attending.length,
    percent: attending.length ? Math.round(ready.length / attending.length * 100) : null,
  };
}

let scheduleRunning = false;
async function scheduleTick() {
  if (scheduleRunning) return;
  scheduleRunning = true;
  try {
    let changed = false;
    const jobs = [];
    for (const meeting of state.meetings) {
      if (meeting.status !== "scheduled") continue;
      if (!meeting.snapshot && Date.now() >= Date.parse(meeting.startAt)) { snapshotMeeting(meeting); changed = true; }
      const g = meeting.generation || (meeting.generation = { status: "idle", attempt: 0, version: 0 });
      if (!meeting.guide && ["idle", "queued"].includes(g.status) && Date.now() >= deadlineAt(meeting) && Date.now() < Date.parse(meeting.startAt)) {
        g.status = "queued"; g.version = (g.version || 0) + 1; changed = true; jobs.push(meeting);
      } else if (!meeting.guide && g.status === "failed" && g.nextAttemptAt && Date.now() < Date.parse(meeting.startAt) && Date.now() >= Date.parse(g.nextAttemptAt)) {
        jobs.push(meeting);
      }
    }
    if (changed) await persist();
    for (const meeting of jobs) void generateFor(meeting, "automatic");
  } finally { scheduleRunning = false; }
}

async function searchBooks(query) {
  if (!process.env.KAKAO_REST_API_KEY) fail(503, "Kakao REST API 키를 설정하거나 직접 등록해 주세요.");
  const url = new URL("https://dapi.kakao.com/v3/search/book");
  url.searchParams.set("query", query);
  url.searchParams.set("size", "10");
  url.searchParams.set("sort", "accuracy");
  const response = await fetch(url, { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) fail(502, `도서 검색이 실패했어요 (${response.status}). 직접 등록할 수 있어요.`);
  const payload = await response.json();
  return asArray(payload.documents).map((item) => {
    const isbn = clean(item.isbn, 40).split(/\s+/).find((value) => value.length === 13) || clean(item.isbn, 40).split(/\s+/)[0] || "";
    const rawImage = item.thumbnail || "";
    const cover = rawImage.replace(/^http:/, "https:");
    return {
      id: item.isbn || item.url,
      title: clean(item.title?.replace(/<[^>]*>/g, " "), 300),
      author: clean(asArray(item.authors).join(", "), 300),
      cover,
      isbn,
      description: clean(item.contents?.replace(/<[^>]*>/g, " "), 4000),
      source: { title: "다음 책 정보", provider: "Kakao Daum Search", url: item.url },
    };
  }).filter((book) => book.title);
}

async function api(req, res, url) {
  const method = req.method;
  const p = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const user = authenticate(req, (method === "POST" && ["spaces", "join"].includes(p[1])) || (method === "GET" && p.join("/") === "api/health"));

  if (method === "GET" && p.join("/") === "api/health") return json(res, 200, { ok: true });
  if (method === "POST" && p.join("/") === "api/spaces") {
    const body = await bodyJson(req);
    const name = clean(body.name, 80);
    const nick = clean(body.nickname, 50);
    if (!nick || !name) fail(400, "닉네임과 공간 이름을 입력해 주세요.");
    let newUser = user;
    let access = null;
    if (!newUser) {
      access = token(32);
      newUser = { id: makeId(), name: nick, accessHash: hash(access), createdAt: isoNow(), disabledAt: null };
      state.users.push(newUser);
    }
    const invite = token(12);
    const space = { id: makeId(), name, ownerId: newUser.id, inviteHash: hash(invite), members: [{ userId: newUser.id, joinedAt: isoNow(), leftAt: null }], createdAt: isoNow(), deletedAt: null };
    state.spaces.push(space);
    await persist();
    return json(res, 201, { token: access, user: publicUser(newUser), spaces: listSpaces(newUser.id), inviteUrl: inviteUrl(req, invite), alreadySignedIn: Boolean(user) });
  }
  if (method === "POST" && p.join("/") === "api/join") {
    const body = await bodyJson(req);
    const invite = clean(body.invite, 200); const nickname = clean(body.nickname, 50);
    if (!invite || !nickname) fail(400, "초대 코드와 닉네임을 입력해 주세요.");
    const space = state.spaces.find((s) => !s.deletedAt && s.inviteHash === hash(invite));
    if (!space) fail(404, "초대 코드가 만료되었어요. 공간 모임장에게 새 링크를 요청해 주세요.");
    let newUser = user;
    let key = null;
    if (!newUser) {
      key = token(32);
      newUser = { id: makeId(), name: nickname, accessHash: hash(key), createdAt: isoNow(), disabledAt: null };
      state.users.push(newUser);
    }
    if (!isMember(space, newUser.id)) space.members.push({ userId: newUser.id, joinedAt: isoNow(), leftAt: null });
    for (const meeting of state.meetings.filter((m) => m.spaceId === space.id)) meeting.attendance[newUser.id] ||= "unanswered";
    await persist();
    return json(res, 201, { token: key, user: publicUser(newUser), spaces: listSpaces(newUser.id), alreadySignedIn: Boolean(user) });
  }

  if (method === "GET" && p.join("/") === "api/me") {
    return json(res, 200, { user: publicUser(user), spaces: listSpaces(user.id) });
  }
  if (method === "GET" && p.join("/") === "api/book-search") {
    const query = clean(url.searchParams.get("q"), 160);
    if (!query) return json(res, 200, { books: [] });
    return json(res, 200, { books: await searchBooks(query) });
  }

  if (p[0] !== "api" || p[1] !== "spaces" || !p[2]) fail(404, "없는 주소예요.");
  const space = requireSpace(p[2], user.id);
  if (method === "GET" && p.length === 3) {
    const members = space.members.filter((m) => !m.leftAt).map((m) => ({ ...publicUser(getUser(m.userId)), owner: space.ownerId === m.userId }));
    const meetings = state.meetings.filter((m) => m.spaceId === space.id).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)).map((m) => ({ id: m.id, book: m.book, startAt: m.startAt, endAt: m.endAt, status: m.status, hostName: getUser(m.hostId)?.name || "탈퇴한 멤버", attendance: m.attendance[user.id] || "unanswered" }));
    return json(res, 200, { space: { id: space.id, name: space.name, owner: isOwner(space, user.id), members }, inviteUrl: isOwner(space, user.id) ? null : undefined, meetings });
  }
  if (method === "POST" && p[3] === "invite") {
    if (!isOwner(space, user.id)) fail(403, "공간 모임장만 초대를 새로 발급할 수 있어요.");
    const invite = token(12); space.inviteHash = hash(invite); await persist();
    return json(res, 200, { inviteUrl: inviteUrl(req, invite) });
  }
  if (method === "POST" && p[3] === "members" && p[4] === "reissue") {
    if (!isOwner(space, user.id)) fail(403, "공간 모임장만 개인 접속 링크를 재발급할 수 있어요.");
    const memberId = clean((await bodyJson(req)).memberId, 100);
    if (!isMember(space, memberId)) fail(404, "멤버를 찾을 수 없어요.");
    const targetUser = getUser(memberId); const access = clearSessionShare(targetUser);
    await persist();
    return json(res, 200, { accessUrl: accessUrl(req, access) });
  }
  if (method === "POST" && p[3] === "members" && p[4] === "transfer") {
    if (!isOwner(space, user.id)) fail(403, "공간 모임장만 권한을 넘길 수 있어요.");
    const memberId = clean((await bodyJson(req)).memberId, 100);
    if (memberId === user.id || !isMember(space, memberId)) fail(400, "권한을 넘길 멤버를 확인해 주세요.");
    space.ownerId = memberId; await persist(); return json(res, 200, { ok: true });
  }
  if (method === "DELETE" && p[3] === "members" && p[4]) {
    const memberId = p[4];
    if (memberId === user.id && isOwner(space, user.id)) fail(409, "먼저 다른 멤버에게 모임장 권한을 넘겨 주세요.");
    if (memberId !== user.id && !isOwner(space, user.id)) fail(403, "공간 모임장만 다른 멤버를 내보낼 수 있어요.");
    const target = membership(space, memberId); if (!target) fail(404, "멤버를 찾을 수 없어요.");
    for (const meeting of state.meetings.filter((m) => m.spaceId === space.id)) snapshotMeeting(meeting);
    target.leftAt = isoNow();
    for (const meeting of state.meetings.filter((m) => m.spaceId === space.id)) {
      if (meeting.hostId === memberId) meeting.hostId = space.ownerId;
      meeting.records = meeting.records.filter((r) => !(r.authorId === memberId && r.visibility === "private"));
      meeting.generation ||= { status: "idle", attempt: 0, version: 0 };
      if (!meeting.snapshot && !isEnded(meeting)) {
        meeting.generation.version = (meeting.generation.version || 0) + 1;
        meeting.generation.generationId = null;
        if ((meeting.guide || ["generating", "queued"].includes(meeting.generation.status)) && Date.now() < Date.parse(meeting.startAt)) {
          meeting.guide = null;
          meeting.generation.status = "idle";
          meeting.generation.attempt = 0;
          meeting.generation.nextAttemptAt = null;
          meeting.generation.firstAttemptFailed = false;
        }
      }
    }
    await persist(); return json(res, 200, { ok: true });
  }
  if (method === "DELETE" && p[3] === "space") {
    if (!isOwner(space, user.id)) fail(403, "공간 모임장만 공간을 보관·삭제할 수 있어요.");
    space.deletedAt = isoNow();
    for (const meeting of state.meetings.filter((m) => m.spaceId === space.id)) {
      if (meeting.status === "scheduled") { meeting.status = "cancelled"; meeting.cancelledAt = isoNow(); meeting.generation.version = (meeting.generation.version || 0) + 1; meeting.generation.generationId = null; meeting.generation.status = "cancelled"; meeting.generation.nextAttemptAt = null; }
    }
    await persist(); return json(res, 200, { ok: true });
  }

  if (method === "POST" && p[3] === "meetings" && p.length === 4) {
    const body = await bodyJson(req);
    const startAt = Date.parse(body.startAt); const endAt = Date.parse(body.endAt);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt <= Date.now() || endAt <= startAt) fail(400, "미래의 시작 시각과 그 이후의 종료 시각을 입력해 주세요.");
    const deadlineHours = Number(body.deadlineHours);
    if (![12, 24].includes(deadlineHours)) fail(400, "준비 마감은 시작 12시간 전 또는 24시간 전이어야 해요.");
    const book = validateBook(body.book);
    const hostId = clean(body.hostId, 100) || user.id;
    if (!isMember(space, hostId)) fail(400, "host는 공간 멤버여야 해요.");
    const attendance = Object.fromEntries(space.members.filter((m) => !m.leftAt).map((m) => [m.userId, "unanswered"]));
    const meeting = {
      id: makeId(), spaceId: space.id, book, hostId,
      startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), deadlineHours,
      attendance, records: [], status: "scheduled", createdBy: user.id, createdAt: isoNow(),
      reference: { text: "", url: "" }, guide: null,
      generation: { status: "idle", attempt: 0, version: 0, firstAttemptFailed: false, nextAttemptAt: null, lastError: "" }, snapshot: null,
    };
    state.meetings.push(meeting); await persist(); return json(res, 201, roundForViewer(meeting, user.id));
  }

  if (p[3] !== "meetings" || !p[4]) fail(404, "없는 주소예요.");
  const { meeting } = meetingForMember(p[4], user.id);
  if (method === "GET" && p.length === 5) return json(res, 200, roundForViewer(meeting, user.id));
  if (method === "POST" && p[5] === "attendance") {
    snapshotMeeting(meeting);
    if (meeting.status !== "scheduled" || isEnded(meeting)) fail(409, "종료되거나 취소된 회차의 참석 상태는 바꿀 수 없어요.");
    const answer = clean((await bodyJson(req)).status, 20);
    if (!['attending', 'absent', 'unanswered'].includes(answer)) fail(400, "참석, 불참, 미응답 중에서 선택해 주세요.");
    meeting.attendance[user.id] = answer; await persist(); return json(res, 200, roundForViewer(meeting, user.id));
  }
  if (method === "POST" && p[5] === "records") {
    snapshotMeeting(meeting);
    if (meeting.status !== "scheduled") fail(409, "취소된 회차에는 새 기록을 추가할 수 없어요.");
    const body = await bodyJson(req);
    const quote = clean(body.quote, 4000); const thought = clean(body.thought, 4000); const page = clean(body.page, 40);
    if (!quote && !thought) fail(400, "책 속 문구 또는 내 생각을 입력해 주세요.");
    const visibility = body.visibility === "private" ? "private" : "public";
    const now = isoNow();
    const record = { id: makeId(), authorId: user.id, quote, thought, page, visibility, createdAt: now, updatedAt: now };
    meeting.records.push(record); await persist(); return json(res, 201, roundForViewer(meeting, user.id));
  }
  if (p[5] === "records" && p[6]) {
    snapshotMeeting(meeting);
    const record = meeting.records.find((r) => r.id === p[6]);
    if (!record) fail(404, "기록을 찾을 수 없어요.");
    if (record.authorId !== user.id) fail(403, "본인 기록만 수정하거나 삭제할 수 있어요.");
    if (method === "PATCH") {
      const body = await bodyJson(req); const quote = clean(body.quote, 4000); const thought = clean(body.thought, 4000);
      if (!quote && !thought) fail(400, "책 속 문구 또는 내 생각을 입력해 주세요.");
      record.quote = quote; record.thought = thought; record.page = clean(body.page, 40); record.visibility = body.visibility === "private" ? "private" : "public"; record.updatedAt = isoNow();
      await persist(); return json(res, 200, roundForViewer(meeting, user.id));
    }
    if (method === "DELETE") {
      if (isEnded(meeting) && Date.parse(record.createdAt) < Date.parse(meeting.endAt)) fail(409, "모임 종료 전에 작성한 기록은 종료 후 삭제할 수 없어요.");
      meeting.records = meeting.records.filter((r) => r.id !== record.id); await persist(); return json(res, 200, roundForViewer(meeting, user.id));
    }
  }
  if (method === "PATCH" && p[5] === "schedule") {
    if (!isSpaceStaff(space, meeting, user.id)) fail(403, "host 또는 공간 모임장만 일정과 책을 수정할 수 있어요.");
    if (meeting.status !== "scheduled") fail(409, "취소된 회차는 수정할 수 없어요.");
    const body = await bodyJson(req); const startAt = Date.parse(body.startAt); const endAt = Date.parse(body.endAt);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt <= Date.now() || endAt <= startAt) fail(400, "미래의 시작 시각과 그 이후의 종료 시각을 입력해 주세요.");
    const deadlineHours = Number(body.deadlineHours); if (![12, 24].includes(deadlineHours)) fail(400, "준비 마감은 12시간 또는 24시간 전이어야 해요.");
    if (body.hostId && !isMember(space, body.hostId)) fail(400, "host는 공간 멤버여야 해요.");
    if (body.book) {
      const nextBook = validateBook(body.book);
      const identityChanged = nextBook.title !== meeting.book.title || nextBook.author !== meeting.book.author;
      const correction = body.bookCorrection === true;
      const replaceBook = identityChanged && !correction;
      const metadataChanged = JSON.stringify(nextBook) !== JSON.stringify(meeting.book);
      if (replaceBook && meeting.records.length) fail(409, "기록이 남아 있어 다른 책으로 바꿀 수 없어요. 새 회차를 만들어 주세요.");
      if (replaceBook && (meeting.guide || meeting.reference?.text || meeting.reference?.url) && !body.confirmBookChange) fail(409, "책을 바꾸면 발제문과 host 자료를 삭제해야 해요.");
      if (metadataChanged) meeting.book = nextBook;
      if (replaceBook) { meeting.guide = null; meeting.reference = { text: "", url: "" }; meeting.generation = { status: "idle", attempt: 0, version: (meeting.generation.version || 0) + 1, firstAttemptFailed: false, nextAttemptAt: null, lastError: "" }; }
      else if (metadataChanged) {
        meeting.generation.version = (meeting.generation.version || 0) + 1;
        meeting.generation.generationId = null;
        if (!meeting.guide) { meeting.generation.status = Date.now() >= deadlineAt(meeting) ? "queued" : "idle"; meeting.generation.attempt = 0; meeting.generation.nextAttemptAt = null; }
        else if (meeting.generation.status === "generating") meeting.generation.status = "complete";
      }
    }
    const nextHostId = clean(body.hostId, 100) || meeting.hostId;
    const hostChanged = nextHostId !== meeting.hostId;
    const timeChanged = new Date(startAt).toISOString() !== meeting.startAt || new Date(endAt).toISOString() !== meeting.endAt || deadlineHours !== meeting.deadlineHours;
    meeting.startAt = new Date(startAt).toISOString(); meeting.endAt = new Date(endAt).toISOString(); meeting.deadlineHours = deadlineHours; meeting.hostId = nextHostId;
    if (timeChanged) {
      meeting.generation.version = (meeting.generation.version || 0) + 1;
      meeting.generation.generationId = null;
      if (!meeting.guide) {
        meeting.generation.status = Date.now() >= deadlineAt(meeting) ? "queued" : "idle";
        meeting.generation.attempt = 0;
        meeting.generation.nextAttemptAt = null;
      } else if (meeting.generation.status === "generating") {
        meeting.generation.status = "complete";
      }
    }
    await persist(); return json(res, 200, roundForViewer(meeting, user.id));
  }
  if (method === "PATCH" && p[5] === "reference") {
    if (!isSpaceStaff(space, meeting, user.id)) fail(403, "host 또는 공간 모임장만 참고 자료를 수정할 수 있어요.");
    const body = await bodyJson(req); meeting.reference = { text: clean(body.text, 10000), url: safeUrl(body.url) };
    meeting.generation.version = (meeting.generation.version || 0) + 1; meeting.generation.generationId = null;
    if (!meeting.guide) { meeting.generation.status = Date.now() >= deadlineAt(meeting) ? "queued" : "idle"; meeting.generation.attempt = 0; meeting.generation.nextAttemptAt = null; }
    else if (meeting.generation.status === "generating") meeting.generation.status = "complete";
    await persist(); return json(res, 200, roundForViewer(meeting, user.id));
  }
  if (method === "POST" && p[5] === "generate") {
    if (user.id !== meeting.hostId) fail(403, "회차 host만 발제문을 만들 수 있어요.");
    const today = kstDateKey(new Date()); const meetingDay = kstDateKey(new Date(meeting.startAt));
    const withinHostWindow = today === meetingDay && Date.now() < Date.parse(meeting.endAt);
    const failedFirst = meeting.generation?.firstAttemptFailed && !meeting.guide;
    if (!withinHostWindow && !failedFirst) fail(403, "host 재생성은 모임 당일 종료 전까지만 가능해요. 최초 생성에 실패한 경우 다시 시도할 수 있어요.");
    if (meeting.status !== "scheduled") fail(409, "취소된 회차는 발제문을 만들 수 없어요.");
    meeting.generation.version = (meeting.generation.version || 0) + 1; meeting.generation.generationId = null;
    await generateFor(meeting, "manual"); return json(res, 200, roundForViewer(meeting, user.id));
  }
  if (method === "POST" && p[5] === "manual-guide") {
    if (user.id !== meeting.hostId) fail(403, "회차 host만 수기 발제문을 저장할 수 있어요.");
    if (meeting.guide || !meeting.generation?.firstAttemptFailed) fail(403, "AI 최초 생성에 실패한 경우에만 수기 발제문을 만들 수 있어요.");
    const body = await bodyJson(req); const lines = clean(body.questions, 5000).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (lines.length !== 5) fail(400, "시작 질문 1개, 핵심 질문 3개, 마무리 질문 1개를 각 줄에 하나씩 입력해 주세요.");
    const kinds = ["opening", "core", "core", "core", "closing"];
    meeting.generation.version = (meeting.generation.version || 0) + 1; meeting.generation.generationId = null;
    meeting.generation.status = "complete"; meeting.generation.nextAttemptAt = null; meeting.generation.lastError = "";
    meeting.guide = { mode: "manual", generatedAt: isoNow(), sources: makeGuideSources(meeting), questions: lines.map((question, i) => ({ kind: kinds[i], question, followUp: "이 질문에 대해 더 나누고 싶은 생각이 있나요?" })) };
    await persist(); return json(res, 200, roundForViewer(meeting, user.id));
  }
  if (method === "POST" && p[5] === "cancel") {
    if (!isSpaceStaff(space, meeting, user.id)) fail(403, "host 또는 공간 모임장만 회차를 취소할 수 있어요.");
    if (meeting.status !== "scheduled") fail(409, "이미 취소된 회차예요.");
    meeting.status = "cancelled"; meeting.cancelledAt = isoNow(); meeting.generation.version = (meeting.generation.version || 0) + 1; meeting.generation.generationId = null; meeting.generation.status = "cancelled"; meeting.generation.nextAttemptAt = null;
    await persist(); return json(res, 200, roundForViewer(meeting, user.id));
  }
  fail(404, "없는 주소예요.");
}

function safeUrl(value) {
  const raw = clean(value, 1000); if (!raw) return "";
  try { const u = new URL(raw); return ["http:", "https:"].includes(u.protocol) ? u.toString() : ""; }
  catch { return ""; }
}

function validateBook(raw) {
  const title = clean(raw?.title, 300); const author = clean(raw?.author, 300);
  if (!title || !author) fail(400, "책 제목과 저자를 입력해 주세요.");
  const cover = safeUrl(raw?.cover);
  const source = raw?.source && safeUrl(raw.source.url) ? { title: clean(raw.source.title, 200), provider: clean(raw.source.provider, 100), url: safeUrl(raw.source.url) } : null;
  return { title, author, cover, description: clean(raw?.description, 4000), isbn: clean(raw?.isbn, 30), source };
}

async function serveStatic(req, res, pathname) {
  const publicDir = path.join(root, "public");
  const map = { "/": "index.html", "/app.js": "app.js", "/styles.css": "styles.css" };
  const file = map[pathname]; if (!file) return false;
  const type = file.endsWith(".js") ? "text/javascript; charset=utf-8" : file.endsWith(".css") ? "text/css; charset=utf-8" : "text/html; charset=utf-8";
  send(res, 200, type, await fs.readFile(path.join(publicDir, file)), { "Content-Security-Policy": "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'" });
  return true;
}

await loadStore();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (req.method === "GET" && await serveStatic(req, res, url.pathname)) return;
    send(res, 404, "text/plain; charset=utf-8", "페이지를 찾을 수 없어요.");
  } catch (err) {
    console.error(`[요청 실패] ${err.message}`);
    json(res, err.status || 500, { error: err.status ? err.message : "요청을 처리하지 못했어요." });
  }
});

server.listen(port, host, () => {
  console.log(`독서 감상 기록 P0 프로토타입: http://${host}:${port}`);
  console.log(`데이터 파일: ${storeFile}`);
  if (!process.env.ANTHROPIC_API_KEY) console.log("ANTHROPIC_API_KEY가 없어 발제문 자동 생성은 실패 상태로 표시됩니다.");
  if (!process.env.KAKAO_REST_API_KEY) console.log("KAKAO_REST_API_KEY가 없어 책은 직접 등록해 주세요.");
});
setInterval(() => { void scheduleTick().catch((err) => console.error(`[예약 작업 오류] ${err.message}`)); }, 15_000).unref();
void scheduleTick();

process.on("SIGINT", () => server.close(() => process.exit(0)));
