import type { Document } from "../types"

interface ChatInterfaceProps {
  mode: "document" | "general"
  document?: Document
  onBack: () => void
}

export default function ChatInterface({ onBack }: ChatInterfaceProps) {
  return (
    <div style={{ padding: 32 }}>
      <button onClick={onBack}>← Back</button>
      <p>Chat coming in Phase 6.</p>
    </div>
  )
}
