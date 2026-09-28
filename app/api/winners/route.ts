import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchWinnersWithPhone } from "@/lib/winnersWithPhone";

export const dynamic = "force-dynamic";

// Admin-only (protected by middleware): winners including phone numbers.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }
  try {
    const winners = await fetchWinnersWithPhone(supabaseAdmin(), sessionId);
    return NextResponse.json({ winners });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed to load winners" }, { status: 500 });
  }
}
