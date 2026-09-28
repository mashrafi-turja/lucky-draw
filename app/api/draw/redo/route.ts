import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST { winner_id }
// Transparent re-draw: removes a specific winner entry (e.g. a
// no-show or a duplicate/disqualified entry), returns that gift unit
// to inventory and the participant to the pending pool, so the admin
// can run Draw Next again. This is a visible, auditable action in
// the admin UI — it does not let anyone pick who wins next; the next
// draw is still a fresh uniform-random pick.
export async function POST(req: NextRequest) {
  const { winner_id } = await req.json();
  if (!winner_id) {
    return NextResponse.json({ error: "winner_id is required" }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: winner, error: fetchErr } = await db
    .from("winners")
    .select("*")
    .eq("id", winner_id)
    .single();
  if (fetchErr || !winner) {
    return NextResponse.json({ error: "Winner not found" }, { status: 404 });
  }

  if (winner.participant_id) {
    await db.from("participants").update({ status: "pending" }).eq("id", winner.participant_id);
  }

  const { data: gift } = await db
    .from("gifts")
    .select("id, remaining_quantity")
    .eq("session_id", winner.session_id)
    .eq("gift_name", winner.gift)
    .single();
  if (gift) {
    await db.from("gifts").update({ remaining_quantity: gift.remaining_quantity + 1 }).eq("id", gift.id);
  }

  const { error: delErr } = await db.from("winners").delete().eq("id", winner_id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
