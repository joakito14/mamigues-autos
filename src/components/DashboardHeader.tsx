"use client";

import { useState } from "react";
import SettingsPanel from "./SettingsPanel";

interface DashboardHeaderProps {
  phone: string;
  onDisconnect: () => void;
}

export default function DashboardHeader({ phone, onDisconnect }: DashboardHeaderProps) {
  const [showSettings, setShowSettings] = useState(false);

  async function handleDisconnect() {
    await fetch("/api/connection/disconnect", { method: "POST" });
    onDisconnect();
  }

  return (
    <>
      <header className="flex items-center justify-between px-6 py-3 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 shrink-0">

        {/* Logo */}
        <div className="flex items-center gap-3">
          {/* Ícono M */}
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center shadow-md shrink-0">
            <span className="text-white font-black text-base tracking-tighter leading-none">M</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-black text-gray-900 dark:text-white text-base tracking-tight leading-none">
              MaMigues
            </span>
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 tracking-widest uppercase leading-none mt-0.5">
              ventas
            </span>
          </div>

          {/* Separador + número conectado */}
          <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1" />
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_1px_rgba(16,185,129,0.6)]" />
            <span className="text-xs text-gray-400 dark:text-slate-500">
              +{phone.replace(/@(s\.whatsapp\.net|lid)$/, "")}
            </span>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="text-xs text-gray-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 border border-gray-300 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            Configurar bot
          </button>
          <button
            onClick={handleDisconnect}
            className="text-xs text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-300 dark:border-slate-600 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Desconectar
          </button>
        </div>
      </header>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </>
  );
}
