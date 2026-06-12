import express, { Request, Response, NextFunction } from "express"
import cors from "cors"
import dotenv from "dotenv"
import path from "path"
import documentsRouter from "./routes/document"
import chatRouter from "./routes/chat"
import sessionsRouter from "./routes/sessions"

dotenv.config({ path: path.resolve(__dirname, "../.env") })

const app = express()
const PORT = process.env.PORT || 3001

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "DELETE"],
  })
)

app.use(express.json())

app.use("/api/sessions", sessionsRouter)

app.get("/", (_req, res) => {
  res.json({ message: "AI-Pulse API is running 🚀" })
})

app.get("/health", (_req, res) => {
  res.json({ status: "ok" })
})
 
app.use("/api/documents", documentsRouter)
app.use("/api/chat", chatRouter)

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Error]", err.message)
  res.status(500).json({ error: err.message || "Internal server error" })
})
 
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
