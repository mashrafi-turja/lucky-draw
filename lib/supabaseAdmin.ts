import { createClient } from "@supabase/supabase-js";

// Server-only client. Uses the service role key so API routes can
// read/write freely; this file must never be imported from a
// "use client" component.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    // Next.js caches fetch() results by default. Live draw data must
    // never be served from that cache, so every query opts out.
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
