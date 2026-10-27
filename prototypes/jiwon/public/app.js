const $ = (id) => document.getElementById(id);
const datasetSelect = $("dataset");
const generateButton = $("generate");
const retryButton = $("retry");
const blockedBox = $("blocked");
const failedBox = $("failed");
const questionList = $("questions");
let datasets = [];

function showStats() {
  const d = datasets.find((x) => x.name === datasetSelect.value);
  $("stats").textContent = d
    ? `${d.title ? `『${d.title}』 · ` : ""}기록한 멤버 ${d.members}명 · 밑줄 ${d.underlines}개`
    : "";
}

function renderQuestions(questions) {
  questionList.replaceChildren();
  for (const q of questions) {
    const li = document.createElement("li");
    const p = document.createElement("p");
    p.className = "q";
    p.textContent = q.question;
    li.append(p);
    for (const quote of q.quotes) {
      const bq = document.createElement("blockquote");
      bq.textContent = quote.text;
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = `멤버 ${quote.memberCount}명이 밑줄`;
      bq.append(count);
      li.append(bq);
    }
    questionList.append(li);
  }
}

async function generate() {
  blockedBox.hidden = true;
  failedBox.hidden = true;
  generateButton.disabled = true;
  retryButton.disabled = true;
  generateButton.textContent = "만드는 중…";
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset: datasetSelect.value }),
    });
    const result = await res.json();
    if (result.status === "ok") {
      renderQuestions(result.questions);
    } else if (result.status === "blocked") {
      questionList.replaceChildren();
      blockedBox.textContent = result.message;
      blockedBox.hidden = false;
    } else {
      // 실패해도 같은 화면의 직전 결과는 지우지 않는다.
      failedBox.hidden = false;
    }
  } catch {
    failedBox.hidden = false;
  } finally {
    generateButton.disabled = false;
    retryButton.disabled = false;
    generateButton.textContent = "발제 질문 만들기";
  }
}

async function init() {
  try {
    const res = await fetch("/api/datasets");
    const info = await res.json();
    datasets = info.datasets;
    for (const d of datasets) {
      const option = document.createElement("option");
      option.value = d.name;
      option.textContent = d.name;
      datasetSelect.append(option);
    }
    if (info.testMode) {
      $("testMode").textContent = `테스트 모드: API를 부르지 않고 ${info.testMode} 을(를) AI 응답으로 써요.`;
      $("testMode").hidden = false;
    }
    showStats();
  } catch {
    failedBox.hidden = false;
  }
}

datasetSelect.addEventListener("change", () => {
  showStats();
  questionList.replaceChildren();
  blockedBox.hidden = true;
  failedBox.hidden = true;
});
generateButton.addEventListener("click", generate);
retryButton.addEventListener("click", generate);
init();
