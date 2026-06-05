import { getBotStatus } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(getBotStatus());
}
