import express, { Request, Response, NextFunction } from "express"
import cors from "cors"
import dotenv from "dotenv"
import documentsRouter from "./routes/document"


dotenv.config({ path: "../../.env" })

const app = express()
const PORT = process.env.PORT || 3001

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "DELETE"],
  })
)
app.use(express.json())

app.get("/", (_req, res) => {
  res.json({ message: "AI-Pulse API is running 🚀" })
})

app.get("/health", (_req, res) => {
  res.json({ status: "ok" })
})
 
app.use("/api/documents", documentsRouter)

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Error]", err.message)
  res.status(500).json({ error: err.message || "Internal server error" })
})
 
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
