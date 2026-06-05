import { NextResponse } from "next/server";
import { setConnectionState } from "@/lib/db";
import fs from "node:fs";
import path from "node:path";

export async function POST() {
  setConnectionState({ status: "disconnected", qr_string: null, phone: null });

  const authDir = path.resolve(process.cwd(), "auth");
  try {
    fs.rmSync(authDir, { recursive: true, force: true });
  } catch {}

  // Señal para que el proceso bot se reinicie limpio
  const restartFlag = path.resolve(process.cwd(), "data", ".restart");
  try {
    fs.writeFileSync(restartFlag, "");
  } catch {}

  return NextResponse.json({ ok: true });
}
