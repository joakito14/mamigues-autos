import { getAvailability, setDayAvailability } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(getAvailability());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Accepts single day or array of days
  const days = Array.isArray(body) ? body : [body];
  for (const day of days) {
    setDayAvailability(day);
  }
  return NextResponse.json({ ok: true });
}
