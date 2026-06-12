# AI-Pulse Onboarder

Document-powered AI onboarding assistant built with React, TypeScript, Express,
Prisma, and PostgreSQL.

Users can upload PDF, TXT, and Markdown documents. The server extracts text,
splits it into overlapping chunks, stores the processed document, and supports
both per-document chat and cross-document knowledge-base chat.

## Features

- PDF, TXT, and Markdown uploads with file type and size validation
- PDF text extraction with an OCR-required error for scanned/empty PDFs
- Recursive character chunking with 1000 character chunks and 200 character overlap
- Document statuses: processing, ready, and error
- Metadata-only document list API with chunk counts
- Per-document chat using the selected document context
- All-documents chat using relevant chunks from ready documents
- Streaming AI responses through Groq
- Persisted chat sessions and messages
- Cascade delete for documents and related chat sessions
- SWR polling while documents are processing
- Optimistic chat UI and Markdown rendering, including tables
- Basic upload rate limiting

## Tech Stack

- Frontend: React 18, TypeScript, Vite, SWR, react-markdown, lucide-react
- Backend: Express, TypeScript, Prisma
- Database: PostgreSQL
- Processing: pdf-parse, LangChain recursive text splitter
- LLM: Groq SDK using `openai/gpt-oss-120b`

## Prerequisites

- Node.js
- PostgreSQL database
- Groq API key

## Environment

Create `server/.env`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
GROQ_API_KEY="your-groq-api-key"
PORT=3001
```

## Setup

Install dependencies:

```bash
npm run install:all
```

Run the app:

```bash
npm run dev
```

This starts PostgreSQL with Docker Compose, applies Prisma migrations, and runs
the Express API and Vite client together.

Open the Vite URL, usually `http://localhost:5173`.

You can also run each part manually:

```bash
docker compose up -d

cd server
npm run db:migrate
npm run dev
```

In another terminal:

```bash
cd client
npm run dev
```

## Validation

Frontend build:

```bash
npm run build
```

Backend type check:

```bash
npm run typecheck
```

## API Overview

- `GET /api/documents` returns document metadata and chunk counts
- `GET /api/documents/:id` returns one document's metadata and chunk count
- `POST /api/documents` uploads and processes a document
- `DELETE /api/documents/:id` deletes a document and cascades chat sessions
- `POST /api/chat` streams a per-document AI response
- `POST /api/chat/general` streams an all-documents AI response
- `POST /api/sessions` creates or returns a chat session
- `DELETE /api/sessions/:id` clears one chat session
