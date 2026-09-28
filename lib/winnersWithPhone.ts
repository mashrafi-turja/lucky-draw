import type { SupabaseClient } from "@supabase/supabase-js";

type WinnerRow = {
  id: string;
  serial: number;
  name: string;
  division: string;
  gift: string;
  created_at: string;
  participant_id: string | null;
};

// Admin-only helper: winners plus each winner's phone number, looked up
// from the participants table (which is not publicly readable).
export async function fetchWinnersWithPhone(db: SupabaseClient, sessionId: string) {
  const { data, error } = await db
    .from("winners")
    .select("id, serial, name, division, gift, created_at, participant_id")
    .eq("session_id", sessionId)
    .order("serial", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as WinnerRow[];
  const ids = Array.from(
    new Set(rows.map((w) => w.participant_id).filter((x): x is string => !!x))
  );

  const phoneById = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data: people, error: pErr } = await db
      .from("participants")
      .select("id, phone")
      .in("id", ids.slice(i, i + 100));
    if (pErr) throw pErr;
    for (const p of people ?? []) phoneById.set(p.id, p.phone ?? "");
  }

  return rows.map(({ participant_id, ...w }) => ({
    ...w,
    phone: participant_id ? phoneById.get(participant_id) ?? "" : "",
  }));
}
