import { NextRequest, NextResponse } from "next/server";
import { getConversationById, setMode } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ conversationId: string }>;
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
  const mode: string = body.mode ?? "";

  if (mode !== "AI" && mode !== "HUMAN") {
    return NextResponse.json({ error: "Modo inválido (AI | HUMAN)" }, { status: 400 });
  }

  setMode(id, mode);
  return NextResponse.json({ ok: true, mode });
}
