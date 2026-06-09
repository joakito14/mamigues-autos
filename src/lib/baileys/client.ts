import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import path from "node:path";
import { setConnectionState, getConnectionState } from "../db";
import { processIncomingMessage, retryPendingReplies } from "./handler";
import { getPendingOutbox, markOutboxSent } from "../db";

const AUTH_DIR = path.resolve(process.cwd(), "data", "auth");

const logger = pino({ level: "silent" });

export interface BotHandle {
  sock: ReturnType<typeof makeWASocket>;
  shutdown: () => Promise<void>;
}

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let handle: BotHandle | null = null;
let outboxTimer: ReturnType<typeof setInterval> | null = null;
let restartTimer: ReturnType<typeof setInterval> | null = null;
let pendingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectAttempts = 0;

export async function start(): Promise<void> {
  console.log("[bot] Iniciando conexión Baileys...");

  let version: [number, number, number] | undefined;
  try {
    const fetched = await fetchLatestBaileysVersion();
    version = fetched.version;
    console.log(`[bot] Versión WhatsApp Web: ${version.join(".")}`);
  } catch (err) {
    console.warn("[bot] No se pudo obtener última versión de Baileys:", err);
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  handle = {
    sock,
    shutdown: async () => {
      if (outboxTimer) clearInterval(outboxTimer);
      if (restartTimer) clearInterval(restartTimer);
      if (pendingTimer) clearInterval(pendingTimer);
      try {
        await sock.logout();
      } catch {}
      try {
        sock.end(undefined);
      } catch {}
    },
  };

  // ─── Manejo del estado de conexión ────────────────────────────────────────

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // QR recibido: guardarlo en DB para que el frontend lo muestre
    if (qr) {
      console.log("[bot] QR generado — abrí localhost:3000 para escanearlo");
      try {
        const qrcodeTerminal = await import("qrcode-terminal");
        qrcodeTerminal.default.generate(qr, { small: true });
      } catch {}
      setConnectionState({ status: "qr", qr_string: qr, phone: null });
      return;
    }

    if (connection === "connecting") {
      const currentStatus = getConnectionState().status;
      // Solo degradar a 'connecting' si venimos de 'disconnected' (primer arranque)
      if (currentStatus === "disconnected") {
        setConnectionState({ status: "connecting" });
      }
      return;
    }

    if (connection === "open") {
      const rawId = sock.user?.id ?? "";
      const phone = rawId.split(":")[0];
      console.log(`[bot] Conectado como ${phone}`);
      reconnectAttempts = 0; // resetear backoff al conectar exitosamente
      setConnectionState({ status: "connected", qr_string: null, phone });
      startOutboxPoller();
      startPendingPoller(sock);
      return;
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } })
        ?.output?.statusCode;
      console.log(`[bot] Conexión cerrada. Código: ${code}`);

      if (code === DisconnectReason.loggedOut) {
        console.log("[bot] Sesión cerrada por logout. Requiere nuevo QR.");
        setConnectionState({ status: "disconnected", qr_string: null, phone: null });
        return;
      }

      // Para cualquier otro código NO modificar el estado en DB —
      // si estábamos 'connected', seguir mostrando eso mientras reconectamos.
      scheduleReconnect(code);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    console.log(`[bot] messages.upsert tipo="${type}" cantidad=${messages.length}`);
    for (const msg of messages) {
      const jid = msg.key.remoteJid ?? "";
      const fromMe = msg.key.fromMe;
      const hasText = !!(msg.message?.conversation || msg.message?.extendedTextMessage?.text);
      console.log(`[bot]   jid=${jid} fromMe=${fromMe} hasText=${hasText} type=${type}`);
    }
    if (type !== "notify") return;
    for (const msg of messages) {
      await processIncomingMessage(sock, msg);
    }
  });

  // Poller de restart flag (desconexión manual desde el dashboard)
  startRestartPoller();
}

// ─── Reconexión con backoff ───────────────────────────────────────────────────

function scheduleReconnect(code: number | undefined): void {
  if (reconnectTimer) return;
  reconnectAttempts++;
  // Backoff exponencial: 5s → 10s → 20s → 30s (tope)
  // Códigos 428/440 (sesión reemplazada): base más alta, 15s
  const base = (code === 428 || code === 440) ? 15_000 : 5_000;
  const delay = Math.min(base * Math.pow(1.5, reconnectAttempts - 1), 30_000);
  console.log(`[bot] Reconectando en ${Math.round(delay / 1000)}s... (intento ${reconnectAttempts}, código ${code})`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (handle) {
      try { handle.sock.end(undefined); } catch {}
      handle = null;
    }
    start();
  }, delay);
}

// ─── Poller de respuestas pendientes ─────────────────────────────────────────

function startPendingPoller(sock: ReturnType<typeof makeWASocket>): void {
  if (pendingTimer) clearInterval(pendingTimer);
  pendingTimer = setInterval(async () => {
    await retryPendingReplies(sock).catch(() => {});
  }, 15_000);
}

// ─── Poller de outbox ─────────────────────────────────────────────────────────

function startOutboxPoller(): void {
  if (outboxTimer) clearInterval(outboxTimer);
  outboxTimer = setInterval(async () => {
    if (!handle) return;
    const pending = getPendingOutbox(20);
    for (const item of pending) {
      try {
        // phone puede ser JID completo (con @s.whatsapp.net o @lid) o solo número
        const jid = item.phone.includes("@") ? item.phone : `${item.phone}@s.whatsapp.net`;
        await handle.sock.sendMessage(jid, { text: item.content });
        markOutboxSent(item.id);
        console.log(`[bot] → Outbox enviado a ${item.phone}: "${item.content.slice(0, 60)}"`);
      } catch (err) {
        console.warn(`[bot] Error enviando outbox id=${item.id}:`, err);
      }
    }
  }, 2000);
}

// ─── Poller de flag de restart (desconexión manual) ───────────────────────────

function startRestartPoller(): void {
  if (restartTimer) clearInterval(restartTimer);
  const { existsSync, unlinkSync, rmSync } = require("node:fs");
  const RESTART_FLAG = path.resolve(process.cwd(), "data", ".restart");
  const AUTH_PATH = path.resolve(process.cwd(), "data", "auth");

  restartTimer = setInterval(async () => {
    if (!existsSync(RESTART_FLAG)) return;
    console.log("[bot] Flag de restart detectado — reiniciando sesión...");
    try {
      unlinkSync(RESTART_FLAG);
    } catch {}
    if (restartTimer) clearInterval(restartTimer);
    if (outboxTimer) clearInterval(outboxTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;

    if (handle) {
      try {
        await handle.sock.logout();
      } catch {}
      try {
        handle.sock.end(undefined);
      } catch {}
      handle = null;
    }

    try {
      rmSync(AUTH_PATH, { recursive: true, force: true });
    } catch {}

    setTimeout(() => start(), 500);
  }, 1000);
}
