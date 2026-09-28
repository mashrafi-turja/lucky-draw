# Lucky Draw Live

A production-ready live lucky draw / random gift picker for events, built with
Next.js (App Router), Tailwind, Framer Motion, and Supabase.

- **Public live screen** (`/draw`) — full-screen, projector-friendly countdown,
  spin animation, confetti, sound, and a real-time winner sidebar.
- **Admin dashboard** (`/admin`) — password-protected. Upload participants via
  Excel/CSV, manage gift inventory, run the draw, export results.
- **One random draw engine** (`lib/drawEngine.ts`) — the *only* place a winner
  is chosen. It always does a uniform-random pick over the live pending pool
  fetched fresh from the database. There is no way, hidden or otherwise, to
  force a specific outcome — that's a deliberate design decision, not an
  oversight, because the whole point of a draw is that people can trust it.

---

## 1. How the pieces fit together

```
Participants (Excel/CSV) → participants table (pool)
Gifts (admin-defined)    → gifts table (inventory)

Admin clicks "Draw Next Winner"
  → POST /api/draw/next
  → lib/drawEngine.ts picks 1 random pending participant
    + 1 random gift with remaining_quantity > 0
  → inserts a row into `winners`, decrements gift stock,
    marks the participant "won"

Live screen (/draw)
  → polls the public `winners` table every 2.5s (read-only via RLS)
  → for each new winner: countdown → name-spin animation → reveal
    + confetti + sound → adds them to the sidebar
```

The public screen and the admin dashboard never talk to each other directly —
they both just read/write Supabase, so you can open `/draw` on a projector and
run `/admin` from a laptop or phone at the same time.

---

## 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run the contents of `supabase/schema.sql`. This
   creates `draw_sessions`, `participants`, `gifts`, `winners`, and sets Row
   Level Security so the public (anon) key can only **read** `draw_sessions`
   and `winners` — it can never write, and it can't read participant names or
   gift inventory ahead of time.
3. From Project Settings → API, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never
     exposed to the browser — used by the admin API routes)

---

## 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

Generate your admin password hash:

```bash
npm install
node scripts/hash-password.js "your-strong-password"
```

Paste the printed hash into `ADMIN_PASSWORD_HASH`. Set `ADMIN_USERNAME` (default
`admin`) and a long random `SESSION_SECRET` (e.g. `openssl rand -hex 32`).

---

## 4. Run locally

```bash
npm install
npm run dev
```

- Admin: http://localhost:3000/admin
- Live screen: http://localhost:3000/draw

On first login, the app auto-creates a "Live Draw" session. Upload a
participant file (columns: `Name`, `Division`), add gifts, then head to
**Draw Control**.

---

## 5. Running the live event

1. Open `/draw` on the projector/streaming machine, click **Full Screen**.
2. On your laptop/phone, log into `/admin` → **Draw Control**.
3. **Draw Next Winner** runs one spin. **Auto Draw** runs N spins back-to-back
   with a pause between each so the animation has time to play on the big
   screen.
4. If a winner is a no-show or needs to be disqualified, use **Redo** next to
   their entry in **Results** — it returns their gift to inventory and them to
   the pool, visibly and logged, then you draw again at random. There is no
   way to choose who the re-draw picks.
5. When done, **Export Excel/CSV** from the Results tab (columns: Serial,
   Winner Name, Division, Gift Name, Draw Time).
6. **Restart Draw** clears all winners and resets the pool if you need to redo
   the whole event (e.g. a rehearsal run).

---

## 6. Deploy to Vercel

1. Push this project to a GitHub repository.
2. Import it into [Vercel](https://vercel.com/new).
3. Add the same environment variables from `.env.local` in Vercel's Project
   Settings → Environment Variables.
4. Deploy. Vercel's serverless functions handle all `/api/*` routes.

For ~3,000 participants, the app comfortably handles this: participant/gift
data is only read by the admin, and the public `/draw` screen only polls a
small `winners` table, so load stays low even with many viewers.

---

## 7. Project structure

```
app/
  admin/            → login + protected dashboard
  draw/             → public live draw screen
  api/
    auth/           → login/logout (bcrypt + signed session cookie)
    participants/   → upload/list/clear
    gifts/          → CRUD
    sessions/       → create/list draw sessions
    winners/        → admin winners list (with redo support)
    draw/
      next/         → the ONE random-draw endpoint
      redo/         → transparent re-draw for no-shows
      reset/        → restart a session
      export/       → CSV export
      pool-preview/ → public name pool for the spin animation
    session/current/ → public "which session is live" endpoint
components/         → SpinStage, WinnerSidebar
lib/                → supabase clients, drawEngine, session/auth, parsing
supabase/schema.sql → full DB schema + RLS policies
middleware.ts       → protects /admin/dashboard and all admin API routes
```

---

## 8. Security notes

- Admin password is bcrypt-hashed; the plaintext is never stored.
- Admin session is a signed, httpOnly JWT cookie (12h expiry).
- All writes (upload, gift edits, drawing winners) go through server-side API
  routes using the Supabase **service role** key — the browser only ever holds
  the restricted **anon** key.
- RLS denies the anon key read access to `participants` and `gifts` entirely,
  so pre-draw names and prize inventory are never exposed to the public page.
