"use client";

import { useEffect, useState } from "react";

interface StatusPayload {
  status: "disconnected" | "qr" | "connecting" | "connected";
  qrPng?: string;
  phone?: string;
  updatedAt?: number;
}

interface QRScreenProps {
  onConnected: (phone: string) => void;
}

export default function QRScreen({ onConnected }: QRScreenProps) {
  const [payload, setPayload] = useState<StatusPayload>({ status: "disconnected" });
  const [firstFetchAt] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/connection/status");
        if (!res.ok) return;
        const data: StatusPayload = await res.json();
        if (!cancelled) {
          setPayload(data);
          if (data.status === "connected" && data.phone) {
            onConnected(data.phone);
          }
        }
      } catch {}
    }

    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [onConnected]);

  const secondsDisconnected = Math.floor((Date.now() - firstFetchAt) / 1000);
  const showBotError =
    payload.status === "disconnected" &&
    !payload.qrPng &&
    secondsDisconnected > 10;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-sm w-full text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          Agente WhatsApp
        </h1>
        <p className="text-sm text-gray-500 mb-6">Conectar número</p>

        {payload.status === "qr" && payload.qrPng ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={payload.qrPng}
              alt="Código QR de WhatsApp"
              className="mx-auto rounded-lg mb-4"
              width={260}
              height={260}
            />
            <div className="flex items-center justify-center gap-2 text-sm text-amber-600">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Esperando escaneo...
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Abrí WhatsApp → Dispositivos vinculados → Vincular dispositivo
            </p>
          </>
        ) : payload.status === "connecting" ? (
          <div className="flex items-center justify-center gap-2 text-sm text-blue-600 py-6">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Conectando...
          </div>
        ) : showBotError ? (
          <div className="py-6 text-sm text-red-500 space-y-2">
            <p>No se detecta el proceso bot.</p>
            <p className="text-gray-500 text-xs">
              Corré <code className="bg-gray-100 px-1 rounded">npm run start:bot</code> en
              otra terminal y recargá la página.
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-6">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Esperando al bot...
          </div>
        )}
      </div>
    </div>
  );
}
