import { useEffect, useState } from "react"

function App() {
  const [message, setMessage] = useState("")

  useEffect(() => {
    fetch("http://localhost:3001")
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch((err) => console.error("CORS or connection error:", err))
  }, [])

  return <h1>{message || "Connecting to API..."}</h1>
}

export default App
