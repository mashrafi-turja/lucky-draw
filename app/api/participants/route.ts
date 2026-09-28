import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// GET /api/participants?session_id=...&limit=200&q=search
// Returns a page of participants for the admin table (with phone).
// Totals/pending counts come from /api/draw/stats, not from this list.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 200, 500);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  const db = supabaseAdmin();
  let query = db
    .from("participants")
    .select("id, name, division, phone, status")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (q) {
    const safe = q.replace(/[%,()*]/g, " ");
    query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }

  const { data, error } = await query.limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ participants: data });
}

// POST /api/participants  { session_id, rows: [{name, division, phone}] }
// Imports rows in chunks, skipping exact duplicates (same name +
// division + phone) already present for this project.
export async function POST(req: NextRequest) {
  const { session_id, rows } = await req.json();

  if (!session_id || !Array.isArray(rows)) {
    return NextResponse.json({ error: "session_id and rows[] are required" }, { status: 400 });
  }

  const cleaned = rows
    .map((r: any) => ({
      session_id,
      name: String(r.name ?? "").trim(),
      division: String(r.division ?? "").trim(),
      phone: String(r.phone ?? "").trim(),
      status: "pending",
    }))
    .filter((r: any) => r.name && r.division);

  if (cleaned.length === 0) {
    return NextResponse.json(
      { error: "No valid rows found (need Name and Division columns)" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  let imported = 0;
  for (let i = 0; i < cleaned.length; i += 500) {
    const { data, error } = await db
      .from("participants")
      .upsert(cleaned.slice(i, i + 500), {
        onConflict: "session_id,name,division,phone",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    imported += data?.length ?? 0;
  }

  const { count } = await db
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session_id);

  return NextResponse.json({ imported, total: count });
}

// DELETE /api/participants?session_id=...  -> clear the pool
export async function DELETE(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { error } = await db.from("participants").delete().eq("session_id", sessionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
