import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  try {
    await prisma.chatSession.delete({ where: { id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Chat session not found." });
  }
});

router.post("/", async (req: Request, res: Response) => {
  const { documentId, type } = req.body as {
    documentId?: string;
    type?: string;
  };

  try {
    const existing = await prisma.chatSession.findFirst({
      where: documentId
        ? { documentId }
        : { type: "general", documentId: null },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      res.json(existing);
      return;
    }

    let title = "General Chat";
    if (documentId) {
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { originalName: true },
      });
      title = doc?.originalName ?? "Document Chat";
    }

    const session = await prisma.chatSession.create({
      data: {
        documentId: documentId ?? null,
        type: documentId ? "document" : "general",
        title,
      },
      include: {
        messages: true,
      },
    });

    res.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
