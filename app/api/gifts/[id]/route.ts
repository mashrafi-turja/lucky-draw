import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// PATCH { gift_name?, total_quantity? }
// Adjusts remaining_quantity by the same delta as total_quantity so
// edits don't silently overwrite gifts already awarded mid-draw.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const db = supabaseAdmin();

  const { data: existing, error: fetchErr } = await db
    .from("gifts")
    .select("*")
    .eq("id", params.id)
    .single();
  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Gift not found" }, { status: 404 });
  }

  const update: Record<string, any> = {};
  if (typeof body.gift_name === "string" && body.gift_name.trim()) {
    update.gift_name = body.gift_name.trim();
  }
  if (Number.isFinite(body.total_quantity)) {
    const delta = body.total_quantity - existing.total_quantity;
    update.total_quantity = body.total_quantity;
    update.remaining_quantity = Math.max(0, existing.remaining_quantity + delta);
  }

  const { data, error } = await db
    .from("gifts")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ gift: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { error } = await db.from("gifts").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
