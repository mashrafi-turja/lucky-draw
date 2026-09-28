import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Without this, Next.js can build this GET route once and serve the
// same answer forever on Vercel.
export const dynamic = "force-dynamic";

// Public: exposes only which project is currently live and its name,
// nothing about participants, gifts, or admin data.
export async function GET() {
  const db = supabaseAdmin();

  const { data: live } = await db
    .from("draw_sessions")
    .select("id, name, status")
    .eq("is_live", true)
    .limit(1)
    .maybeSingle();
  if (live) return NextResponse.json({ session: live });

  const { data: latest } = await db
    .from("draw_sessions")
    .select("id, name, status")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ session: latest ?? null });
}
