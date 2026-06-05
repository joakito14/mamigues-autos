"use client";

import { useCallback, useEffect, useState } from "react";
import QRScreen from "./QRScreen";
import DashboardHeader from "./DashboardHeader";
import ConversationList from "./ConversationList";
import ConversationPanel from "./ConversationPanel";
import CalendarPanel from "./CalendarPanel";
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
  const [view, setView] = useState<"chat" | "agenda">("chat");

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

        {view === "agenda" ? (
          /* ── Vista Agenda ── */
          <CalendarPanel
            onBack={() => setView("chat")}
            onViewConversation={(id) => { setView("chat"); setSelectedId(id); }}
          />
        ) : (
          <>
            {/* Sidebar — full screen en mobile cuando no hay chat abierto */}
            <aside className={`flex flex-col border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0 w-full md:w-80 ${selectedId !== null ? "hidden md:flex" : "flex"}`}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
                {/* Tabs: Mensajes / Agenda */}
                <div className="flex gap-1">
                  <button onClick={() => setView("chat")}
                    className="text-xs font-semibold px-3 py-1 rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300">
                    Mensajes
                  </button>
                  <button onClick={() => setView("agenda")}
                    className="text-xs font-semibold px-3 py-1 rounded-lg text-gray-400 dark:text-slate-500 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                    Agenda
                  </button>
                </div>
                <ThemeToggle />
              </div>
              <ConversationList
                conversations={conversations}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onReadStatusChange={handleReadStatusChange}
              />
            </aside>

            {/* Panel — full screen en mobile cuando hay chat abierto */}
            <main className={`flex-1 overflow-hidden flex flex-col ${selectedId !== null ? "flex" : "hidden md:flex"}`}>
              {selected ? (
                <ConversationPanel
                  key={selected.id}
                  conversationId={selected.id}
                  phone={selected.phone}
                  name={selected.name}
                  initialMode={selected.mode}
                  onDelete={handleDeleteConversation}
                  onModeChange={(newMode) => handleModeChange(selected.id, newMode)}
                  onBack={() => setSelectedId(null)}
                />
              ) : (
                <div className="hidden md:flex items-center justify-center h-full text-sm text-gray-400 dark:text-slate-500">
                  Seleccioná una conversación para ver los mensajes.
                </div>
              )}
            </main>
          </>
        )}
      </div>
    </div>
  );
}
