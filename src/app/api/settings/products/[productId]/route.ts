import { NextResponse } from "next/server";
import { updateProduct, deleteProduct } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;
  const id = parseInt(productId, 10);
  if (isNaN(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const data = await request.json();
  updateProduct(id, data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;
  const id = parseInt(productId, 10);
  if (isNaN(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  deleteProduct(id);
  return NextResponse.json({ ok: true });
}
