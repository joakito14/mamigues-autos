"use client";

import { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import ModeToggle from "./ModeToggle";

interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "human";
  content: string;
  created_at: number;
}

interface ConversationPanelProps {
  conversationId: number;
  phone: string;
  name: string | null;
  initialMode: "AI" | "HUMAN";
  onDelete: () => void;
  onModeChange: (newMode: "AI" | "HUMAN") => void;
  onBack?: () => void;
}

export default function ConversationPanel({
  conversationId,
  phone,
  name,
  initialMode,
  onDelete,
  onModeChange,
  onBack,
}: ConversationPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<"AI" | "HUMAN">(initialMode);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Cargar mensajes iniciales
  useEffect(() => {
    setMode(initialMode);
    fetchMessages();
  }, [conversationId, initialMode]);

  // Polling cada 2s
  useEffect(() => {
    const timer = setInterval(fetchMessages, 2000);
    return () => clearInterval(timer);
  }, [conversationId]);

  // Scroll al fondo cuando llegan mensajes nuevos
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function fetchMessages() {
    try {
      const res = await fetch(`/api/messages/${conversationId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch {}
  }

  function handleModeToggle(newMode: "AI" | "HUMAN") {
    setMode(newMode);
    onModeChange(newMode);
  }

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    try {
      await fetch(`/api/messages/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      await fetchMessages();
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
    setShowDeleteConfirm(false);
    onDelete();
  }

  const cleanPhone = (p: string) => p.replace(/@(s\.whatsapp\.net|lid)$/, "");
  const displayName = name ?? cleanPhone(phone);

  return (
    <div className="flex flex-col h-full">
      {/* Header del panel */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Flecha volver — solo visible en mobile */}
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden shrink-0 p-1 -ml-1 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Volver"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 dark:text-slate-100 truncate">{displayName}</h2>
            {name && <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{cleanPhone(phone)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ModeToggle
            conversationId={conversationId}
            mode={mode}
            onToggle={handleModeToggle}
          />
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            Borrar
          </button>
        </div>
      </div>

      {/* Área de mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50 dark:bg-slate-950">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400 dark:text-slate-500 mt-8">
            Sin mensajes en esta conversación.
          </p>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              createdAt={msg.created_at}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
        {mode === "AI" ? (
          <p className="text-sm text-center text-gray-400 dark:text-slate-500 py-1">
            El bot responde automáticamente en modo IA.
          </p>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Escribí un mensaje como asesor..."
              className="flex-1 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-amber-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Enviar
            </button>
          </div>
        )}
      </div>

      {/* Modal de confirmación de borrado */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-2">
              Borrar conversación
            </h3>
            <p className="text-sm text-gray-600 dark:text-slate-300 mb-4">
              ¿Seguro que querés borrar la conversación con{" "}
              <strong>{displayName}</strong>? Esto eliminará todos los mensajes.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
