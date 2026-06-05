import { NextRequest, NextResponse } from "next/server";
import {
  getConversationById,
  getMessages,
  insertMessage,
  enqueueOutbox,
} from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);

  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const conv = getConversationById(id);
  if (!conv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const messages = getMessages(id, 100);
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);

  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const conv = getConversationById(id);
  if (!conv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const body = await req.json();
  const content: string = body.content ?? "";

  if (!content.trim()) {
    return NextResponse.json({ error: "Contenido vacío" }, { status: 400 });
  }

  // Insertar en mensajes como 'human' (visible en el dashboard)
  const msg = insertMessage(id, "human", content.trim());

  // Encolar en outbox para que el bot lo envíe vía Baileys
  enqueueOutbox(id, conv.phone, content.trim());

  return NextResponse.json({ ok: true, messageId: msg.id });
}
