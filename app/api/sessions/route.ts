import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// GET -> all projects (newest first)
export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("draw_sessions")
    .select("id, name, status, is_live, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data });
}

// POST { name } -> create a project. The first project ever created is
// put on the live screen automatically; later ones stay off-screen until
// the admin clicks "Show this project on live screen".
export async function POST(req: NextRequest) {
  const { name } = await req.json();
  const cleanName = String(name ?? "").trim();
  if (!cleanName) {
    return NextResponse.json({ error: "Project name is required" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { count } = await db
    .from("draw_sessions")
    .select("id", { count: "exact", head: true })
    .eq("is_live", true);

  const { data, error } = await db
    .from("draw_sessions")
    .insert({ name: cleanName, status: "idle", is_live: (count ?? 0) === 0 })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}
