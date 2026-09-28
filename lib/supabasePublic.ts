import { createClient } from "@supabase/supabase-js";

// Browser-safe client using the anon key. RLS policies (see
// supabase/schema.sql) restrict this to read-only access on
// draw_sessions and winners — it cannot write anything and
// cannot read participants or gifts.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabasePublic = createClient(url, anonKey, {
  auth: { persistSession: false },
});
