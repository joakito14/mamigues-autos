"use client";

import { useCallback, useEffect, useState } from "react";
import QRScreen from "./QRScreen";
import DashboardHeader from "./DashboardHeader";
import ConversationList from "./ConversationList";
import ConversationPanel from "./ConversationPanel";
import ThemeToggle from "./ThemeToggle";

interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
  last_message_at: number | null;
  last_message_preview: string | null;
  last_model: string | null;
  client_summary: string | null;
  read_status: "new" | "read";
}

export default function ConnectionGate() {
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/connection/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "connected" && data.phone) {
          setConnected(true);
          setPhone(data.phone);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!connected) return;
    fetchConversations();
    const timer = setInterval(fetchConversations, 2000);
    return () => clearInterval(timer);
  }, [connected]);

  async function fetchConversations() {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data: Conversation[] = await res.json();
        setConversations(data);
      }
    } catch {}
  }

  const handleConnected = useCallback((connectedPhone: string) => {
    setPhone(connectedPhone);
    setConnected(true);
  }, []);

  function handleDisconnect() {
    setConnected(false);
    setPhone("");
    setConversations([]);
    setSelectedId(null);
  }

  function handleModeChange(id: number, newMode: "AI" | "HUMAN") {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, mode: newMode } : c))
    );
  }

  function handleDeleteConversation() {
    setSelectedId(null);
    fetchConversations();
  }

  async function handleReadStatusChange(id: number, status: "new" | "read") {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, read_status: status } : c))
    );
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read_status: status }),
    });
  }

  if (!connected) {
    return <QRScreen onConnected={handleConnected} />;
  }

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-slate-950">
      <DashboardHeader phone={phone} onDisconnect={handleDisconnect} />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 flex flex-col border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase text-gray-400 dark:text-slate-500 tracking-wide">
              Conversaciones
            </h2>
            <ThemeToggle />
          </div>
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReadStatusChange={handleReadStatusChange}
          />
        </aside>

        {/* Panel derecho */}
        <main className="flex-1 overflow-hidden">
          {selected ? (
            <ConversationPanel
              key={selected.id}
              conversationId={selected.id}
              phone={selected.phone}
              name={selected.name}
              initialMode={selected.mode}
              onDelete={handleDeleteConversation}
              onModeChange={(newMode) => handleModeChange(selected.id, newMode)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-slate-500">
              Seleccioná una conversación para ver los mensajes.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
