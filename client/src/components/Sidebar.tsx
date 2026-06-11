import { FileText, LayoutDashboard, MessagesSquare, Zap } from "lucide-react"
import type{ Document, View } from "../types"
import "./Sidebar.css"

interface SidebarProps {
  documents: Document[]
  activeView: View
  onNavigate: (view: View) => void
}

export default function Sidebar({ documents, activeView, onNavigate }: SidebarProps) {
  const isDashboard = activeView.type === "dashboard"
  const isGeneral   = activeView.type === "general-chat"

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <Zap size={20} />
        <span>AI-Pulse</span>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        <button
          className={`sidebar-nav-item ${isDashboard ? "active" : ""}`}
          onClick={() => onNavigate({ type: "dashboard" })}
        >
          <LayoutDashboard size={16} />
          Dashboard
        </button>

        <button
          className={`sidebar-nav-item ${isGeneral ? "active" : ""}`}
          onClick={() => onNavigate({ type: "general-chat" })}
          disabled={documents.length === 0}
        >
          <MessagesSquare size={16} />
          All Documents Chat
        </button>
      </nav>

      {/* Document list */}
      {documents.length > 0 && (
        <div className="sidebar-docs">
          <p className="sidebar-section-label">Documents</p>
          {documents.map((doc) => {
            const isActive =
              activeView.type === "document-chat" &&
              activeView.documentId === doc.id

            return (
              <button
                key={doc.id}
                className={`sidebar-doc-item ${isActive ? "active" : ""}`}
                onClick={() => onNavigate({ type: "document-chat", documentId: doc.id })}
                disabled={doc.status !== "ready"}
                title={doc.status === "processing" ? "Still processing…" : doc.originalName}
              >
                <FileText size={14} />
                <span className="sidebar-doc-name">{doc.originalName}</span>
                {doc.status === "processing" && (
                  <span className="sidebar-doc-badge">…</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </aside>
  )
}
