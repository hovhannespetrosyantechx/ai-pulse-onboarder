import { useState } from "react";
import useSWR from "swr";
import Sidebar from "./components/Sidebar";
import UploadZone from "./components/UploadZone";
import DocumentList from "./components/DocumentList";
import ChatInterface from "./components/ChatInterface";
import type { Document, View } from "./types";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    return res.json();
  });
export default function App() {
  const [view, setView] = useState<View>({ type: "dashboard" });

  const { data: documents = [], mutate } = useSWR<Document[]>(
    `${API_BASE}/api/documents`,
    fetcher,
    {
      // function form: SWR passes the latest data in so we can decide the interval
      refreshInterval: (latest) =>
        latest?.some((d) => d.status === "processing") ? 2000 : 0,
    },
  );

  const handleDelete = async (id: string) => {
    await fetch(`${API_BASE}/api/documents/${id}`, {
      method: "DELETE",
    });
    mutate(); // refetch after delete
  };

  const activeDocument =
    view.type === "document-chat"
      ? documents.find((d) => d.id === view.documentId)
      : undefined;

  return (
    <div className="app-layout">
      <Sidebar documents={documents} activeView={view} onNavigate={setView} />

      <main className="main-content">
        {view.type === "dashboard" && (
          <>
            <UploadZone onUploadComplete={mutate} />
            <DocumentList
              documents={documents}
              onChat={(id) =>
                setView({ type: "document-chat", documentId: id })
              }
              onDelete={handleDelete}
            />
          </>
        )}

        {(view.type === "document-chat" || view.type === "general-chat") && (
          <ChatInterface
            key={view.type === "document-chat" ? view.documentId : "general"}
            mode={view.type === "general-chat" ? "general" : "document"}
            document={activeDocument}
            onBack={() => setView({ type: "dashboard" })}
          />
        )}
      </main>
    </div>
  );
}
