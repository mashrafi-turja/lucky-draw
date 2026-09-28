import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST { session_id } -> make this project the one shown on /draw
export async function POST(req: NextRequest) {
  const { session_id } = await req.json();
  if (!session_id) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error: onErr } = await db
    .from("draw_sessions")
    .update({ is_live: true })
    .eq("id", session_id);
  if (onErr) return NextResponse.json({ error: onErr.message }, { status: 500 });

  const { error: offErr } = await db
    .from("draw_sessions")
    .update({ is_live: false })
    .neq("id", session_id);
  if (offErr) return NextResponse.json({ error: offErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
