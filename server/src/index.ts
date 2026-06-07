import express from "express"
import cors from "cors"
import dotenv from "dotenv"

dotenv.config({ path: "../../.env" })

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: "http://localhost:5173" }))
app.use(express.json())

app.get("/", (_req, res) => {
  res.json({ message: "AI-Pulse API is running 🚀" })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})