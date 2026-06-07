import type makeWASocket from "@whiskeysockets/baileys";
import type { proto } from "@whiskeysockets/baileys";
import {
  getOrCreateConversation,
  getConversationById,
  insertMessage,
  getRecentHistory,
  getProductById,
  updateConversationMeta,
  setReadStatus,
  setMode,
  setBotStatus,
  setPendingReply,
  getConversationsPendingReply,
  createAppointment,
} from "../db";
import { generateReply, extractConversationMetadata } from "../openrouter";

type WASock = ReturnType<typeof makeWASocket>;

function jidToPhone(jid: string): string {
  return jid.replace(/@(s\.whatsapp\.net|lid)$/, "");
}

function parseImageMarkers(text: string): { ids: number[]; clean: string } {
  const ids: number[] = [];
  const clean = text.replace(/\[IMAGEN:(\d+)\]/gi, (_, id) => {
    ids.push(parseInt(id, 10));
    return "";
  }).trim();
  return { ids, clean };
}

function parseDerivarMarker(text: string): { derivar: boolean; clean: string } {
  const derivar = /\[DERIVAR\]/i.test(text);
  const clean = text.replace(/\[DERIVAR\]/gi, "").trim();
  return { derivar, clean };
}

interface CitaData { datetime: string; clientName: string; title: string; }

function parseCitaMarkers(text: string): { citas: CitaData[]; clean: string } {
  const citas: CitaData[] = [];
  const clean = text.replace(
    /\[CITA:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):([^:]+):([^\]]+)\]/gi,
    (_, datetime, clientName, title) => {
      citas.push({ datetime, clientName: clientName.trim(), title: title.trim() });
      return "";
    }
  ).trim();
  return { citas, clean };
}

// ─── Typing delay + presencia ─────────────────────────────────────────────────

// Delay proporcional al largo del mensaje (3-7 segundos)
function typingDelay(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const base = 3000;
  const perWord = 120; // ms por palabra, simula velocidad de tipeo
  return Math.min(base + words * perWord, 7000);
}

async function sendWithTyping(sock: WASock, jid: string, text: string): Promise<void> {
  const delay = typingDelay(text);
  try { await sock.sendPresenceUpdate("composing", jid); } catch {}
  await new Promise((r) => setTimeout(r, delay));
  try { await sock.sendPresenceUpdate("paused", jid); } catch {}
  await sock.sendMessage(jid, { text });
}

// ─── Helper compartido: genera y envía respuesta ──────────────────────────────

async function sendReply(
  sock: WASock,
  remoteJid: string,
  convId: number
): Promise<boolean> {
  const history = getRecentHistory(convId, 20);
  setBotStatus("processing", jidToPhone(remoteJid));

  let reply: string;
  try {
    reply = await generateReply(history);
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120);
    console.error("[bot] Error llamando al LLM:", err);
    setBotStatus("error", msg);
    return false;
  }

  setBotStatus("idle");
  if (!reply) return true;

  const { derivar, clean: afterDerivar } = parseDerivarMarker(reply);
  const { citas, clean: afterCitas } = parseCitaMarkers(afterDerivar);
  const { ids: imageIds, clean: replyText } = parseImageMarkers(afterCitas);

  // Crear citas en DB
  for (const cita of citas) {
    try {
      const startTs = Math.floor(new Date(cita.datetime + "-03:00").getTime() / 1000);
      createAppointment({
        conversation_id: convId,
        phone: remoteJid,
        client_name: cita.clientName,
        title: cita.title,
        start_time: startTs,
        end_time: startTs + 3600,
      });
      console.log(`[bot] Cita creada: ${cita.clientName} — ${cita.datetime}`);
    } catch (err) {
      console.error("[bot] Error creando cita:", err);
    }
  }

  insertMessage(convId, "assistant", replyText || reply);

  if (derivar) {
    setMode(convId, "HUMAN");
    console.log(`[bot] Derivación detectada — conversación ${convId} pasada a modo HUMAN`);
  }

  // Metadata en background
  extractConversationMetadata(getRecentHistory(convId, 20))
    .then(({ model, summary }) => updateConversationMeta(convId, model, summary))
    .catch(() => {});

  // Enviar texto con delay + indicador de escritura
  if (replyText) {
    try {
      await sendWithTyping(sock, remoteJid, replyText);
      console.log(`[bot] → Texto enviado a ${jidToPhone(remoteJid)}: "${replyText.slice(0, 80)}"`);
    } catch (err) {
      console.error("[bot] Error enviando texto:", err);
    }
  }

  // Enviar imágenes (también con pequeña pausa previa)
  for (const id of imageIds) {
    const product = getProductById(id);
    if (!product?.image_base64) {
      console.log(`[bot] Producto id:${id} no tiene imagen, omitiendo.`);
      continue;
    }
    try {
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
      const base64Data = product.image_base64.replace(/^data:image\/\w+;base64,/, "");
      await sock.sendMessage(remoteJid, {
        image: Buffer.from(base64Data, "base64"),
        caption: `${product.name} — ${product.price}`,
      });
      console.log(`[bot] → Imagen enviada a ${jidToPhone(remoteJid)}: ${product.name}`);
    } catch (err) {
      console.error(`[bot] Error enviando imagen del producto ${id}:`, err);
    }
  }

  return true;
}

// ─── Mensaje entrante ─────────────────────────────────────────────────────────

export async function processIncomingMessage(
  sock: WASock,
  msg: proto.IWebMessageInfo
): Promise<void> {
  // Solo responder cuando el cliente escribe primero (100% reactivo)
  if (msg.key.fromMe) return;

  const remoteJid = msg.key.remoteJid ?? "";
  if (remoteJid.endsWith("@g.us")) return;

  const isDirectChat =
    remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid");
  if (!isDirectChat) return;

  const text =
    msg.message?.conversation ??
    msg.message?.extendedTextMessage?.text ??
    null;
  if (!text) return;

  const pushName = msg.pushName ?? undefined;
  console.log(`[bot] ← Mensaje de ${jidToPhone(remoteJid)} (${pushName ?? "sin nombre"}): "${text.slice(0, 80)}"`);

  const convo = getOrCreateConversation(remoteJid, pushName);
  insertMessage(convo.id, "user", text);
  setReadStatus(convo.id, "new");

  const fresh = getConversationById(convo.id);
  if (!fresh || fresh.mode !== "AI") {
    console.log(`[bot] Conversación ${convo.id} en modo HUMAN — sin respuesta automática.`);
    return;
  }

  console.log(`[bot] Llamando LLM...`);
  const ok = await sendReply(sock, remoteJid, convo.id);
  setPendingReply(convo.id, !ok);
}

// ─── Reintento de pendientes ──────────────────────────────────────────────────

export async function retryPendingReplies(sock: WASock): Promise<void> {
  const pending = getConversationsPendingReply();
  if (pending.length === 0) return;

  console.log(`[bot] ${pending.length} conversación(es) pendiente(s) — reintentando...`);
  setBotStatus("processing", `${pending.length} pendiente${pending.length > 1 ? "s" : ""}`);

  for (const conv of pending) {
    const history = getRecentHistory(conv.id, 20);
    const lastUserMsg = [...history].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) {
      setPendingReply(conv.id, false);
      continue;
    }

    console.log(`[bot] Reintentando pendiente para ${jidToPhone(conv.phone)}...`);
    const ok = await sendReply(sock, conv.phone, conv.id);
    if (ok) {
      setPendingReply(conv.id, false);
      console.log(`[bot] Pendiente resuelto para ${jidToPhone(conv.phone)}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
