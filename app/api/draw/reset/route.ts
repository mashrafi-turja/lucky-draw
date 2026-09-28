import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST { session_id }
// Clears all winners for the session, resets every participant back
// to "pending", and restores each gift's remaining_quantity to its
// total_quantity. Use when you want to redo the whole draw.
export async function POST(req: NextRequest) {
  const { session_id } = await req.json();
  if (!session_id) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { error: winErr } = await db.from("winners").delete().eq("session_id", session_id);
  if (winErr) return NextResponse.json({ error: winErr.message }, { status: 500 });

  const { error: partErr } = await db
    .from("participants")
    .update({ status: "pending" })
    .eq("session_id", session_id);
  if (partErr) return NextResponse.json({ error: partErr.message }, { status: 500 });

  const { data: gifts, error: giftFetchErr } = await db
    .from("gifts")
    .select("id, total_quantity")
    .eq("session_id", session_id);
  if (giftFetchErr) return NextResponse.json({ error: giftFetchErr.message }, { status: 500 });

  for (const g of gifts ?? []) {
    await db.from("gifts").update({ remaining_quantity: g.total_quantity }).eq("id", g.id);
  }

  await db.from("draw_sessions").update({ status: "idle" }).eq("id", session_id);

  return NextResponse.json({ success: true });
}
