import { Router, Request, Response } from "express";
import Groq from "groq-sdk";
import { prisma } from "../lib/prisma";

const router = Router();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = "openai/gpt-oss-120b";

// ~4 chars per token; reserve 4k tokens for conversation + response
const MAX_CONTEXT_CHARS = 16_000;
const MAX_CONTEXT_CHUNKS = 12;
const SUMMARY_CHARS_PER_DOC = 700;
const MAX_HEADERS_PER_DOC = 8;

const SYSTEM_BASE = `You are an AI Onboarding Assistant. \
Use the provided context below to answer questions. \
If the answer isn't in the context, state that you don't know. \
Always cite the document name when referencing information.`;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

function getLatestUserQuestion(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  return [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((term) => term.length > 2 && !STOP_WORDS.has(term)) ?? [];
}

function scoreChunk(chunk: string, queryTerms: string[]): number {
  if (queryTerms.length === 0) return 0;

  const lowerChunk = chunk.toLowerCase();
  const chunkTerms = tokenize(chunk);
  const chunkTermCounts = new Map<string, number>();
  for (const term of chunkTerms) {
    chunkTermCounts.set(term, (chunkTermCounts.get(term) ?? 0) + 1);
  }

  let score = 0;
  for (const term of new Set(queryTerms)) {
    score += (chunkTermCounts.get(term) ?? 0) * 3;
    if (lowerChunk.includes(term)) score += 1;
  }

  const queryPhrase = queryTerms.join(" ");
  if (queryPhrase.length > 8 && lowerChunk.includes(queryPhrase)) {
    score += 10;
  }

  return score;
}

function selectRelevantChunks(chunks: string[], question: string): string[] {
  const queryTerms = tokenize(question);

  return chunks
    .map((chunk, index) => ({
      chunk,
      index,
      score: scoreChunk(chunk, queryTerms),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_CONTEXT_CHUNKS)
    .sort((a, b) => a.index - b.index)
    .map(({ chunk }) => chunk);
}

function buildDocContext(name: string, chunks: string[], question: string): string {
  let ctx = "";
  const relevantChunks = selectRelevantChunks(chunks, question);

  for (const [index, chunk] of relevantChunks.entries()) {
    const section = `[Chunk ${index + 1}]\n${chunk}\n\n`;
    if (ctx.length + section.length > MAX_CONTEXT_CHARS) break;
    ctx += section;
  }

  return `Document: "${name}"\n\n${ctx}`;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function summarizeDocument(chunks: string[]): string {
  const firstText = normalizeWhitespace(chunks.join("\n").slice(0, SUMMARY_CHARS_PER_DOC));
  if (firstText.length <= SUMMARY_CHARS_PER_DOC) return firstText;
  return `${firstText.slice(0, SUMMARY_CHARS_PER_DOC).trim()}...`;
}

function extractHeaders(chunks: string[]): string[] {
  const seen = new Set<string>();
  const headers: string[] = [];
  const lines = chunks.join("\n").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.length > 120) continue;

    const markdownHeading = line.match(/^#{1,6}\s+(.+)$/)?.[1];
    const numberedHeading = line.match(/^\d+(\.\d+)*[.)]?\s+([A-Z][\w\s&/-]{3,})$/)?.[2];
    const titledLine =
      /^[A-Z][A-Za-z0-9\s&/-]{3,}:$/.test(line) ||
      (/^[A-Z][A-Za-z0-9\s&/-]{3,}$/.test(line) && line.split(/\s+/).length <= 10)
        ? line.replace(/:$/, "")
        : null;

    const header = normalizeWhitespace(markdownHeading ?? numberedHeading ?? titledLine ?? "");
    const key = header.toLowerCase();
    if (!header || seen.has(key)) continue;

    seen.add(key);
    headers.push(header);
    if (headers.length >= MAX_HEADERS_PER_DOC) break;
  }

  return headers;
}

function buildGeneralContext(
  docs: Array<{ name: string; chunks: string[] }>,
  question: string,
): string {
  let ctx = "Document summaries and headers:\n\n";

  for (const doc of docs) {
    const headers = extractHeaders(doc.chunks);
    const summary = summarizeDocument(doc.chunks);
    const section = [
      `--- Document: "${doc.name}" ---`,
      `Summary: ${summary || "No summary available."}`,
      `Headers: ${headers.length > 0 ? headers.join("; ") : "No clear headers found."}`,
      "",
    ].join("\n");

    if (ctx.length + section.length > MAX_CONTEXT_CHARS) break;
    ctx += section;
  }

  const queryTerms = tokenize(question);
  const rankedChunks = docs
    .flatMap((doc) =>
      doc.chunks.map((chunk, index) => ({
        docName: doc.name,
        chunk,
        index,
        score: scoreChunk(chunk, queryTerms),
      })),
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.docName.localeCompare(b.docName) ||
        a.index - b.index,
    )
    .slice(0, MAX_CONTEXT_CHUNKS);

  ctx += "\nRelevant excerpts:\n\n";
  for (const item of rankedChunks) {
    const section = `--- Document: "${item.docName}", chunk ${item.index + 1} ---\n${item.chunk.trim()}\n\n`;
    if (ctx.length + section.length > MAX_CONTEXT_CHARS) break;
    ctx += section;
  }

  return ctx.trim();
}

// Returns the full accumulated response so callers can persist it
async function streamGroq(
  res: Response,
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-Accel-Buffering", "no");

  const stream = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: true,
  });

  let fullResponse = "";

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? "";
    if (token) {
      fullResponse += token;
      res.write(token);
    }
  }

  res.end();
  return fullResponse;
}

