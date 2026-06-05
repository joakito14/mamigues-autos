import { listAllAppointments, createAppointment } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(listAllAppointments());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { client_name, title, start_time, end_time, phone, conversation_id, notes, status } = body;
  if (!client_name || !title || !start_time || !end_time) {
    return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
  }
  const appt = createAppointment({ client_name, title, start_time, end_time, phone, conversation_id, notes, status });
  return NextResponse.json(appt, { status: 201 });
}
