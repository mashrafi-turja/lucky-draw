import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Lightweight counters for the admin dashboard's live-updating cards.
// Uses COUNT queries, so it stays accurate for any number of participants.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const [total, pending, winners, gifts] = await Promise.all([
    db.from("participants").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
    db
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("status", "pending"),
    db.from("winners").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
    db
      .from("gifts")
      .select("id, gift_name, total_quantity, remaining_quantity")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
  ]);

  const failure = total.error || pending.error || winners.error || gifts.error;
  if (failure) return NextResponse.json({ error: failure.message }, { status: 500 });

  const giftList = gifts.data ?? [];
  return NextResponse.json({
    total: total.count ?? 0,
    pending: pending.count ?? 0,
    winners: winners.count ?? 0,
    giftsRemaining: giftList.reduce((sum, g) => sum + g.remaining_quantity, 0),
    giftTypes: giftList.length,
    gifts: giftList,
  });
}
