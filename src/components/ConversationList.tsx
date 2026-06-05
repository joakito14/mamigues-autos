"use client";

import { useState } from "react";

interface ConversationItem {
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

interface ConversationListProps {
  conversations: ConversationItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onReadStatusChange: (id: number, status: "new" | "read") => void;
}

function cleanPhone(phone: string): string {
  return phone.replace(/@(s\.whatsapp\.net|lid)$/, "");
}

function relativeTime(unixTs: number | null): string {
  if (!unixTs) return "";
  const diff = Math.floor(Date.now() / 1000) - unixTs;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onReadStatusChange,
}: ConversationListProps) {
  const [activeTab, setActiveTab] = useState<"new" | "read">("new");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [modeFilter, setModeFilter] = useState<"all" | "AI" | "HUMAN">("all");
  const [modelFilter, setModelFilter] = useState<string>("all");

  const newCount = conversations.filter((c) => c.read_status === "new").length;
  const readCount = conversations.filter((c) => c.read_status === "read").length;

  // Modelos únicos para el filtro
  const uniqueModels = [...new Set(
    conversations.map((c) => c.last_model).filter(Boolean)
  )] as string[];

  // Aplicar todos los filtros
  const visible = conversations
    .filter((c) => c.read_status === (activeTab === "new" ? "new" : "read"))
    .filter((c) => modeFilter === "all" || c.mode === modeFilter)
    .filter((c) => modelFilter === "all" || c.last_model === modelFilter);

  function toggleSummary(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleStatusToggle(e: React.MouseEvent, conv: ConversationItem) {
    e.stopPropagation();
    const next = conv.read_status === "new" ? "read" : "new";
    onReadStatusChange(conv.id, next);
  }

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-gray-400 dark:text-slate-500">
        Sin conversaciones aún.
        <br />
        Esperando mensajes entrantes.
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Tabs nuevos / leídos */}
      <div className="flex border-b border-gray-200 dark:border-slate-700 shrink-0">
        <button
          onClick={() => setActiveTab("new")}
          className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
            activeTab === "new"
              ? "border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40"
              : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
          }`}
        >
          Nuevos
          {newCount > 0 && (
            <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {newCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("read")}
          className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
            activeTab === "read"
              ? "border-slate-500 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40"
              : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
          }`}
        >
          Leídos
          {readCount > 0 && (
            <span className="bg-slate-400 dark:bg-slate-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {readCount}
            </span>
          )}
        </button>
      </div>

      {/* Filtros */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 shrink-0 space-y-2">
        {/* Filtro por modo */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide w-10 shrink-0">Modo</span>
          <div className="flex gap-1">
            {(["all", "AI", "HUMAN"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModeFilter(m)}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
                  modeFilter === m
                    ? m === "AI"
                      ? "bg-emerald-500 border-emerald-600 text-white"
                      : m === "HUMAN"
                      ? "bg-amber-400 border-amber-500 text-amber-900"
                      : "bg-gray-700 dark:bg-slate-300 border-gray-800 dark:border-slate-400 text-white dark:text-slate-900"
                    : "bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700"
                }`}
              >
                {m === "all" ? "Todos" : m}
              </button>
            ))}
          </div>
        </div>

        {/* Filtro por modelo */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide w-10 shrink-0">Auto</span>
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="flex-1 text-[10px] font-medium border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400"
          >
            <option value="all">Todos los modelos</option>
            {uniqueModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista */}
      <ul className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
        {visible.length === 0 && (
          <li className="px-4 py-6 text-xs text-center text-gray-400 dark:text-slate-500">
            Sin conversaciones con estos filtros.
          </li>
        )}

        {visible.map((conv) => {
          const isSelected = conv.id === selectedId;
          const isAI = conv.mode === "AI";
          const hasModel = !!conv.last_model;
          const isExpanded = expandedId === conv.id;
          const displayName = conv.name ?? cleanPhone(conv.phone);
          const isNew = conv.read_status === "new";

          return (
            <li key={conv.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => { onSelect(conv.id); setExpandedId(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { onSelect(conv.id); setExpandedId(null); } }}
                className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-emerald-50 dark:bg-emerald-950/50 border-l-4 border-emerald-500"
                    : "hover:bg-gray-50 dark:hover:bg-slate-800/60 border-l-4 border-transparent"
                }`}
              >
                {/* Fila 1: nombre + modo + hora */}
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-gray-900 dark:text-slate-100 truncate max-w-[55%]">
                    {displayName}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      isAI
                        ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-400"
                        : "bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-400"
                    }`}>
                      {isAI ? "IA" : "HUMAN"}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-slate-500">
                      {relativeTime(conv.last_message_at)}
                    </span>
                  </div>
                </div>

                {/* Fila 2: preview + botón modelo + badge estado */}
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-gray-500 dark:text-slate-400 truncate flex-1">
                    {conv.last_message_preview ?? ""}
                  </p>

                  <button
                    onClick={(e) => toggleSummary(e, conv.id)}
                    className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                      hasModel
                        ? isExpanded
                          ? "bg-amber-400 border-amber-500 text-amber-900"
                          : "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-400 hover:bg-amber-200"
                        : isExpanded
                        ? "bg-gray-300 dark:bg-slate-600 border-gray-400 text-gray-700 dark:text-slate-200"
                        : "bg-gray-100 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-200"
                    }`}
                  >
                    {hasModel ? conv.last_model! : "inter."}
                  </button>

                  <button
                    onClick={(e) => handleStatusToggle(e, conv)}
                    title={isNew ? "Mover a Leídos" : "Mover a Nuevos"}
                    className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
                      isNew
                        ? "bg-emerald-100 dark:bg-emerald-900/50 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200"
                        : "bg-red-100 dark:bg-red-900/40 border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 hover:bg-red-200"
                    }`}
                  >
                    {isNew ? "nuevo" : "leído"}
                  </button>
                </div>

                {/* Fila 3: resumen expandible */}
                {isExpanded && (
                  <div
                    className="mt-2 text-xs text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 leading-relaxed"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {conv.client_summary
                      ? conv.client_summary
                      : "Todavía no hay suficiente información para generar un resumen."}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
