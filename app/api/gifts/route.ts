import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("gifts")
    .select("id, gift_name, total_quantity, remaining_quantity")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ gifts: data });
}

// POST { session_id, gift_name, total_quantity }
export async function POST(req: NextRequest) {
  const { session_id, gift_name, total_quantity } = await req.json();

  if (!session_id || !gift_name || !Number.isFinite(total_quantity) || total_quantity < 1) {
    return NextResponse.json(
      { error: "session_id, gift_name and a positive total_quantity are required" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("gifts")
    .insert({
      session_id,
      gift_name: String(gift_name).trim(),
      total_quantity,
      remaining_quantity: total_quantity,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ gift: data });
}
