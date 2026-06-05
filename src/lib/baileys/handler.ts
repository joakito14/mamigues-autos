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
} from "../db";
import { generateReply, extractConversationMetadata } from "../openrouter";

type WASock = ReturnType<typeof makeWASocket>;

function jidToPhone(jid: string): string {
  return jid.replace(/@(s\.whatsapp\.net|lid)$/, "");
}

// Extrae todos los [IMAGEN:id] del texto y devuelve los ids + texto limpio
function parseImageMarkers(text: string): { ids: number[]; clean: string } {
  const ids: number[] = [];
  const clean = text.replace(/\[IMAGEN:(\d+)\]/gi, (_, id) => {
    ids.push(parseInt(id, 10));
    return "";
  }).trim();
  return { ids, clean };
}

// Detecta [DERIVAR] y lo elimina del texto
function parseDerivarMarker(text: string): { derivar: boolean; clean: string } {
  const derivar = /\[DERIVAR\]/i.test(text);
  const clean = text.replace(/\[DERIVAR\]/gi, "").trim();
  return { derivar, clean };
}

export async function processIncomingMessage(
  sock: WASock,
  msg: proto.IWebMessageInfo
): Promise<void> {
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

  const phone = remoteJid;
  const pushName = msg.pushName ?? undefined;

  console.log(`[bot] ← Mensaje de ${jidToPhone(phone)} (${pushName ?? "sin nombre"}): "${text.slice(0, 80)}"`);

  const convo = getOrCreateConversation(phone, pushName);
  insertMessage(convo.id, "user", text);
  setReadStatus(convo.id, "new"); // cada mensaje entrante vuelve a "nuevos"

  const fresh = getConversationById(convo.id);
  if (!fresh || fresh.mode !== "AI") {
    console.log(`[bot] Conversación ${convo.id} en modo HUMAN — sin respuesta automática.`);
    return;
  }

  const history = getRecentHistory(convo.id, 20);
  console.log(`[bot] Llamando LLM con ${history.length} mensajes de historial...`);

  const t0 = Date.now();
  let reply: string;
  try {
    reply = await generateReply(history);
  } catch (err) {
    console.error("[bot] Error llamando al LLM:", err);
    return;
  }
  console.log(`[bot] LLM respondió en ${Date.now() - t0}ms`);

  if (!reply) return;

  // Parsear marcador de derivación y de imágenes
  const { derivar, clean: afterDerivar } = parseDerivarMarker(reply);
  const { ids: imageIds, clean: replyText } = parseImageMarkers(afterDerivar);

  // Guardar en DB el texto limpio (sin marcadores)
  insertMessage(convo.id, "assistant", replyText || reply);

  // Si el cliente quiere avanzar con la compra, pasar a modo HUMAN silenciosamente
  if (derivar) {
    setMode(convo.id, "HUMAN");
    console.log(`[bot] Derivación detectada — conversación ${convo.id} pasada a modo HUMAN`);
  }

  // Extraer metadata del cliente en background (no bloquea el envío)
  const historyForMeta = getRecentHistory(convo.id, 20);
  extractConversationMetadata(historyForMeta)
    .then(({ model, summary }) => updateConversationMeta(convo.id, model, summary))
    .catch(() => {});

  // Enviar texto primero (si hay contenido)
  if (replyText) {
    try {
      await sock.sendMessage(remoteJid, { text: replyText });
      console.log(`[bot] → Texto enviado a ${jidToPhone(phone)}: "${replyText.slice(0, 80)}"`);
    } catch (err) {
      console.error("[bot] Error enviando texto:", err);
    }
  }

  // Enviar imágenes de los productos detectados
  for (const id of imageIds) {
    const product = getProductById(id);
    if (!product?.image_base64) {
      console.log(`[bot] Producto id:${id} no tiene imagen, omitiendo.`);
      continue;
    }

    try {
      // Convertir base64 (con o sin prefijo data:image/...) a Buffer
      const base64Data = product.image_base64.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");

      await sock.sendMessage(remoteJid, {
        image: imageBuffer,
        caption: `${product.name} — ${product.price}`,
      });
      console.log(`[bot] → Imagen enviada a ${jidToPhone(phone)}: ${product.name}`);
    } catch (err) {
      console.error(`[bot] Error enviando imagen del producto ${product.name}:`, err);
    }
  }
}
