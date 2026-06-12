import { Router, Request, Response } from "express"
import multer from "multer"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import { PDFParse } from "pdf-parse"
import { prisma } from "../lib/prisma"

const router = Router()

const UPLOAD_LIMIT = 10
const UPLOAD_WINDOW_MS = 60_000
const uploadAttempts = new Map<string, number[]>()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB 
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "text/plain", "text/markdown"]
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error("Unsupported file type. Only PDF, TXT, and MD are allowed."))
    }
  },
})

function uploadRateLimit(req: Request, res: Response, next: () => void) {
  const key = req.ip || req.socket.remoteAddress || "unknown"
  const now = Date.now()
  const recentAttempts = (uploadAttempts.get(key) ?? []).filter(
    (timestamp) => now - timestamp < UPLOAD_WINDOW_MS
  )

  if (recentAttempts.length >= UPLOAD_LIMIT) {
    const retryAfterMs = UPLOAD_WINDOW_MS - (now - recentAttempts[0])
    res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000))
    res.status(429).json({
      error: "Upload limit reached. Please wait a minute before uploading again.",
    })
    return
  }

  recentAttempts.push(now)
  uploadAttempts.set(key, recentAttempts)
  next()
}

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
})

async function extractText(
  buffer: Buffer,
  mimetype: string
): Promise<string> {
  if (mimetype === "application/pdf") {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return result.text
    } finally {
      await parser.destroy()
    }
  }

  return buffer.toString("utf-8")
}

router.post("/", uploadRateLimit, upload.single("file"), async (req: Request, res: Response) => {

  if (!req.file) {
    res.status(400).json({ error: "No file uploaded." })
    return
  }

  const { buffer, originalname, mimetype, size } = req.file

  const name = originalname.replace(/\.[^/.]+$/, "")

  let document = await prisma.document.create({
    data: {
      name,
      originalName: originalname,
      type: mimetype,
      size,
      extractedText: "",
      chunks: [],
      status: "processing",
    },
  })

  ;(async () => {
    try {
      const extractedText = await extractText(buffer, mimetype)

      if (!extractedText || extractedText.trim().length === 0) {
        await prisma.document.update({
          where: { id: document.id },
          data: { status: "error", error: "OCR Required: document has no extractable text." },
        })
        return
      }

      const chunks = await splitter.splitText(extractedText)

      await prisma.document.update({
        where: { id: document.id },
        data: { extractedText, chunks, status: "ready" },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown processing error"
      await prisma.document.update({
        where: { id: document.id },
        data: { status: "error", error: message },
      })
    }
  })()

  res.status(202).json(document)
})

router.get("/", async (_req: Request, res: Response) => {
  const documents = await prisma.document.findMany({
    select: {
      id: true,
      name: true,
      originalName: true,
      type: true,
      size: true,
      uploadedAt: true,
      status: true,
      error: true,
      chunks: true,
    },
    orderBy: { uploadedAt: "desc" },
  })

  const response = documents.map(({ chunks, ...doc }) => ({
    ...doc,
    chunkCount: chunks.length,
  }))

  res.json(response)
})

router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }

  const document = await prisma.document.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      originalName: true,
      type: true,
      size: true,
      uploadedAt: true,
      status: true,
      error: true,
      chunks: true,
    },
  })

  if (!document) {
    res.status(404).json({ error: "Document not found." })
    return
  }

  const { chunks, ...rest } = document
  res.json({ ...rest, chunkCount: chunks.length })
})

router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }

  try {
    await prisma.document.delete({ where: { id } })
    res.status(204).send()
  } catch {
    res.status(404).json({ error: "Document not found." })
  }
})

export default router
