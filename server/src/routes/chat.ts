import { Router, Request, Response } from "express";
import Groq from "groq-sdk";
import { prisma } from "../lib/prisma";

const router = Router();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = "openai/gpt-oss-120b";

// ~4 chars per token; reserve 4k tokens for conversation + response
const MAX_CONTEXT_CHARS = 16_000;

const SYSTEM_BASE = `You are an AI Onboarding Assistant. \
Use the provided context below to answer questions. \
If the answer isn't in the context, state that you don't know. \
Always cite the document name when referencing information.`;

function buildDocContext(name: string, chunks: string[]): string {
  let ctx = "";
  for (const chunk of chunks) {
    if (ctx.length + chunk.length > MAX_CONTEXT_CHARS) break;
    ctx += chunk + "\n\n";
  }
  return `Document: "${name}"\n\n${ctx}`;
}

function buildGeneralContext(
  docs: Array<{ name: string; chunks: string[] }>,
): string {
  const perDoc = Math.floor(MAX_CONTEXT_CHARS / Math.max(docs.length, 1));
  let ctx = "";
  for (const doc of docs) {
    let docSnippet = "";
    for (const chunk of doc.chunks) {
      if (docSnippet.length + chunk.length > perDoc) break;
      docSnippet += chunk + "\n\n";
    }
    ctx += `--- Document: "${doc.name}" ---\n${docSnippet.trim()}\n\n`;
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

  const context = buildDocContext(doc.name, doc.chunks);
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

  const context = buildGeneralContext(docs);
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