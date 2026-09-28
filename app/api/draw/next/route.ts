import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { drawOneWinner } from "@/lib/drawEngine";

// POST { session_id }
// Draws exactly one winner using uniform random selection over the
// current pending pool. See lib/drawEngine.ts for the selection logic.
export async function POST(req: NextRequest) {
  const { session_id } = await req.json();
  if (!session_id) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  try {
    const result = await drawOneWinner(session_id);

    const db = supabaseAdmin();
    await db
      .from("draw_sessions")
      .update({ status: result.done ? "completed" : "running" })
      .eq("id", session_id);

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Draw failed" }, { status: 500 });
  }
}
