"use client";

import { useEffect, useState } from "react";
import SettingsPanel from "./SettingsPanel";

interface DashboardHeaderProps {
  phone: string;
  onDisconnect: () => void;
}

type BotState = "idle" | "processing" | "ratelimit" | "error";

interface BotStatus {
  state: BotState;
  detail: string;
  updated_at: number;
}

function BotStatusBadge({ status }: { status: BotStatus | null }) {
  if (!status) return null;

  // Si updated_at es > 90s atrás y no está idle, asumir que volvió a idle
  const stale = status.updated_at > 0 && (Math.floor(Date.now() / 1000) - status.updated_at) > 90;
  const state: BotState = stale && status.state !== "idle" ? "idle" : status.state;

  const configs: Record<BotState, { dot: string; label: string; bg: string; text: string }> = {
    idle: {
      dot: "bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.5)]",
      label: "Activo",
      bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
      text: "text-emerald-700 dark:text-emerald-400",
    },
    processing: {
      dot: "bg-blue-400 animate-pulse",
      label: status.detail ? `Procesando · ${status.detail}` : "Procesando...",
      bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
      text: "text-blue-700 dark:text-blue-400",
    },
    ratelimit: {
      dot: "bg-amber-400 animate-pulse",
      label: status.detail || "Rate limit — reintentando",
      bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
      text: "text-amber-700 dark:text-amber-400",
    },
    error: {
      dot: "bg-red-400",
      label: status.detail ? `Error: ${status.detail.slice(0, 40)}` : "Error",
      bg: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800",
      text: "text-red-700 dark:text-red-400",
    },
  };

  const c = configs[state];

  return (
    <span className={`hidden md:inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full border ${c.bg} ${c.text} max-w-[220px] truncate`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      <span className="truncate">{c.label}</span>
    </span>
  );
}

export default function DashboardHeader({ phone, onDisconnect }: DashboardHeaderProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/bot-status");
        if (!cancelled && res.ok) setBotStatus(await res.json());
      } catch {}
    }

    poll();
    const id = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  async function handleDisconnect() {
    await fetch("/api/connection/disconnect", { method: "POST" });
    onDisconnect();
  }

  return (
    <>
      <header className="flex items-center justify-between px-4 md:px-6 py-3 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 shrink-0">

        {/* Logo + número + estado bot */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center shadow-md shrink-0">
            <span className="text-white font-black text-base tracking-tighter leading-none">M</span>
          </div>
          <div className="flex flex-col leading-tight shrink-0">
            <span className="font-black text-gray-900 dark:text-white text-base tracking-tight leading-none">
              MaMigues
            </span>
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 tracking-widest uppercase leading-none mt-0.5">
              ventas
            </span>
          </div>

          {/* Número conectado */}
          <div className="hidden sm:flex items-center gap-1.5 ml-1 shrink-0">
            <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1" />
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_1px_rgba(16,185,129,0.6)] shrink-0" />
            <span className="text-xs text-gray-400 dark:text-slate-500">
              +{phone.replace(/@(s\.whatsapp\.net|lid)$/, "")}
            </span>
          </div>

          {/* Estado del bot */}
          <div className="hidden sm:flex items-center gap-1.5 ml-1">
            <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1" />
            <BotStatusBadge status={botStatus} />
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowSettings(true)}
            className="text-xs text-gray-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 border border-gray-300 dark:border-slate-600 hover:border-emerald-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            <span className="hidden sm:inline">Configurar bot</span>
            <span className="sm:hidden">Config.</span>
          </button>
          <button
            onClick={handleDisconnect}
            className="text-xs text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-300 dark:border-slate-600 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            <span className="hidden sm:inline">Desconectar</span>
            <span className="sm:hidden">✕</span>
          </button>
        </div>
      </header>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </>
  );
}
