import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Public, unauthenticated on purpose: the live draw screen needs a
// pool of real names to flash through during the spin animation for
// a game-show effect. It returns names only (no division, no status,
// no ids) — never enough to identify who is or isn't a winner ahead
// of the reveal, and it has no write capability.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("participants")
    .select("name")
    .eq("session_id", sessionId)
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ names: (data ?? []).map((r) => r.name) });
}
