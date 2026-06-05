import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (
    !process.env.DASHBOARD_PASSWORD ||
    password !== process.env.DASHBOARD_PASSWORD
  ) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  const secret = process.env.SESSION_SECRET ?? process.env.DASHBOARD_PASSWORD;

  const response = NextResponse.json({ ok: true });
  response.cookies.set("session", secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 días
    path: "/",
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("session");
  return response;
}
