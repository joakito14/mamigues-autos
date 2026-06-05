import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { PERSONALITY_PROMPT } from "@/lib/system-prompt";

export const dynamic = "force-dynamic";

export function GET() {
  const value = getSetting("personality") ?? PERSONALITY_PROMPT;
  return NextResponse.json({ value });
}

export async function POST(request: Request) {
  const { value } = await request.json();
  if (typeof value !== "string" || !value.trim()) {
    return NextResponse.json({ error: "value requerido" }, { status: 400 });
  }
  setSetting("personality", value.trim());
  return NextResponse.json({ ok: true });
}
