import { NextRequest, NextResponse } from "next/server";
import { deleteConversation, getConversationById, setReadStatus } from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const { read_status } = await req.json();
  if (read_status !== "new" && read_status !== "read") {
    return NextResponse.json({ error: "read_status debe ser 'new' o 'read'" }, { status: 400 });
  }

  setReadStatus(id, read_status);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);

  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const conv = getConversationById(id);
  if (!conv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  deleteConversation(id);
  return NextResponse.json({ ok: true });
}
