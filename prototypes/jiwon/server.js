// 발제 질문 프로토타입 서버. 실행: node server.js  (테스트 모드: node server.js --mock data/t4-ai-response.json)
// API 키는 이 서버만 .env에서 읽고, 브라우저로는 보내지 않는다.

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  countRecords,
  minimumMessage,
  buildLabels,
  buildUserPrompt,
  validateQuestions,
} from "./lib/core.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "data");
const MODEL = "claude-haiku-5-5";
const PORT = Number(process.env.PORT) || 3000;

// .env가 아직 없어도 서버는 뜬다. 키가 없으면 생성할 때 "지금 만들 수 없어요"가 나온다.
try {
  process.loadEnvFile(path.join(here, ".env"));
} catch {
  // .env 없음
}

// --mock <파일>: API 대신 미리 준비한 AI 응답 파일을 읽는다 (T4).
const mockArgIndex = process.argv.indexOf("--mock");
const mockFile = mockArgIndex > -1 ? process.argv[mockArgIndex + 1] : null;
const mockPath = mockFile ? path.resolve(here, mockFile) : null;
if (mockArgIndex > -1) {
  try {
    await fs.access(mockPath);
  } catch {
    console.error(`테스트 응답 파일을 찾을 수 없어요: ${mockFile}`);
    process.exit(1);
  }
}

const QUESTIONS_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
        },
        required: ["question", "evidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

async function listDatasets() {
  const names = (await fs.readdir(dataDir)).filter((n) => /^[\w-]+-records\.json$/.test(n));
  return names.sort();
}

async function loadDataset(name) {
  const names = await listDatasets();
  if (!names.includes(name)) throw new Error(`없는 기록 파일: ${name}`);
  const data = JSON.parse(await fs.readFile(path.join(dataDir, name), "utf8"));
  return { book: data.book ?? {}, records: Array.isArray(data.records) ? data.records : [] };
}

function describeApiError(err, Anthropic) {
  const is = (cls) => typeof cls === "function" && err instanceof cls;
  if (is(Anthropic.AuthenticationError)) return "API 키가 올바르지 않아요 (401)";
  if (is(Anthropic.RateLimitError)) return "호출 한도를 넘었어요 (429)";
  if (is(Anthropic.APIConnectionTimeoutError)) return "응답 시간이 초과됐어요";
  if (is(Anthropic.APIConnectionError)) return "API 서버에 연결하지 못했어요";
  if (is(Anthropic.APIError)) return `API 오류 ${err.status}: ${err.message}`;
  return String(err?.message ?? err);
}

async function callClaude(book, labels) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY가 없어요. prototypes/jiwon/.env에 키를 넣어 주세요.");
  }
  let Anthropic;
  try {
    ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
  } catch {
    throw new Error("Anthropic SDK가 설치되지 않았어요. prototypes/jiwon에서 npm install을 실행해 주세요.");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 });
  const system = await fs.readFile(path.join(here, "prompt.md"), "utf8");
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: QUESTIONS_SCHEMA },
      },
      messages: [{ role: "user", content: buildUserPrompt(book, labels) }],
    });
    if (response.stop_reason !== "end_turn") {
      throw new Error(`응답이 정상적으로 끝나지 않았어요 (stop_reason: ${response.stop_reason})`);
    }
    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
  } catch (err) {
    throw new Error(describeApiError(err, Anthropic));
  }
}

async function generate(datasetName) {
  const { book, records } = await loadDataset(datasetName);

  const blocked = minimumMessage(countRecords(records));
  if (blocked) return { status: "blocked", message: blocked };

  const labels = buildLabels(records);
  let rawText;
  try {
    rawText = mockPath ? await fs.readFile(mockPath, "utf8") : await callClaude(book, labels);
  } catch (err) {
    console.error(`[생성 실패] ${err.message}`);
    return { status: "failed" };
  }

  const result = validateQuestions(rawText, labels);
  if (result.parseError) console.error("[생성 실패] AI 응답을 JSON으로 읽지 못했어요.");
  for (const d of result.dropped) {
    console.log(`[질문 버림] ${d.reason}: ${d.question}`);
  }
  if (result.questions.length === 0) return { status: "failed" };
  return { status: "ok", questions: result.questions };
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new Error("요청이 너무 커요");
  }
  return body ? JSON.parse(body) : {};
}

function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

const sendJson = (res, status, obj) => send(res, status, "application/json; charset=utf-8", JSON.stringify(obj));

const STATIC = {
  "/": ["public/index.html", "text/html; charset=utf-8"],
  "/app.js": ["public/app.js", "text/javascript; charset=utf-8"],
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && STATIC[url.pathname]) {
      const [file, type] = STATIC[url.pathname];
      return send(res, 200, type, await fs.readFile(path.join(here, file)));
    }

    if (req.method === "GET" && url.pathname === "/api/datasets") {
      const datasets = [];
      for (const name of await listDatasets()) {
        const { book, records } = await loadDataset(name);
        datasets.push({ name, title: book.title ?? "", ...countRecords(records) });
      }
      return sendJson(res, 200, { datasets, testMode: mockFile });
    }

    if (req.method === "POST" && url.pathname === "/api/generate") {
      const { dataset } = await readJsonBody(req);
      return sendJson(res, 200, await generate(String(dataset ?? "")));
    }

    send(res, 404, "text/plain; charset=utf-8", "없는 주소예요.");
  } catch (err) {
    console.error(`[서버 오류] ${err.message}`);
    sendJson(res, 500, { status: "failed" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`발제 질문 프로토타입: http://localhost:${PORT}`);
  if (mockFile) console.log(`테스트 모드: API 대신 ${mockFile} 을(를) 읽어요.`);
  else if (!process.env.ANTHROPIC_API_KEY) console.log("API 키가 없어요. 생성하면 '지금 만들 수 없어요'가 나와요.");
});
