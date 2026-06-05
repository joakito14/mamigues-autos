import { NextResponse } from "next/server";
import { listProducts, createProduct } from "@/lib/db";

export function GET() {
  return NextResponse.json(listProducts());
}

export async function POST(request: Request) {
  const { name, price, description, image_base64 } = await request.json();
  if (!name?.trim() || !price?.trim() || !description?.trim()) {
    return NextResponse.json({ error: "name, price y description son requeridos" }, { status: 400 });
  }
  const product = createProduct(
    name.trim(),
    price.trim(),
    description.trim(),
    image_base64 ?? null
  );
  return NextResponse.json(product, { status: 201 });
}
