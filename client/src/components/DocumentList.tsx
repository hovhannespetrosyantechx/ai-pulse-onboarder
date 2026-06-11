import { FileText, FileJson, File, MessageSquare, Trash2 } from "lucide-react"
import type { Document } from "../types"
import "./DocumentList.css"

interface DocumentListProps {
  documents: Document[]
  onChat:   (id: string) => void
  onDelete: (id: string) => void
}

function getFileIcon(type: string) {
  if (type === "application/json") return <FileJson size={18} />
  if (type === "application/pdf" || type.startsWith("text/")) return <FileText size={18} />
  return <File size={18} />
}

function formatSize(bytes: number): string {
  if (bytes < 1024)             return `${bytes} B`
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export default function DocumentList({ documents, onChat, onDelete }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="doclist-empty">
        <span className="doclist-empty-emoji">🫙</span>
        <p className="doclist-empty-title">No documents yet</p>
        <p className="doclist-empty-hint">
          Upload a PDF, TXT, or MD file above to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="doclist">
      <h2 className="doclist-heading">Documents</h2>
      <ul className="doclist-list">
        {documents.map((doc) => (
          <li key={doc.id} className="doclist-item">
            <span className={`doclist-icon ${doc.status}`}>
              {getFileIcon(doc.type)}
            </span>

            <div className="doclist-info">
              <span className="doclist-name" title={doc.originalName}>
                {doc.originalName}
              </span>
              <span className="doclist-meta">
                {formatSize(doc.size)} · {formatDate(doc.uploadedAt)}
              </span>
            </div>

            <div className="doclist-status">
              {doc.status === "processing" && (
                <span className="doclist-badge processing">Processing…</span>
              )}
              {doc.status === "ready" && (
                <span className="doclist-badge ready">
                  {doc.chunkCount ?? 0} chunks
                </span>
              )}
              {doc.status === "error" && (
                <span className="doclist-badge error" title={doc.error}>
                  Error
                </span>
              )}
            </div>

            <div className="doclist-actions">
              <button
                className="doclist-action-btn"
                onClick={() => onChat(doc.id)}
                disabled={doc.status !== "ready"}
                title="Chat with this document"
              >
                <MessageSquare size={16} />
              </button>
              <button
                className="doclist-action-btn delete"
                onClick={() => onDelete(doc.id)}
                title="Delete document"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
