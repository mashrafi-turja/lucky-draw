import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST { session_id }
// Wipes EVERYTHING inside a project: winners, participants and gifts.
// (Different from /api/draw/reset, which only clears winners and keeps
// the participant list and gift setup so you can re-run the draw.)
export async function POST(req: NextRequest) {
  const { session_id } = await req.json();
  if (!session_id) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  const db = supabaseAdmin();
  for (const table of ["winners", "participants", "gifts"]) {
    const { error } = await db.from(table).delete().eq("session_id", session_id);
    if (error) return NextResponse.json({ error: `${table}: ${error.message}` }, { status: 500 });
  }
  await db.from("draw_sessions").update({ status: "idle" }).eq("id", session_id);

  return NextResponse.json({ success: true });
}
