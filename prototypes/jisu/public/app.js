const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];
const appRoot = $("#app");
const accountRoot = $("#account");
const modal = $("#modal");
const toastRoot = $("#toast");
const labels = { opening: "시작 질문", core: "핵심 질문", closing: "마무리 질문" };
const attendanceLabels = { attending: "참석", absent: "불참", unanswered: "미응답" };
const app = { token: localStorage.getItem("jisu-readingjournal-access") || "", user: null, spaces: [], spaceId: "", space: null, meetings: [], meetingId: "", meeting: null, invite: new URL(location.href).searchParams.get("invite") || "", bookResults: [], selectedBook: null, editingRecord: "", scheduleDraft: null, currentView: "" };

function esc(value = "") { return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function initial(value = "?_") { return esc([...String(value).trim()][0] || "?"); }
function formatKst(value, options = {}) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, ...options }).format(new Date(value));
}
function toKstInput(value) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const x = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${x.year}-${x.month}-${x.day}T${x.hour}:${x.minute}`;
}
function fromKstInput(value) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(value || "");
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5])).toISOString() : "";
}
function inputDefault(days = 1, hour = 19) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, hour - 9, 0));
  return toKstInput(base.toISOString());
}
function notify(message, isError = false) {
  toastRoot.textContent = message;
  toastRoot.className = `toast show${isError ? " error" : ""}`;
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => toastRoot.classList.remove("show"), 3000);
}
async function api(path, options = {}) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(app.token ? { Authorization: `Bearer ${app.token}` } : {}), ...options.headers };
  const res = await fetch(path, { ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined });
  let data = {};
  try { data = await res.json(); } catch { /* the server returned no JSON */ }
  if (!res.ok) {
    if (res.status === 401) { app.token = ""; app.user = null; localStorage.removeItem("jisu-readingjournal-access"); }
    throw new Error(data.error || `요청에 실패했어요 (${res.status}).`);
  }
  return data;
}
function saveToken(token) { app.token = token; localStorage.setItem("jisu-readingjournal-access", token); }
function setLocationParam(key, value) {
  const u = new URL(location.href);
  if (value) u.searchParams.set(key, value); else u.searchParams.delete(key);
  history.replaceState({}, "", u);
}
function accountView() {
  if (!app.user) { accountRoot.replaceChildren(); return; }
  accountRoot.innerHTML = `<div class="account"><span class="avatar">${initial(app.user.name)}</span><span class="account-name">${esc(app.user.name)} · 게스트</span><button type="button" data-action="copy-access" title="개인 접속 링크 복사">접속 링크</button><button type="button" data-action="logout" title="이 기기에서 로그아웃">로그아웃</button></div>`;
}
function coverMarkup(book, compact = false) {
  return book?.cover ? `<img class="cover" src="${esc(book.cover)}" alt="${esc(book.title)} 표지" loading="lazy" referrerpolicy="no-referrer"><div class="cover-fallback" hidden>${esc(book.title || "도서")}</div>` : `<div class="cover-fallback">${esc(book?.title || "도서")}</div>`;
}
function calendarMarkup(value) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(value));
  const date = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(date.year); const month = Number(date.month); const meetingDay = Number(date.day);
  const offset = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weekCount = Math.ceil((offset + dayCount) / 7);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const cells = [...Array(offset).fill("<span class=\"calendar-empty\" aria-hidden=\"true\"></span>"), ...Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    return `<span class="calendar-day${day === meetingDay ? " is-meeting" : ""}"${day === meetingDay ? ` aria-label="모임 날짜 ${month}월 ${day}일"` : ""}>${day}</span>`;
  })].join("");
  return `<div class="round-calendar" aria-label="${year}년 ${month}월 모임 달력"><div class="calendar-title">${year}년 ${month}월</div><div class="calendar-weekdays">${weekdays.map((day) => `<span>${day}</span>`).join("")}</div><div class="calendar-days weeks-${weekCount}">${cells}</div></div>`;
}
function formatClockKst(value) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}
function bookFields(book = {}, draftName = "book") {
  return `<input type="hidden" name="${draftName}" value="${esc(JSON.stringify(book))}">`;
}
function shell(content, showSpaces = true) {
  const switcher = showSpaces && app.spaces.length ? `<select class="select" id="space-select" aria-label="모임 공간 전환">${app.spaces.map((s) => `<option value="${esc(s.id)}" ${s.id === app.spaceId ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>` : "";
  appRoot.innerHTML = `${switcher ? `<div class="toolbar" style="margin-bottom:20px"><span class="hint">내 모임 공간</span>${switcher}</div>` : ""}${content}`;
  accountView();
}
function renderLanding(error = "") {
  const inviteField = app.invite ? `<input type="hidden" name="invite" value="${esc(app.invite)}">` : `<div class="field"><label for="invite">초대 코드</label><input id="invite" name="invite" autocomplete="off" placeholder="모임장에게 받은 초대 코드" required></div>`;
  appRoot.innerHTML = `<section class="hero"><div><p class="eyebrow">기록이 대화가 되는 모임</p><h1>읽은 만큼, 나눌 이야기가 쌓여요.</h1><p>게스트로 접속해 공간을 만들거나 초대 링크로 참여하세요. 계정 가입 없이 시작합니다.</p></div></section>${error ? `<p class="status-line error">${esc(error)}</p>` : ""}<div class="grid"><section class="panel"><h2 class="form-title">새 독서 공간 만들기</h2><form data-form="create-space" class="stack"><div class="field"><label>내 닉네임</label><input name="nickname" maxlength="50" required autocomplete="nickname" placeholder="모임에서 불릴 이름"></div><div class="field"><label>공간 이름</label><input name="name" maxlength="80" required placeholder="예: 토요일 책모임"></div><div class="note-box">개인 접속 링크는 비공개 기록까지 볼 수 있는 열쇠입니다. 본인만 보관하고 초대 링크와 따로 관리하세요.</div><button class="button" type="submit">공간 만들기</button></form></section><section class="panel"><h2 class="form-title">초대받은 공간 참여하기</h2><form data-form="join" class="stack">${inviteField}<div class="field"><label>내 닉네임</label><input name="nickname" maxlength="50" required autocomplete="nickname" placeholder="모임에서 불릴 이름"></div><div class="note-box">참여하면 공간 멤버에게 내 공개 기록과 닉네임이 보입니다. 비공개 기록 원문은 본인만 볼 수 있어요.</div><button class="button secondary" type="submit">공간에 참여</button></form></section></div>`;
  accountView();
}
function joinForm() {
  const invite = app.invite ? `<input type="hidden" name="invite" value="${esc(app.invite)}">` : `<div class="field"><label>초대 코드</label><input name="invite" required autocomplete="off" placeholder="모임장에게 받은 초대 코드"></div>`;
  return `<form data-form="join" class="stack">${invite}<div class="field"><label>내 닉네임</label><input name="nickname" maxlength="50" required value="${esc(app.user?.name || "")}" placeholder="모임에서 불릴 이름"></div><div class="note-box">참여하면 공간 멤버에게 내 공개 기록과 닉네임이 보입니다. 비공개 기록 원문은 본인만 볼 수 있어요.</div><button class="button" type="submit">공간에 참여</button></form>`;
}
function renderHome() {
  const cards = app.spaces.map((s) => `<button type="button" class="card space-card" data-action="open-space" data-id="${esc(s.id)}"><div class="actions"><span class="badge">${s.owner ? "모임장" : "멤버"}</span></div><h3 style="margin-top:10px">${esc(s.name)}</h3><p>공간 열기 →</p></button>`).join("");
  shell(`<section class="hero"><div><p class="eyebrow">독서바리 · 게스트 공간</p><h1>내 독서모임</h1><p>한 사람도 여러 모임에 참여할 수 있어요. 공간을 선택해 회차와 기록을 확인하세요.</p></div><div class="actions"><button class="button" data-action="new-space">＋ 공간 만들기</button><button class="button outline" data-action="join-space">초대 코드로 참여</button></div></section><div class="space-grid">${cards || `<section class="panel empty">아직 참여 중인 공간이 없어요.</section>`}</div>`, false);
}
function spaceSettings() {
  const s = app.space;
  const members = s.members.map((m) => `<div class="member-row"><div class="member-name"><span class="avatar">${initial(m.name)}</span><strong>${esc(m.name)}</strong>${m.owner ? `<span class="badge">모임장</span>` : ""}${m.id === app.user.id ? `<span class="badge neutral">나</span>` : ""}</div><div class="member-actions">${s.owner ? `${m.id !== app.user.id ? `<button class="button outline small" data-action="transfer-owner" data-id="${esc(m.id)}">모임장 넘기기</button><button class="button danger small" data-action="remove-member" data-id="${esc(m.id)}">내보내기</button>` : ""}<button class="button outline small" data-action="reissue-member" data-id="${esc(m.id)}">${m.id === app.user.id ? "내 링크 재발급" : "접속 링크 재발급"}</button>` : ""}</div></div>`).join("");
  return `<section class="section-card panel"><div class="section-head" style="margin-top:0"><h2>공간 멤버</h2><div class="actions">${s.owner ? `<button class="button secondary small" data-action="new-invite">초대 링크 새로 발급</button><button class="button danger small" data-action="delete-space">공간 보관·삭제</button>` : `<button class="button outline small" data-action="leave-space">공간 나가기</button>`}</div></div><div class="members">${members}</div>${s.owner ? `<p class="hint">개인 접속 링크 재발급은 기존 링크와 세션을 무효화합니다. 새 링크를 해당 멤버에게 안전하게 전달하세요.</p>` : ""}</section>`;
}
function renderSpace() {
  const meetings = app.meetings.map((m) => `<button type="button" class="card meeting-card" data-action="open-meeting" data-id="${esc(m.id)}">${coverMarkup(m.book, true)}<div><span class="badge ${m.status === "cancelled" ? "danger" : ""}">${m.status === "cancelled" ? "취소됨" : formatKst(m.startAt, { year: undefined, month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}</span><h3 style="margin-top:7px">${esc(m.book.title)}</h3><p>${esc(m.book.author)} · host ${esc(m.hostName)}</p><p>내 응답: ${attendanceLabels[m.attendance] || "미응답"}</p></div></button>`).join("");
  shell(`<a class="back" href="#" data-action="back-home">← 내 공간 목록</a><section class="hero"><div><p class="eyebrow">독서모임 공간</p><h1>${esc(app.space.name)}</h1><p>${app.space.members.length}명이 함께 읽고 있어요. 회차를 열고 읽으며 떠오른 문장과 생각을 남겨 보세요.</p></div><div class="actions"><button class="button outline" data-action="join-space">다른 공간 참여</button><button class="button" data-action="show-create-meeting">＋ 새 회차</button></div></section>${spaceSettings()}<div class="section-head"><h2>모임 회차</h2><span class="hint">지난 회차도 열람할 수 있어요</span></div><div class="meeting-list">${meetings || `<section class="panel empty">아직 회차가 없어요. 첫 모임 일정을 만들어 보세요.</section>`}</div>`);
}
function bookPanel(book, query = "") {
  const resultCards = app.bookResults.map((b, i) => `<button type="button" class="book-result" data-action="choose-book" data-index="${i}">${coverMarkup(b, true)}<span><strong>${esc(b.title)}</strong><small>${esc(b.author)}${b.isbn ? ` · ISBN ${esc(b.isbn)}` : ""}</small></span></button>`).join("");
  return `<div class="field full"><label>도서 검색</label><div class="toolbar"><input class="input" id="book-query" value="${esc(query)}" placeholder="책 제목 또는 저자 검색"><button type="button" class="button secondary" data-action="search-books">검색</button></div><small>카카오 Daum 도서 검색 결과를 사용합니다. 검색 키 설정이 없으면 아래에서 직접 등록할 수 있어요.</small>${app.bookError ? `<small class="status-line error">${esc(app.bookError)}</small>` : ""}<div class="book-results">${resultCards}</div></div>`;
}
function bookEntry(book, selected) {
  const b = selected || book || {};
  return `<div class="field full"><span class="field-label">선택한 책</span><div class="book-result">${coverMarkup(b, true)}<span><strong>${esc(b.title || "책을 검색하거나 직접 입력하세요")}</strong><small>${esc(b.author || "제목과 저자는 필수입니다.")}</small></span></div></div><div class="field"><label>책 제목</label><input name="bookTitle" maxlength="300" required value="${esc(b.title || "")}" placeholder="책 제목"></div><div class="field"><label>저자</label><input name="bookAuthor" maxlength="300" required value="${esc(b.author || "")}" placeholder="저자"></div><input type="hidden" name="bookCover" value="${esc(b.cover || "")}"><input type="hidden" name="bookDescription" value="${esc(b.description || "")}"><input type="hidden" name="bookIsbn" value="${esc(b.isbn || "")}"><input type="hidden" name="bookSource" value="${esc(JSON.stringify(b.source || null))}">`;
}
function meetingForm(meeting = null) {
  const selected = app.selectedBook;
  const book = selected || meeting?.book || {};
  const start = app.scheduleDraft?.startAt || (meeting ? toKstInput(meeting.startAt) : inputDefault());
  const end = app.scheduleDraft?.endAt || (meeting ? toKstInput(meeting.endAt) : toKstInput(fromKstInput(start) ? new Date(Date.parse(fromKstInput(start)) + 2 * 60 * 60_000).toISOString() : new Date(Date.now() + 26 * 60 * 60_000).toISOString()));
  const deadlineHours = app.scheduleDraft?.deadlineHours || meeting?.deadlineHours || 12;
  const hostId = app.scheduleDraft?.hostId || meeting?.hostId || app.user.id;
  const purpose = meeting ? "schedule" : "create-meeting";
  const members = app.space.members.map((m) => `<option value="${esc(m.id)}" ${m.id === hostId ? "selected" : ""}>${esc(m.name)}${m.owner ? " · 모임장" : ""}</option>`).join("");
  const createName = meeting ? "일정과 책 수정" : "회차 만들기";
  return `<form data-form="${purpose}" data-id="${meeting ? esc(meeting.id) : ""}" class="stack"><div class="form-grid">${bookPanel(book, app.bookQuery || "")}${bookEntry(book, selected)}<div class="field"><label>시작 시각 (한국 시간)</label><input type="datetime-local" name="startAt" required value="${esc(start)}"></div><div class="field"><label>종료 시각 (한국 시간)</label><input type="datetime-local" name="endAt" required value="${esc(end)}"><small>새 회차의 기본 종료는 시작 2시간 뒤입니다.</small></div><div class="field"><label>준비 마감</label><select name="deadlineHours"><option value="24" ${deadlineHours == 24 ? "selected" : ""}>시작 24시간 전</option><option value="12" ${deadlineHours == 12 ? "selected" : ""}>시작 12시간 전</option></select></div><div class="field"><label>회차 host</label><select name="hostId">${members}</select></div></div><p class="hint">모든 일정은 한국 시간(Asia/Seoul)으로 표시됩니다. 마감 시점에 참석 기록을 모아 발제문 생성을 시작합니다.</p><div class="form-actions"><button class="button" type="submit">${createName}</button></div></form>`;
}
function readiness(meeting) {
  const list = meeting.members.map((m) => `<div class="readiness-row"><span>${esc(m.name)} ${m.attendance === "attending" ? "· 참석" : m.attendance === "absent" ? "· 불참" : "· 미응답"}</span><span class="badge ${m.attendance === "attending" ? (m.prepared ? "" : "warn") : "neutral"}">${m.attendance === "attending" ? (m.prepared ? "준비 완료" : "미작성") : "참여율 제외"}</span></div>`).join("");
  const r = meeting.readiness;
  return `<div class="metric"><strong>${r.ready}/${r.attending}</strong><span>참석자 기록 완료${r.percent == null ? " · 참석자 없음" : ` · ${r.percent}%`}</span></div><div class="progress"><span style="width:${r.percent ?? 0}%"></span></div>${r.goalReached ? `<p class="badge">시험 목표 75% 달성</p>` : r.attending ? `<p class="hint">첫 시험 기준: 참석자 4명 중 3명 이상 기록</p>` : `<p class="hint">참석자를 선택하면 준비율을 계산해요.</p>`}<div class="readiness-list">${list}</div>`;
}
function renderRecordCard(r, meeting) {
  const own = r.authorId === app.user.id;
  const oldCannotDelete = Date.now() >= Date.parse(meeting.endAt) && Date.parse(r.createdAt) < Date.parse(meeting.endAt);
  const meta = `${r.page ? `p. ${esc(r.page)} · ` : ""}${esc(r.authorName)} · ${r.visibility === "public" ? "모두 공개" : "나만 보기"}${r.updatedAt !== r.createdAt ? ` · 수정 ${esc(formatKst(r.updatedAt, { year: undefined, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))}` : ""}`;
  if (own && app.editingRecord === r.id) return `<article class="record-card"><form data-form="record-edit" data-id="${esc(r.id)}" class="stack"><div class="field"><label>책 속 문구</label><textarea name="quote" maxlength="4000">${esc(r.quote)}</textarea></div><div class="field"><label>내 생각</label><textarea name="thought" maxlength="4000">${esc(r.thought)}</textarea></div><div class="field"><label>페이지 (선택)</label><input name="page" value="${esc(r.page)}" maxlength="40"></div><div class="pill-row"><button class="pill" type="button" data-action="set-record-visibility" data-value="public" aria-pressed="${r.visibility === "public"}">모두 공개</button><button class="pill" type="button" data-action="set-record-visibility" data-value="private" aria-pressed="${r.visibility === "private"}">나만 보기</button><input type="hidden" name="visibility" value="${esc(r.visibility)}"></div><p class="hint">비공개 원문은 본인만 볼 수 있지만, 참석 기록의 생각은 AI가 일반 질문을 만드는 데 활용될 수 있어요.</p><div class="form-actions"><button type="button" class="button outline" data-action="cancel-edit">취소</button><button class="button" type="submit">수정 저장</button></div></form></article>`;
  return `<article class="record-card"><div class="record-top"><strong>${esc(r.authorName)}</strong><div class="actions">${own ? `<button class="button outline small" data-action="edit-record" data-id="${esc(r.id)}">수정</button>${!oldCannotDelete ? `<button class="button danger small" data-action="delete-record" data-id="${esc(r.id)}">삭제</button>` : ""}` : ""}</div></div>${r.quote ? `<p class="quote">${esc(r.quote)}</p>` : ""}${r.thought ? `<p class="thought">${esc(r.thought)}</p>` : ""}<div class="record-meta">${meta}</div></article>`;
}
function renderSources(meeting) {
  return meeting.sources.length ? `<div class="source-list">${meeting.sources.map((s) => `<article class="source-card"><strong>${esc(s.label || s.title || "자료")}</strong>${s.url ? `<p><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.url)}</a></p>` : ""}${s.text ? `<p>${esc(s.text)}</p>` : ""}</article>`).join("")}</div>` : `<p class="hint">아직 참고 자료가 없어요.</p>`;
}
function guidePanel(meeting) {
  const guide = meeting.guide;
  const g = meeting.generation || {};
  const isHost = app.user.id === meeting.hostId;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(meeting.startAt));
  const canRegenerate = isHost && today === day && Date.now() < Date.parse(meeting.endAt) && meeting.status === "scheduled";
  const canRecover = isHost && !guide && g.firstAttemptFailed && meeting.status === "scheduled";
  const statusText = g.status === "generating" || g.status === "queued" ? `발제문 생성 중 <span class="spinner"></span>` : g.status === "failed" ? `생성에 실패했어요${g.lastError ? ` · ${esc(g.lastError)}` : ""}` : g.status === "complete" ? `발제문 공개 · ${guide?.mode === "manual" ? "host 수기 작성" : "AI 생성"}` : "준비 마감에 자동으로 발제문을 생성합니다.";
  return `<section class="section-card panel"><div class="section-head" style="margin-top:0"><h2>모임 발제문</h2>${guide ? `<span class="badge">${guide.mode === "manual" ? "host 작성" : "AI 생성"}</span>` : ""}${canRegenerate ? `<button class="button secondary" data-action="generate-guide">${guide ? "AI 발제문 다시 만들기" : g.status === "failed" ? "다시 시도" : "AI 발제문 만들기"}</button>` : ""}</div><p class="status-line ${g.status === "failed" ? "error" : ""}">${statusText}</p>${guide ? `<div class="meeting-guide" style="margin-top:13px">${guide.questions.map((q) => `<article class="question-card"><span class="eyebrow">${labels[q.kind] || "발제 질문"}</span><h3>${esc(q.question)}</h3><p class="follow-up">보조 질문 · ${esc(q.followUp)}</p></article>`).join("")}</div>` : `<div class="note-box" style="margin-top:12px">발제문은 생성 즉시 공간 멤버에게 공개됩니다. 나만 보기 기록은 AI가 참고하지만, 개인 경험을 직접 인용하거나 누구의 이야기인지 드러내지 않도록 질문으로 바꿉니다.${g.status === "failed" ? " 자동 재시도 후에도 실패하면 host가 모임 전 수기 발제문을 작성할 수 있어요." : ""}</div>`}${canRecover ? `<form data-form="manual-guide" class="stack" style="margin-top:16px"><div class="field"><label>최초 생성 실패 시 수기 발제문</label><textarea name="questions" required placeholder="각 질문을 한 줄에 하나씩 입력하세요.\n1. 시작 질문\n2–4. 핵심 질문 3개\n5. 마무리 질문" rows="7"></textarea><small>5개 질문을 입력하면 보조 질문을 자동으로 붙여 즉시 공간 전체에 공개합니다.</small></div><button class="button" type="submit">수기 발제문 저장</button></form>` : ""}${isHost && !guide && !g.firstAttemptFailed ? `<p class="hint">최초 AI 생성 실패 전에는 수기 작성이 열리지 않습니다.</p>` : ""}<h3>회차 참고 자료</h3>${renderSources(meeting)}${isHost && meeting.status === "scheduled" ? `<form data-form="reference" data-id="${esc(meeting.id)}" class="stack" style="margin-top:12px"><div class="field"><label>host가 제공하는 자료 본문</label><textarea name="text" maxlength="10000" placeholder="공식 도서 자료를 붙여넣거나, 모임에서 참고할 내용을 적어 주세요.">${esc(meeting.reference?.text || "")}</textarea><small>AI는 아래에 붙여넣은 본문만 사용하며, 링크 내용을 자동 수집하지 않습니다.</small></div><div class="field"><label>선택 출처 링크</label><input name="url" type="url" value="${esc(meeting.reference?.url || "")}" placeholder="https://..."></div><button class="button outline small" type="submit">host 자료 저장</button></form>` : ""}</section>`;
}
function renderMeeting() {
  const m = app.meeting;
  const s = app.space;
  const isHost = app.user.id === m.hostId;
  const isStaff = isHost || s.owner;
  const ownCount = m.records.filter((r) => r.authorId === app.user.id).length;
  const publicRecords = m.records;
  const status = m.status === "cancelled" ? `<span class="badge danger">취소됨</span>` : Date.now() >= Date.parse(m.endAt) ? `<span class="badge neutral">종료</span>` : `<span class="badge">예정</span>`;
  const recordList = publicRecords.map((r) => renderRecordCard(r, m)).join("");
  const defaultRecordVisibility = "public";
  const hostOptions = m.members.map((u) => `<option value="${esc(u.id)}" ${u.id === m.hostId ? "selected" : ""}>${esc(u.name)}</option>`).join("");
  const editSelected = app.selectedBook || m.book;
  shell(`<a class="back" href="#" data-action="back-space">← ${esc(s.name)}</a><header class="round-head"><div class="round-book">${coverMarkup(m.book)}<div class="round-book-copy"><h1>${esc(m.book.title)}</h1><p class="round-book-author">${esc(m.book.author)}</p>${m.book.isbn ? `<p class="round-book-isbn">ISBN ${esc(m.book.isbn)}</p>` : ""}<p class="round-book-description">${esc(m.book.description || "등록된 책 소개가 없어요.")}</p>${(m.book.description || "").length > 65 ? `<button type="button" class="round-book-description-toggle" data-book-description-toggle aria-expanded="false" aria-label="책 소개 더 보기">… 더 보기</button>` : ""}</div></div><section class="round-schedule"><div class="round-schedule-calendar">${calendarMarkup(m.startAt)}</div><div class="round-schedule-info"><div><span>일정</span><strong>${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(m.startAt))}</strong></div><div><span>시간</span><strong>${formatClockKst(m.startAt)} — ${formatClockKst(m.endAt)}</strong></div><div><span>호스트</span><strong>${esc(m.members.find((x) => x.id === m.hostId)?.name || "탈퇴한 멤버")}</strong></div></div><div class="actions round-actions">${isStaff && m.status === "scheduled" ? `<button class="button outline" data-action="toggle-schedule">${app.scheduleOpen ? "일정 수정 닫기" : "일정·책 수정"}</button><button class="button danger" data-action="cancel-meeting">회차 취소</button>` : ""}<div class="round-status">${status}<span class="badge neutral">준비 마감 ${m.deadlineHours}시간 전</span></div></div></section></header><div class="two-col"><div><section class="section-card panel"><h2>참석 응답</h2><p class="hint">내 참석 여부를 선택하세요. 미응답과 불참은 준비율에서 제외됩니다.</p><div class="pill-row">${[["attending","참석"],["absent","불참"],["unanswered","미응답"]].map(([value,text]) => `<button type="button" class="pill" data-action="attendance" data-value="${value}" aria-pressed="${m.attendance[app.user.id] === value}">${text}</button>`).join("")}</div></section><section class="section-card panel"><h2>내 기록${ownCount ? ` · ${ownCount}건` : ""}</h2><form data-form="record-new" data-id="${esc(m.id)}" class="stack"><div class="field"><label>책 속 문구 <span class="hint">선택</span></label><textarea name="quote" maxlength="4000" placeholder="마음에 남은 문장을 적어 보세요"></textarea></div><div class="field"><label>내 생각 <span class="hint">선택</span></label><textarea name="thought" maxlength="4000" placeholder="왜 인상 깊었나요? 관련된 경험이 있나요? 함께 이야기하고 싶은 것은 무엇인가요?"></textarea></div><div class="field"><label>페이지 (선택)</label><input name="page" maxlength="40" placeholder="예: 42"></div><div class="field"><label>공개 범위</label><div class="pill-row"><button type="button" class="pill" data-action="new-record-visibility" data-value="public" aria-pressed="true">모두 공개</button><button type="button" class="pill" data-action="new-record-visibility" data-value="private" aria-pressed="false">나만 보기</button><input type="hidden" name="visibility" value="public"></div></div><div class="privacy-note">모두 공개로 저장하면 공간 멤버에게 내 이름과 원문이 보입니다. 나만 보기로 저장하면 원문은 나만 볼 수 있지만, 참석 기록은 AI 발제문에 활용되어 일반적인 질문으로 바뀔 수 있습니다. 책 속 문구는 발제문에서 직접 인용될 수 있습니다.</div><button class="button" type="submit" ${m.status === "cancelled" ? "disabled" : ""}>기록 저장</button></form></section><section class="section-card panel"><h2>공간 기록 <span class="hint">· 공개 기록은 모두 볼 수 있고 비공개 기록은 본인에게만 보입니다</span></h2><div class="record-list">${recordList || `<p class="hint">아직 기록이 없어요. 먼저 떠오른 문장이나 생각을 남겨 보세요.</p>`}</div></section></div><aside><section class="section-card panel"><h2>준비 현황</h2>${readiness(m)}</section>${guidePanel(m)}${isStaff && m.status === "scheduled" && app.scheduleOpen ? `<section class="section-card panel"><h2>일정과 책 수정</h2><form data-form="schedule" data-id="${esc(m.id)}" class="stack"><div class="form-grid"><div class="field"><label>시작 시각 (한국 시간)</label><input type="datetime-local" name="startAt" required value="${esc(app.scheduleDraft?.startAt || toKstInput(m.startAt))}"></div><div class="field"><label>종료 시각 (한국 시간)</label><input type="datetime-local" name="endAt" required value="${esc(app.scheduleDraft?.endAt || toKstInput(m.endAt))}"></div><div class="field"><label>준비 마감</label><select name="deadlineHours"><option value="24" ${(app.scheduleDraft?.deadlineHours || m.deadlineHours) == 24 ? "selected" : ""}>24시간 전</option><option value="12" ${(app.scheduleDraft?.deadlineHours || m.deadlineHours) == 12 ? "selected" : ""}>12시간 전</option></select></div><div class="field"><label>host 지정</label><select name="hostId">${hostOptions}</select></div></div><details><summary>책 수정</summary><div class="stack" style="margin-top:12px"><div class="field"><label><input type="checkbox" name="bookCorrection" value="yes"> 제목·저자·표지는 같은 책의 정보 수정입니다</label><small>다른 책으로 바꾸려면 기록이 없는 회차여야 합니다.</small></div>${bookPanel(editSelected, app.bookQuery || "")}${bookEntry(m.book, app.selectedBook)}</div></details><button class="button outline" type="submit">일정 저장</button></form></section>` : ""}</aside></div>`);
}

async function refreshMe() {
  const me = await api("/api/me"); app.user = me.user; app.spaces = me.spaces;
  if (!app.spaceId || !app.spaces.some((s) => s.id === app.spaceId)) app.spaceId = app.spaces[0]?.id || "";
  if (app.spaceId) await refreshSpace();
}
async function refreshSpace() {
  const data = await api(`/api/spaces/${encodeURIComponent(app.spaceId)}`);
  app.space = data.space; app.meetings = data.meetings;
  if (app.meetingId) await refreshMeeting();
}
async function refreshMeeting() { app.meeting = await api(`/api/spaces/${encodeURIComponent(app.spaceId)}/meetings/${encodeURIComponent(app.meetingId)}`); }
function render() {
  app.scheduleOpen ??= false;
  if (!app.token) return renderLanding();
  accountView();
  if (!app.user) return;
  if (!app.spaces.length) return renderLanding();
  if (!app.spaceId) return renderHome();
  if (app.meetingId && app.meeting) return renderMeeting();
  if (app.space) return renderSpace();
  renderHome();
}
async function init() {
  const url = new URL(location.href);
  if (url.searchParams.has("access")) {
    saveToken(url.searchParams.get("access"));
    url.searchParams.delete("access"); history.replaceState({}, "", url);
  }
  if (app.invite) app.invite = app.invite.trim();
  if (!app.token) return renderLanding();
  try { await refreshMe(); render(); if (app.invite) showModal("초대된 공간 참여", joinForm()); }
  catch (err) { renderLanding(err.message); }
  setInterval(async () => {
    if (!app.token || !app.spaceId) return;
    try { await refreshSpace(); if (app.meetingId) { await refreshMeeting(); if (app.currentView === "meeting") renderMeeting(); } }
    catch { /* keep the view responsive during a short connection loss */ }
  }, 30_000);
}

function formValues(form) { return Object.fromEntries(new FormData(form).entries()); }
function makeBook(fields) {
  let source = null; try { source = JSON.parse(fields.bookSource || "null"); } catch { source = null; }
  return { title: fields.bookTitle, author: fields.bookAuthor, cover: fields.bookCover || "", description: fields.bookDescription || "", isbn: fields.bookIsbn || "", source };
}
async function loadSpace(id) { app.spaceId = id; app.meetingId = ""; app.meeting = null; app.scheduleOpen = false; app.selectedBook = null; app.bookResults = []; await refreshSpace(); app.currentView = "space"; renderSpace(); }
async function submit(form) {
  const type = form.dataset.form; const f = formValues(form); const id = form.dataset.id;
  try {
    if (type === "create-space") {
      const oldIds = new Set(app.spaces.map((s) => s.id));
      const result = await api("/api/spaces", { method: "POST", body: f }); if (result.token) saveToken(result.token); setLocationParam("invite", ""); await refreshMe(); app.spaceId = app.spaces.find((s) => !oldIds.has(s.id))?.id || result.spaces.at(-1)?.id || ""; await refreshSpace(); app.currentView = "space"; renderSpace(); showSpaceLinks(result.token ? `${location.origin}/?access=${encodeURIComponent(result.token)}` : "", result.inviteUrl); return;
    }
    if (type === "join") {
      const invite = f.invite || app.invite;
      const oldIds = new Set(app.spaces.map((s) => s.id));
      const result = await api("/api/join", { method: "POST", body: { invite: invite.includes("invite=") ? new URL(invite).searchParams.get("invite") : invite, nickname: f.nickname } });
      if (result.token) saveToken(result.token);
      app.invite = ""; setLocationParam("invite", ""); if (modal.open) modal.close(); await refreshMe(); app.currentView = "space"; app.spaceId = app.spaces.find((s) => !oldIds.has(s.id))?.id || app.spaceId || app.spaces[0]?.id || ""; await refreshSpace(); renderSpace();
      if (result.token) showSecret("공간에 참여했어요", "개인 접속 링크를 본인만 보관하세요. 모임장에게 전달하지 마세요.", `${location.origin}/?access=${encodeURIComponent(result.token)}`, "개인 접속 링크"); else notify("현재 게스트 신원으로 새 공간에 참여했어요."); return;
    }
    if (type === "create-meeting") {
      const book = makeBook(f); const startAt = fromKstInput(f.startAt); const endAt = fromKstInput(f.endAt);
      const meeting = await api(`/api/spaces/${app.spaceId}/meetings`, { method: "POST", body: { ...f, startAt, endAt, book } });
      if (modal.open) modal.close(); app.meetingId = meeting.id; app.selectedBook = null; app.bookResults = []; app.bookQuery = ""; app.scheduleOpen = false; await refreshSpace(); await refreshMeeting(); app.currentView = "meeting"; renderMeeting(); notify("새 회차를 만들었어요."); return;
    }
    if (type === "schedule") {
      const body = { startAt: fromKstInput(f.startAt), endAt: fromKstInput(f.endAt), deadlineHours: Number(f.deadlineHours), hostId: f.hostId, book: makeBook(f), bookCorrection: f.bookCorrection === "yes" };
      try { await api(`/api/spaces/${app.spaceId}/meetings/${id}/schedule`, { method: "PATCH", body }); }
      catch (error) { if (/책을 바꾸면/.test(error.message) && window.confirm("책을 바꾸면 기존 발제문과 host 자료가 삭제됩니다. 책을 변경할까요?")) await api(`/api/spaces/${app.spaceId}/meetings/${id}/schedule`, { method: "PATCH", body: { ...body, confirmBookChange: true } }); else throw error; }
      app.selectedBook = null; app.scheduleOpen = false; app.scheduleDraft = null; await refreshSpace(); await refreshMeeting(); renderMeeting(); notify("회차 정보를 저장했어요."); return;
    }
    if (type === "record-new") {
      await api(`/api/spaces/${app.spaceId}/meetings/${id}/records`, { method: "POST", body: f }); await refreshMeeting(); app.currentView = "meeting"; renderMeeting(); notify("기록을 저장했어요."); return;
    }
    if (type === "record-edit") {
      await api(`/api/spaces/${app.spaceId}/meetings/${app.meetingId}/records/${id}`, { method: "PATCH", body: f }); app.editingRecord = ""; await refreshMeeting(); renderMeeting(); notify("기록을 수정했어요."); return;
    }
    if (type === "reference") {
      await api(`/api/spaces/${app.spaceId}/meetings/${id}/reference`, { method: "PATCH", body: f }); await refreshMeeting(); renderMeeting(); notify("host 자료를 저장했어요."); return;
    }
    if (type === "manual-guide") {
      await api(`/api/spaces/${app.spaceId}/meetings/${app.meetingId}/manual-guide`, { method: "POST", body: f }); await refreshMeeting(); renderMeeting(); notify("수기 발제문을 공개했어요."); return;
    }
    throw new Error("처리할 수 없는 입력이에요.");
  } catch (err) { notify(err.message, true); }
}
function showSecret(title, explanation, secret, label) {
  modal.innerHTML = `<div class="modal-body"><button class="modal-close" data-action="close-modal" aria-label="닫기">×</button><h2>${esc(title)}</h2><p>${esc(explanation)}</p><p class="hint">${esc(label)}</p><div class="secret">${esc(secret)}</div><div class="form-actions"><button class="button outline" data-action="close-modal">닫기</button><button class="button" data-action="copy-secret" data-secret="${esc(secret)}">링크 복사</button></div></div>`;
  if (!modal.open) modal.showModal();
}
function showSpaceLinks(accessLink, inviteLink) {
  const links = [
    ...(accessLink ? [{ title: "내 개인 접속 링크", explanation: "비공개 기록을 볼 수 있는 본인용 링크입니다. 안전하게 보관하고 다른 사람에게 전달하지 마세요.", url: accessLink }] : []),
    { title: "멤버 초대 링크", explanation: "멤버가 공간에 참여할 때 쓰는 링크입니다. 개인 접속 링크와 다릅니다.", url: inviteLink },
  ];
  modal.innerHTML = `<div class="modal-body"><button class="modal-close" data-action="close-modal" aria-label="닫기">×</button><h2>공간을 만들었어요</h2>${links.map((link) => `<section class="source-card"><strong>${esc(link.title)}</strong><p>${esc(link.explanation)}</p><div class="secret">${esc(link.url)}</div><button class="button outline small" data-action="copy-secret" data-secret="${esc(link.url)}">링크 복사</button></section>`).join("")}<div class="form-actions"><button class="button" data-action="close-modal">완료</button></div></div>`;
  if (!modal.open) modal.showModal();
}
async function copyText(value) {
  try { await navigator.clipboard.writeText(value); notify("링크를 복사했어요."); }
  catch { showSecret("링크 복사", "링크를 선택해 직접 복사하세요.", value, "복사할 링크"); }
}
async function refreshAfterSpaceMutation() { await refreshMe(); if (app.spaceId && app.spaces.some((s) => s.id === app.spaceId)) await refreshSpace(); else { app.spaceId = ""; app.space = null; } render(); }

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-book-description-toggle]");
  if (!button) return;
  const book = button.closest(".round-book");
  const expanded = book.classList.toggle("book-description-expanded");
  button.setAttribute("aria-expanded", String(expanded));
  button.setAttribute("aria-label", expanded ? "책 소개 접기" : "책 소개 더 보기");
  button.textContent = expanded ? "접기" : "… 더 보기";
});document.addEventListener("submit", (event) => { const form = event.target.closest("form[data-form]"); if (!form) return; event.preventDefault(); void submit(form); });
document.addEventListener("input", (event) => {
  if (event.target.matches('form[data-form="schedule"] input, form[data-form="schedule"] select')) {
    const form = event.target.form; if (form) app.scheduleDraft = Object.fromEntries(new FormData(form).entries());
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "space-select") { void loadSpace(event.target.value).catch((err) => notify(err.message, true)); }
});
document.addEventListener("error", (event) => {
  if (event.target instanceof HTMLImageElement && event.target.classList.contains("cover")) {
    event.target.hidden = true;
    if (event.target.nextElementSibling) event.target.nextElementSibling.hidden = false;
  }
}, true);
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]"); if (!button) return;
  const action = button.dataset.action; const id = button.dataset.id; const value = button.dataset.value;
  try {
    if (action === "open-space") return await loadSpace(id);
    if (action === "back-home") { event.preventDefault(); app.spaceId = ""; app.space = null; app.meetingId = ""; app.meeting = null; app.currentView = "home"; renderHome(); return; }
    if (action === "back-space") { event.preventDefault(); app.meetingId = ""; app.meeting = null; app.currentView = "space"; app.scheduleOpen = false; await refreshSpace(); renderSpace(); return; }
    if (action === "open-meeting") { app.meetingId = id; app.selectedBook = null; app.bookResults = []; await refreshMeeting(); app.currentView = "meeting"; renderMeeting(); return; }
    if (action === "show-create-meeting") { app.selectedBook = null; app.bookResults = []; app.bookQuery = ""; app.scheduleDraft = null; showModal("새 회차 만들기", meetingForm()); return; }
    if (action === "new-space") return renderLanding();
    if (action === "join-space") { if (app.token) return showModal("초대받은 공간 참여", joinForm()); app.invite = ""; renderLanding(); return; }
    if (action === "copy-access") return await copyText(`${location.origin}/?access=${encodeURIComponent(app.token)}`);
    if (action === "logout") { app.token = ""; app.user = null; app.spaces = []; app.spaceId = ""; app.space = null; localStorage.removeItem("jisu-readingjournal-access"); renderLanding(); return; }
    if (action === "close-modal") { modal.close(); return; }
    if (action === "copy-secret") { await copyText(button.dataset.secret); return; }
    if (action === "search-books") { const query = $("#book-query")?.value.trim() || ""; if (!query) return notify("책 제목이나 저자를 입력해 주세요.", true); const active = appRoot.querySelector('form[data-form="schedule"]') || modal.querySelector('form[data-form="create-meeting"]'); if (active) app.scheduleDraft = Object.fromEntries(new FormData(active).entries()); app.bookQuery = query; app.bookError = ""; try { const result = await api(`/api/book-search?q=${encodeURIComponent(query)}`); app.bookResults = result.books; if (!result.books.length) notify("검색 결과가 없어요. 직접 등록해 주세요."); } catch (err) { app.bookResults = []; app.bookError = err.message; } if (modal.open) showModal("새 회차 만들기", meetingForm()); else if (app.meeting) renderMeeting(); else renderSpace(); return; }
    if (action === "choose-book") { const active = appRoot.querySelector('form[data-form="schedule"]') || modal.querySelector('form[data-form="create-meeting"]'); if (active) app.scheduleDraft = Object.fromEntries(new FormData(active).entries()); app.selectedBook = app.bookResults[Number(button.dataset.index)]; app.bookResults = []; app.bookQuery = ""; if (modal.open) showModal("새 회차 만들기", meetingForm()); else if (app.meeting) renderMeeting(); return; }
    if (action === "new-invite") { const data = await api(`/api/spaces/${app.spaceId}/invite`, { method: "POST", body: {} }); return showSecret("새 초대 링크", "이 링크는 멤버 참여용입니다. 개인 접속 링크처럼 비공개 기록을 열지는 않습니다. 이전 초대 링크는 만료됐어요.", data.inviteUrl, "멤버 초대 링크"); }
    if (action === "delete-space") { if (!window.confirm("이 공간을 보관할까요? 이후 멤버들은 접근할 수 없고, 공간과 기록은 저장 파일에 보존됩니다.")) return; await api(`/api/spaces/${app.spaceId}/space`, { method: "DELETE" }); app.spaceId = ""; app.space = null; await refreshMe(); app.currentView = "home"; renderHome(); notify("공간을 보관했어요."); return; }
    if (action === "reissue-member") { if (!window.confirm("이 멤버의 기존 개인 링크와 세션을 무효화하고 새 링크를 발급할까요?")) return; const data = await api(`/api/spaces/${app.spaceId}/members/reissue`, { method: "POST", body: { memberId: id } }); if (id === app.user.id) saveToken(new URL(data.accessUrl).searchParams.get("access")); return showSecret("개인 접속 링크 재발급", "기존 링크와 세션은 더 이상 사용할 수 없습니다. 새 링크를 해당 멤버에게 직접 전달하세요.", data.accessUrl, "개인 접속 링크"); }
    if (action === "transfer-owner") { const target = app.space.members.find((m) => m.id === id); if (!window.confirm(`${target.name}님에게 모임장 권한을 넘길까요?`)) return; await api(`/api/spaces/${app.spaceId}/members/transfer`, { method: "POST", body: { memberId: id } }); await refreshAfterSpaceMutation(); notify("모임장 권한을 넘겼어요."); return; }
    if (action === "remove-member") { const target = app.space.members.find((m) => m.id === id); if (!window.confirm(`${target.name}님을 공간에서 내보낼까요? 공개 기록은 이름과 함께 남고, 비공개 기록은 삭제돼요.`)) return; await api(`/api/spaces/${app.spaceId}/members/${id}`, { method: "DELETE" }); await refreshAfterSpaceMutation(); notify("멤버를 내보냈어요."); return; }
    if (action === "leave-space") { if (!window.confirm("이 공간에서 나갈까요? 비공개 기록은 삭제되고, 공개 기록은 이름과 함께 남습니다.")) return; await api(`/api/spaces/${app.spaceId}/members/${app.user.id}`, { method: "DELETE" }); await refreshAfterSpaceMutation(); notify("공간에서 나왔어요."); return; }
    if (action === "toggle-schedule") { const form = appRoot.querySelector('form[data-form="schedule"]'); if (form) app.scheduleDraft = Object.fromEntries(new FormData(form).entries()); app.scheduleOpen = !app.scheduleOpen; app.selectedBook = null; app.bookResults = []; renderMeeting(); return; }
    if (action === "attendance") { await api(`/api/spaces/${app.spaceId}/meetings/${app.meetingId}/attendance`, { method: "POST", body: { status: value } }); await refreshMeeting(); renderMeeting(); notify("참석 응답을 저장했어요."); return; }
    if (action === "new-record-visibility") { const form = button.closest("form"); $("[name=visibility]", form).value = value; $$("[data-action=new-record-visibility]", form).forEach((b) => b.setAttribute("aria-pressed", String(b === button))); return; }
    if (action === "set-record-visibility") { const form = button.closest("form"); $("[name=visibility]", form).value = value; $$("[data-action=set-record-visibility]", form).forEach((b) => b.setAttribute("aria-pressed", String(b === button))); return; }
    if (action === "edit-record") { app.editingRecord = id; renderMeeting(); return; }
    if (action === "cancel-edit") { app.editingRecord = ""; renderMeeting(); return; }
    if (action === "delete-record") { if (!window.confirm("이 기록을 삭제할까요? 삭제한 기록은 복구할 수 없어요.")) return; await api(`/api/spaces/${app.spaceId}/meetings/${app.meetingId}/records/${id}`, { method: "DELETE" }); await refreshMeeting(); renderMeeting(); notify("기록을 삭제했어요."); return; }
    if (action === "generate-guide") { if (app.meeting.guide?.mode === "manual" && !window.confirm("AI 발제문을 만들면 현재 수기 발제문이 교체됩니다. 계속할까요?")) return; button.disabled = true; button.textContent = "발제문 만드는 중…"; await api(`/api/spaces/${app.spaceId}/meetings/${app.meetingId}/generate`, { method: "POST", body: {} }); await refreshMeeting(); renderMeeting(); if (app.meeting.generation.status === "failed") notify(app.meeting.generation.lastError || "발제문 생성에 실패했어요.", true); else notify("발제문을 생성해 공간에 공개했어요."); return; }
    if (action === "cancel-meeting") { if (!window.confirm("회차를 취소할까요? 취소하면 되돌릴 수 없고, 기존 기록과 발제문은 보존됩니다.")) return; await api(`/api/spaces/${app.spaceId}/meetings/${app.meetingId}/cancel`, { method: "POST", body: {} }); await refreshMeeting(); await refreshSpace(); renderMeeting(); notify("회차를 취소했어요."); return; }
  } catch (err) { notify(err.message, true); }
});

function showModal(title, body) {
  modal.innerHTML = `<div class="modal-body"><button class="modal-close" data-action="close-modal" aria-label="닫기">×</button><h2>${esc(title)}</h2>${body}</div>`;
  if (!modal.open) modal.showModal();
}

init().catch((err) => { appRoot.innerHTML = `<p class="status-line error">${esc(err.message)}</p>`; });
