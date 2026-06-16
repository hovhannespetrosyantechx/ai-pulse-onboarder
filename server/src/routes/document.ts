import { Router, Request, Response } from "express";
import multer from "multer";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PDFParse } from "pdf-parse";
import { prisma } from "../lib/prisma";
import rateLimit from "express-rate-limit";

const router = Router();

// ------------------------------
// Rate limiter (express-rate-limit)
// ------------------------------
const uploadRateLimit = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 10,          // 10 uploads per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Upload limit reached. Please wait a minute before uploading again.",
  },
  // Set Retry-After header for compatibility
  handler: (req, res, next, options) => {
    res.set("Retry-After", String(Math.ceil(options.windowMs / 1000)));
    res.status(options.statusCode).json(options.message);
  },
});

// ------------------------------
// Multer config
// ------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "text/plain", "text/markdown"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error("Unsupported file type. Only PDF, TXT, and MD are allowed.")
      );
    }
  },
});

// ------------------------------
// Text splitter
// ------------------------------
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

// ------------------------------
// Text extraction helper
// ------------------------------
async function extractText(buffer: Buffer, mimetype: string): Promise<string> {
  if (mimetype === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  return buffer.toString("utf-8");
}

// ------------------------------
// Routes
// ------------------------------

// Upload
router.post(
  "/",
  uploadRateLimit,
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded." });
      return;
    }

    const { buffer, originalname, mimetype, size } = req.file;
    const name = originalname.replace(/\.[^/.]+$/, "");

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
    });

    // Background processing
    (async () => {
      try {
        const extractedText = await extractText(buffer, mimetype);

        if (!extractedText || extractedText.trim().length === 0) {
          await prisma.document.update({
            where: { id: document.id },
            data: {
              status: "error",
              error: "OCR Required: document has no extractable text.",
            },
          });
          return;
        }

        const chunks = await splitter.splitText(extractedText);

        await prisma.document.update({
          where: { id: document.id },
          data: { extractedText, chunks, status: "ready" },
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown processing error";
        console.error("Document processing failed for", document.id, err);

        // Retry the error status update up to 3 times with exponential backoff
        const maxRetries = 3;
        let attempt = 0;
        let updated = false;

        while (attempt < maxRetries && !updated) {
          try {
            await prisma.document.update({
              where: { id: document.id as string }, // explicit cast
              data: { status: "error", error: message },
            });
            updated = true;
          } catch (updateErr) {
            attempt++;
            console.error(
              `Failed to update document ${document.id} status (attempt ${attempt}):`,
              updateErr
            );
            if (attempt < maxRetries) {
              const delay = 200 * Math.pow(2, attempt - 1);
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
        }

        if (!updated) {
          console.error(
            `CRITICAL: Document ${document.id} processing failed and status could not be updated to 'error'. Manual intervention required.`
          );
          // Optionally send an alert, write to a separate log, etc.
        }
      }
    })();

    res.status(202).json(document);
  }
);

// GET all documents – optimized to avoid fetching chunk content
router.get("/", async (_req: Request, res: Response) => {
  try {
    // PostgreSQL raw query – returns metadata + chunk count
    const documents = await prisma.$queryRaw<Array<{
      id: string;
      name: string;
      originalName: string;
      type: string;
      size: number;
      uploadedAt: Date;
      status: string;
      error: string | null;
      chunkCount: number;
    }>>`
      SELECT
        id,
        name,
        "originalName",
        type,
        size,
        "uploadedAt",
        status,
        error,
        COALESCE(array_length(chunks, 1), 0) AS "chunkCount"
      FROM "Document"
      ORDER BY "uploadedAt" DESC
    `;

    res.json(documents);
  } catch (err) {
    console.error("Failed to fetch documents:", err);
    res.status(500).json({ error: "Failed to fetch documents." });
  }
});

// GET single document
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };

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
    });

    if (!document) {
      res.status(404).json({ error: "Document not found." });
      return;
    }

    const { chunks, ...rest } = document;
    res.json({ ...rest, chunkCount: chunks.length });
  } catch (err) {
    console.error("Failed to fetch document:", err);
    res.status(500).json({ error: "Failed to fetch document." });
  }
});

// DELETE document
router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  try {
    await prisma.document.delete({ where: { id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Document not found." });
  }
});

export default router;

