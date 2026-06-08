export type DocumentStatus = "processing" | "ready" | "error"

export interface Document {
  id: string
  name: string
  originalName: string
  type: string
  size: number
  uploadedAt: string
  status: DocumentStatus
  error?: string
}

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
  createdAt: string
}

export interface ChatSession {
  id: string
  documentId?: string
  type?: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}