// ─── Save helpers ─────────────────────────────────────────────────────────────

async function saveMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
) {
  await prisma.chatMessage.create({
    data: { sessionId, role, content },
  });
}

// ─── POST /api/chat ───────────────────────────────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  const { documentId, sessionId, messages } = req.body as {
    documentId: string;
    sessionId?: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!documentId || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "documentId and messages[] are required." });
    return;
  }

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { name: true, status: true, chunks: true },
  });

  if (!doc) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  if (doc.status !== "ready") {
    res
      .status(400)
      .json({ error: `Document status is "${doc.status}", not ready.` });
    return;
  }

  // Save user message before streaming
  const lastUserMsg = messages[messages.length - 1];
  if (sessionId && lastUserMsg?.role === "user") {
    await saveMessage(sessionId, "user", lastUserMsg.content);
  }

  const question = getLatestUserQuestion(messages);
  const context = buildDocContext(doc.name, doc.chunks, question);
  const systemPrompt = `${SYSTEM_BASE}\n\nContext:\n${context}`;

  try {
    const fullResponse = await streamGroq(
      res,
      systemPrompt,
      messages.map(({ role, content }) => ({ role, content })),
    );

    // Save assistant response after stream completes
    if (sessionId && fullResponse) {
      await saveMessage(sessionId, "assistant", fullResponse);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (!res.headersSent) res.status(500).json({ error: message });
    else res.end();
  }
});

// ─── POST /api/chat/general ───────────────────────────────────────────────────

router.post("/general", async (req: Request, res: Response) => {
  const { sessionId, messages } = req.body as {
    sessionId?: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages[] is required." });
    return;
  }

  const docs = await prisma.document.findMany({
    where: { status: "ready" },
    select: { name: true, chunks: true },
    orderBy: { uploadedAt: "desc" },
  });

  if (docs.length === 0) {
    res.status(400).json({ error: "No ready documents found." });
    return;
  }

  // Save user message before streaming
  const lastUserMsg = messages[messages.length - 1];
  if (sessionId && lastUserMsg?.role === "user") {
    await saveMessage(sessionId, "user", lastUserMsg.content);
  }

  const question = getLatestUserQuestion(messages);
  const context = buildGeneralContext(docs, question);
  const systemPrompt = `${SYSTEM_BASE}\n\nContext from all uploaded documents:\n${context}`;

  try {
    const fullResponse = await streamGroq(
      res,
      systemPrompt,
      messages.map(({ role, content }) => ({ role, content })),
    );

    // Save assistant response after stream completes
    if (sessionId && fullResponse) {
      await saveMessage(sessionId, "assistant", fullResponse);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (!res.headersSent) res.status(500).json({ error: message });
    else res.end();
  }
});

export default router;
