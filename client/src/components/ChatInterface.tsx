import { useState, useRef, useEffect } from "react";
import type { Document, ChatMessage } from "../types";
import ReactMarkdown from "react-markdown";
import { FileText, FileJson, File, ArrowLeft, Send, AlertTriangle } from "lucide-react";
import "./ChatInterface.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatInterfaceProps {
  mode: "document" | "general";
  document?: Document;
  onBack: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  "What documents are available?",
  "Summarize all documents briefly",
  "What are the key policies across all documents?",
  "Is there any conflicting information between documents?",
];

const API_BASE = "http://localhost:3001";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FileIcon({ type }: { type: string }) {
  if (type === "text/markdown") return <FileJson size={15} />;
  if (type.includes("pdf")) return <FileText size={15} />;
  return <File size={15} />;
}

function makeMessage(role: "user" | "assistant", content: string): ChatMessage {
  return { role, content, createdAt: new Date().toISOString() };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatInterface({
  mode,
  document,
  onBack,
}: ChatInterfaceProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Init session on mount ─────────────────────────────────────────────────
  useEffect(() => {
    async function initSession() {
      setIsLoading(true);
      try {
        const body =
          mode === "document"
            ? { documentId: document?.id }
            : { type: "general" };

        const res = await fetch(`${API_BASE}/api/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error(`Session init failed: ${res.status}`);

        const session = await res.json();

        setSessionId(session.id);
        setMessages(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          session.messages.map((m: any) => ({
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
          })),
        );
      } catch (err) {
        console.error("Failed to initialise session:", err);
        // Non-fatal — chat still works, messages just won't persist
      } finally {
        setIsLoading(false);
      }
    }

    initSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Auto-resize textarea ──────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // ── Send ──────────────────────────────────────────────────────────────────

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    setError(null);

    const userMsg = makeMessage("user", trimmed);
    const withUser = [...messages, userMsg];
    const assistantPlaceholder = makeMessage("assistant", "");

    setMessages([...withUser, assistantPlaceholder]);
    setInput("");
    setIsStreaming(true);

    try {
      const endpoint =
        mode === "document"
          ? `${API_BASE}/api/chat`
          : `${API_BASE}/api/chat/general`;

      const body =
        mode === "document"
          ? { documentId: document?.id, sessionId, messages: withUser }
          : { sessionId, messages: withUser };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        const { error: msg } = await res
          .json()
          .catch(() => ({ error: `Server error ${res.status}` }));
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const token = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = {
            ...last,
            content: last.content + token,
          };
          return updated;
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: "_Something went wrong. Please try again._",
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const isEmpty = messages.length === 0;
  const showSuggestions = mode === "general" && isEmpty && !isLoading;

  const placeholder =
    mode === "document"
      ? "Ask a question about this document…"
      : "Ask a question across all your documents…";

  const disclaimer =
    mode === "document"
      ? "AI responses are generated from the document content. Always verify important information."
      : "AI responses are generated from all uploaded documents. Always verify important information.";

  return (
    <div className="ci-root">
      <header className="ci-header">
        <button className="ci-back-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={15} />
          Back
        </button>
        <div className="ci-header-title">
          {mode === "document" && document ? (
            <>
              <span className="ci-header-icon">
                <FileIcon type={document.type} />
              </span>
              <span className="ci-doc-name">{document.originalName}</span>
              {document.chunkCount != null && (
                <span className="ci-chunk-badge">
                  {document.chunkCount} chunks
                </span>
              )}
            </>
          ) : (
            <span className="ci-doc-name">All Documents</span>
          )}
        </div>
        <div className="ci-header-spacer" aria-hidden />
      </header>

      <main className="ci-messages">
        {isLoading && (
          <div className="ci-loading">
            <span className="ci-loading-dot" />
            <span className="ci-loading-dot" />
            <span className="ci-loading-dot" />
          </div>
        )}

        {showSuggestions && (
          <div className="ci-empty">
            <p className="ci-empty-label">What would you like to know?</p>
            <div className="ci-suggestions">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  className="ci-chip"
                  onClick={() => sendMessage(prompt)}
                  disabled={isStreaming}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "document" && isEmpty && !isLoading && (
          <div className="ci-empty">
            <p className="ci-empty-label">
              Ask anything about{" "}
              <strong>{document?.originalName ?? "this document"}</strong>.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`ci-msg ci-msg--${msg.role}`}>
            <div className="ci-bubble">
              {msg.role === "assistant" ? (
                <ReactMarkdown>
                  {msg.content === "" && isStreaming ? "▋" : msg.content}
                </ReactMarkdown>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </main>

      <footer className="ci-footer">
        {error && (
          <p className="ci-error" role="alert">
            <AlertTriangle size={13} />
            {error}
          </p>
        )}
        <div className="ci-input-row">
          <textarea
            ref={textareaRef}
            className="ci-textarea"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isStreaming || isLoading}
            aria-label="Message input"
          />
          <button
            className="ci-send-btn"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isStreaming || isLoading}
            aria-label="Send message">
            <Send size={15} />
          </button>
        </div>
        <p className="ci-disclaimer">{disclaimer}</p>
      </footer>
    </div>
  );
}
