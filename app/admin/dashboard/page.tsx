"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { parseParticipantFile } from "@/lib/parseParticipants";

type Session = { id: string; name: string; status: string; is_live: boolean };
type Participant = { id: string; name: string; division: string; phone: string; status: string };
type Gift = { id: string; gift_name: string; total_quantity: number; remaining_quantity: number };
type Winner = {
  id: string;
  serial: number;
  name: string;
  division: string;
  phone: string;
  gift: string;
  created_at: string;
};
type Stats = {
  total: number;
  pending: number;
  winners: number;
  giftsRemaining: number;
  giftTypes: number;
  gifts: Gift[];
};

const TABS = ["Participants", "Gifts", "Draw Control", "Results"] as const;
type Tab = (typeof TABS)[number];

const STORAGE_KEY = "ld_selected_project";
// One reveal on the live screen takes 3*800 (countdown) + 4200 (spin) +
// 1000 (land hold) + 4000 (reveal) = 11,600ms (see components/SpinStage.tsx).
// Auto Draw must wait longer than that between winners, or draws pile up
// faster than the live screen can animate them and some reveals get
// silently skipped on screen.
const AUTO_DELAY_MS = 11000;

export default function AdminDashboard() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [tab, setTab] = useState<Tab>("Participants");
  const [stats, setStats] = useState<Stats | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const bump = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    if (sessionId) localStorage.setItem(STORAGE_KEY, sessionId);
  }, [sessionId]);

  const loadSessions = useCallback(
    async (preferId?: string) => {
      const res = await fetch("/api/sessions", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/admin");
        return;
      }
      const data = await res.json();
      const list: Session[] = data.sessions ?? [];
      setSessions(list);

      const wanted = preferId ?? sessionIdRef.current ?? localStorage.getItem(STORAGE_KEY);
      const fallback = list.find((s) => s.is_live)?.id ?? list[0]?.id ?? null;
      const next = wanted && list.some((s) => s.id === wanted) ? wanted : fallback;

      if (next !== sessionIdRef.current) {
        setStats(null);
        setParticipants([]);
        setSearch("");
      }
      setSessionId(next);
      setLoaded(true);
    },
    [router]
  );

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Live counters: refresh every 3 seconds (and right after any action).
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/draw/stats?session_id=${sessionId}`, { cache: "no-store" });
        if (res.status === 401) {
          router.push("/admin");
          return;
        }
        const data = await res.json();
        if (!cancelled && res.ok) setStats(data);
      } catch {
        // ignore a failed tick, the next one will retry
      }
    }

    load();
    const interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, reloadKey, router]);

  // Participant table: refresh every 5 seconds while that tab is open.
  useEffect(() => {
    if (!sessionId || tab !== "Participants") return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/participants?session_id=${sessionId}&limit=200&q=${encodeURIComponent(search)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!cancelled && res.ok) setParticipants(data.participants ?? []);
      } catch {
        // ignore
      }
    }

    const first = setTimeout(load, search ? 300 : 0);
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [sessionId, tab, search, reloadKey]);

  const session = sessions.find((s) => s.id === sessionId) ?? null;

  function switchTo(id: string) {
    if (id === sessionId) return;
    setStats(null);
    setParticipants([]);
    setSearch("");
    setMessage(null);
    setSessionId(id);
  }

  async function createProject(name: string) {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Could not create the project");
      return;
    }
    setShowNew(false);
    await loadSessions(data.session.id);
    setTab("Participants");
    setMessage(`Project "${data.session.name}" created. Next: upload your participant file.`);
  }

  async function makeLive() {
    if (!session) return;
    await fetch("/api/sessions/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.id }),
    });
    await loadSessions(session.id);
  }

  async function handleUpload(file: File) {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      const rows = await parseParticipantFile(file);
      if (rows.length === 0) {
        setMessage("No valid rows found. The file needs Name and Division columns (Phone is optional).");
        return;
      }
      const res = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.id, rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Upload failed");
        return;
      }
      const skipped = rows.length - data.imported;
      const noPhone = rows.filter((r) => !r.phone).length;
      setMessage(
        `Imported ${data.imported} of ${rows.length} rows` +
          (skipped > 0 ? ` (${skipped} duplicates skipped)` : "") +
          `. Pool size: ${data.total}.` +
          (noPhone > 0 ? ` ${noPhone} rows have no phone number.` : "")
      );
      bump();
    } catch {
      setMessage("Could not read that file. Please use .xlsx or .csv.");
    } finally {
      setBusy(false);
    }
  }

  async function clearParticipants() {
    if (!session) return;
    if (!confirm("Remove all participants from this project's pool? This cannot be undone.")) return;
    await fetch(`/api/participants?session_id=${session.id}`, { method: "DELETE" });
    bump();
  }

  async function addGift(name: string, qty: number) {
    if (!session) return;
    await fetch("/api/gifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.id, gift_name: name, total_quantity: qty }),
    });
    bump();
  }

  async function updateGift(id: string, patch: Partial<Gift>) {
    await fetch(`/api/gifts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    bump();
  }

  async function deleteGift(id: string) {
    if (!confirm("Remove this gift?")) return;
    await fetch(`/api/gifts/${id}`, { method: "DELETE" });
    bump();
  }

  async function resetAll() {
    if (!session) return;
    const typed = prompt(
      `This permanently deletes ALL participants, gifts and winners of "${session.name}".\n\nType RESET to confirm:`
    );
    if (typed !== "RESET") return;
    const res = await fetch("/api/draw/reset-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.id }),
    });
    setMessage(res.ok ? "All data in this project has been reset." : "Reset failed. Please try again.");
    bump();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin");
  }

  if (!loaded) {
    return <main className="min-h-screen flex items-center justify-center text-mute">Loading…</main>;
  }

  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-md bg-panel border border-line rounded-xl p-8 shadow-glow">
          <h1 className="font-display text-2xl font-semibold text-ink mb-1">Create your first project</h1>
          <p className="text-mute text-sm mb-5">
            Each project has its own participants, gifts and winners. Give it a name to get started.
          </p>
          {message && <p className="text-magenta text-sm mb-3">{message}</p>}
          <NewProjectForm onCreate={createProject} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 md:px-10 py-8 max-w-6xl mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-mute text-sm mb-2">Admin Dashboard · Project</p>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={session.id}
              onChange={(e) => switchTo(e.target.value)}
              className="rounded-lg bg-panel2 border border-line px-3 py-2 text-ink font-display text-xl focus:outline-none focus:border-cyan"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id} className="bg-panel2">
                  {s.name}
                  {s.is_live ? "  ● LIVE" : ""}
                </option>
              ))}
            </select>
            {session.is_live ? (
              <span className="text-xs px-2.5 py-1 rounded-full bg-cyan/15 text-cyan border border-cyan/40">
                ● LIVE on screen
              </span>
            ) : (
              <button
                onClick={makeLive}
                className="text-xs px-3 py-1.5 rounded-md bg-panel border border-line text-mute hover:text-cyan hover:border-cyan transition-colors"
              >
                Show this project on live screen
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNew((v) => !v)}
            className="px-4 py-2 rounded-lg bg-panel border border-line text-sm text-ink hover:border-cyan transition-colors"
          >
            + New Project
          </button>
          <a
            href="/draw"
            target="_blank"
            className="px-4 py-2 rounded-lg bg-panel border border-line text-sm text-ink hover:border-cyan transition-colors"
          >
            Open Live Screen ↗
          </a>
          <button
            onClick={logout}
            className="px-4 py-2 rounded-lg bg-panel border border-line text-sm text-mute hover:text-ink transition-colors"
          >
            Log out
          </button>
        </div>
      </header>

      {showNew && (
        <div className="mb-6 rounded-xl bg-panel border border-line p-4">
          <NewProjectForm onCreate={createProject} onCancel={() => setShowNew(false)} />
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 text-xs text-mute">
        <span className="w-2 h-2 rounded-full bg-cyan animate-pulseGlow" />
        Updating live
      </div>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Participants" value={stats?.total} sub={`${stats?.pending ?? "–"} pending`} />
        <StatCard label="Winners drawn" value={stats?.winners} sub={`${stats?.giftTypes ?? "–"} gift types`} />
        <StatCard label="Gifts remaining" value={stats?.giftsRemaining} sub="across all types" />
      </div>

      <nav className="flex gap-2 mb-6 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-cyan text-ink" : "border-transparent text-mute hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {message && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-panel border border-line text-sm text-ink">{message}</div>
      )}

      {tab === "Participants" && (
        <ParticipantsPanel
          participants={participants}
          total={stats?.total ?? 0}
          search={search}
          onSearch={setSearch}
          busy={busy}
          onUpload={handleUpload}
          onClear={clearParticipants}
        />
      )}

      {tab === "Gifts" && (
        <GiftsPanel gifts={stats?.gifts ?? []} onAdd={addGift} onUpdate={updateGift} onDelete={deleteGift} />
      )}

      {tab === "Draw Control" && (
        <DrawControlPanel session={session} stats={stats} onChanged={bump} onResetAll={resetAll} />
      )}

      {tab === "Results" && <ResultsPanel sessionId={session.id} reloadKey={reloadKey} onChanged={bump} />}
    </main>
  );
}

function NewProjectForm({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        await onCreate(name.trim());
        setSaving(false);
      }}
      className="flex gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name (e.g. Eid Gift Draw 2026)"
        autoFocus
        className="flex-1 rounded-lg bg-panel2 border border-line px-3 py-2 text-ink focus:outline-none focus:border-cyan"
      />
      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="px-5 py-2 rounded-lg bg-cyan text-void text-sm font-semibold hover:opacity-90 disabled:opacity-40"
      >
        {saving ? "Creating…" : "Create"}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-panel2 border border-line text-sm text-mute hover:text-ink"
        >
          Cancel
        </button>
      )}
    </form>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number | undefined; sub: string }) {
  return (
    <div className="rounded-xl bg-panel border border-line p-5">
      <p className="text-mute text-xs uppercase tracking-wide">{label}</p>
      <p className="font-display text-3xl font-bold text-ink mt-1">{value ?? "–"}</p>
      <p className="text-mute text-xs mt-1">{sub}</p>
    </div>
  );
}

function ParticipantsPanel({
  participants,
  total,
  search,
  onSearch,
  busy,
  onUpload,
  onClear,
}: {
  participants: Participant[];
  total: number;
  search: string;
  onSearch: (q: string) => void;
  busy: boolean;
  onUpload: (f: File) => void;
  onClear: () => void;
}) {
  return (
    <section className="rounded-xl bg-panel border border-line p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-xl text-ink">Participant List</h2>
          <p className="text-mute text-sm">
            Upload an Excel (.xlsx) or CSV file with Name, Division and Phone columns. Phone is saved for the
            admin only and never shown on the live screen.
          </p>
        </div>
        <div className="flex gap-2">
          <label className="px-4 py-2 rounded-lg bg-cyan text-void text-sm font-semibold cursor-pointer hover:opacity-90">
            {busy ? "Uploading…" : "Upload File"}
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = "";
              }}
            />
          </label>
          <button
            onClick={onClear}
            className="px-4 py-2 rounded-lg bg-panel2 border border-line text-sm text-mute hover:text-magenta transition-colors"
          >
            Clear Pool
          </button>
        </div>
      </div>

      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search by name or phone…"
        className="w-full mb-3 rounded-lg bg-panel2 border border-line px-3 py-2 text-sm text-ink focus:outline-none focus:border-cyan"
      />

      <div className="max-h-96 overflow-y-auto scrollbar-thin rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-panel2 text-mute text-left">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Division</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-2 text-ink">{p.name}</td>
                <td className="px-4 py-2 text-mute">{p.division}</td>
                <td className="px-4 py-2 text-mute">{p.phone || "—"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      p.status === "won" ? "bg-gold/20 text-gold" : "bg-panel2 text-mute"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
            {participants.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-mute">
                  {search ? "No matching participants." : "No participants yet. Upload a file to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!search && total > participants.length && participants.length > 0 && (
        <p className="text-mute text-xs mt-2">
          Showing the first {participants.length} of {total} participants. Use search to find anyone.
        </p>
      )}
    </section>
  );
}

function GiftsPanel({
  gifts,
  onAdd,
  onUpdate,
  onDelete,
}: {
  gifts: Gift[];
  onAdd: (name: string, qty: number) => void;
  onUpdate: (id: string, patch: Partial<Gift>) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);

  return (
    <section className="rounded-xl bg-panel border border-line p-6">
      <h2 className="font-display text-xl text-ink mb-4">Gift Inventory</h2>

      <div className="flex gap-2 mb-6">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Gift name (e.g. Smartwatch)"
          className="flex-1 rounded-lg bg-panel2 border border-line px-3 py-2 text-ink focus:outline-none focus:border-cyan"
        />
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="w-24 rounded-lg bg-panel2 border border-line px-3 py-2 text-ink focus:outline-none focus:border-cyan"
        />
        <button
          onClick={() => {
            if (!name.trim() || qty < 1) return;
            onAdd(name.trim(), qty);
            setName("");
            setQty(1);
          }}
          className="px-5 py-2 rounded-lg bg-cyan text-void text-sm font-semibold hover:opacity-90"
        >
          Add Gift
        </button>
      </div>

      <div className="space-y-2">
        {gifts.map((g) => (
          <div
            key={g.id}
            className="flex items-center justify-between rounded-lg border border-line px-4 py-3"
          >
            <div>
              <p className="text-ink font-medium">{g.gift_name}</p>
              <p className="text-mute text-xs">
                {g.remaining_quantity} remaining of {g.total_quantity}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const next = prompt("New total quantity:", String(g.total_quantity));
                  const n = Number(next);
                  if (next && Number.isFinite(n) && n >= 0) onUpdate(g.id, { total_quantity: n });
                }}
                className="text-xs px-3 py-1.5 rounded-md bg-panel2 border border-line text-mute hover:text-ink"
              >
                Edit Qty
              </button>
              <button
                onClick={() => {
                  const next = prompt("Rename gift:", g.gift_name);
                  if (next && next.trim()) onUpdate(g.id, { gift_name: next.trim() });
                }}
                className="text-xs px-3 py-1.5 rounded-md bg-panel2 border border-line text-mute hover:text-ink"
              >
                Rename
              </button>
              <button
                onClick={() => onDelete(g.id)}
                className="text-xs px-3 py-1.5 rounded-md bg-panel2 border border-line text-mute hover:text-magenta"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {gifts.length === 0 && <p className="text-mute text-sm py-4 text-center">No gifts added yet.</p>}
      </div>
    </section>
  );
}

function DrawControlPanel({
  session,
  stats,
  onChanged,
  onResetAll,
}: {
  session: Session;
  stats: Stats | null;
  onChanged: () => void;
  onResetAll: () => void;
}) {
  const pending = stats?.pending ?? 0;
  const giftsRemaining = stats?.giftsRemaining ?? 0;

  const [drawing, setDrawing] = useState(false);
  const [autoTotal, setAutoTotal] = useState(10);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoProgress, setAutoProgress] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const stopRef = useRef(false);

  async function drawNext(): Promise<boolean> {
    setDrawing(true);
    setLastError(null);
    try {
      const res = await fetch("/api/draw/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLastError(data.error);
        return false;
      }
      if (data.done) {
        setLastError(data.reason);
        return false;
      }
      onChanged();
      return true;
    } catch {
      setLastError("Network error. Please try again.");
      return false;
    } finally {
      setDrawing(false);
    }
  }

  async function waitUnlessStopped(ms: number) {
    const end = Date.now() + ms;
    while (Date.now() < end && !stopRef.current) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async function runAutoDraw() {
    stopRef.current = false;
    setAutoRunning(true);
    setAutoProgress(0);
    for (let i = 0; i < autoTotal; i++) {
      if (stopRef.current) break;
      const ok = await drawNext();
      if (!ok) break;
      setAutoProgress(i + 1);
      if (i < autoTotal - 1) await waitUnlessStopped(AUTO_DELAY_MS);
    }
    setAutoRunning(false);
  }

  async function restartDraw() {
    if (!confirm("This clears all winners and resets the pool and gifts for this project. Continue?")) return;
    await fetch("/api/draw/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.id }),
    });
    onChanged();
  }

  return (
    <section className="rounded-xl bg-panel border border-line p-6 space-y-6">
      <div>
        <h2 className="font-display text-xl text-ink mb-1">Draw Control</h2>
        <p className="text-mute text-sm">
          Every draw picks uniformly at random from the {pending} remaining participants and{" "}
          {giftsRemaining} remaining gift units. Open the live screen on your projector before starting.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={drawNext}
          disabled={drawing || autoRunning || pending === 0 || giftsRemaining === 0}
          className="px-6 py-3 rounded-lg bg-cyan text-void font-semibold hover:opacity-90 disabled:opacity-40"
        >
          {drawing && !autoRunning ? "Drawing…" : "Draw Next Winner"}
        </button>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2 rounded-lg bg-panel2 border border-line">
          <span className="text-mute text-sm">Auto draw</span>
          <input
            type="number"
            min={1}
            value={autoTotal}
            disabled={autoRunning}
            onChange={(e) => setAutoTotal(Math.max(1, Number(e.target.value) || 1))}
            className="w-16 rounded-md bg-void border border-line px-2 py-1 text-ink text-sm"
          />
          <button
            onClick={() => setAutoTotal(Math.max(1, giftsRemaining))}
            disabled={autoRunning || giftsRemaining === 0}
            className="text-xs px-2.5 py-1.5 rounded-md bg-void border border-line text-mute hover:text-ink disabled:opacity-40"
          >
            Use all gifts ({giftsRemaining})
          </button>
          {!autoRunning ? (
            <button
              onClick={runAutoDraw}
              disabled={drawing || pending === 0 || giftsRemaining === 0}
              className="px-3 py-1.5 rounded-md bg-magenta text-void text-sm font-semibold hover:opacity-90 disabled:opacity-40"
            >
              Start Auto Draw
            </button>
          ) : (
            <button
              onClick={() => {
                stopRef.current = true;
              }}
              className="px-3 py-1.5 rounded-md bg-gold text-void text-sm font-semibold hover:opacity-90"
            >
              Stop ({autoProgress}/{autoTotal})
            </button>
          )}
        </div>

        <button
          onClick={restartDraw}
          disabled={autoRunning}
          className="px-4 py-2 rounded-lg bg-panel2 border border-line text-sm text-mute hover:text-magenta disabled:opacity-40"
        >
          Restart Draw
        </button>
      </div>

      {autoTotal > giftsRemaining && (
        <p className="text-gold text-sm">
          Only {giftsRemaining} gift units remain, so Auto Draw will stop after {giftsRemaining} winners.
        </p>
      )}
      {lastError && <p className="text-gold text-sm">{lastError}</p>}

      <div className="rounded-lg border border-line p-4 text-sm text-mute">
        <p className="text-ink font-medium mb-1">No-show or disqualified winner?</p>
        <p>
          Go to the Results tab and use <span className="text-ink">Redo</span> next to their name. It returns
          their gift to inventory and puts them back in the pool, then you draw again at random.
        </p>
      </div>

      <div className="rounded-lg border border-magenta/40 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-ink font-medium">Reset all data</p>
          <p className="text-mute text-sm">
            Deletes every participant, gift and winner in this project. Use it after the event is finished.
          </p>
        </div>
        <button
          onClick={onResetAll}
          disabled={autoRunning}
          className="px-4 py-2 rounded-lg bg-magenta/15 border border-magenta/50 text-magenta text-sm font-semibold hover:bg-magenta/25 disabled:opacity-40"
        >
          Reset All Data
        </button>
      </div>
    </section>
  );
}

function ResultsPanel({
  sessionId,
  reloadKey,
  onChanged,
}: {
  sessionId: string;
  reloadKey: number;
  onChanged: () => void;
}) {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);

  // Results refresh every 3 seconds so they update during a live draw.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/winners?session_id=${sessionId}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && res.ok) {
          setWinners(data.winners ?? []);
          setLoading(false);
        }
      } catch {
        // ignore a failed tick
      }
    }

    load();
    const interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, reloadKey]);

  async function redo(winnerId: string) {
    if (!confirm("Return this winner to the pool and their gift to inventory, then remove this entry?")) return;
    await fetch("/api/draw/redo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winner_id: winnerId }),
    });
    onChanged();
  }

  return (
    <section className="rounded-xl bg-panel border border-line p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-xl text-ink">Results</h2>
          <p className="text-mute text-sm">Phone numbers are visible here only, never on the live screen.</p>
        </div>
        <a
          href={`/api/draw/export?session_id=${sessionId}`}
          className="px-4 py-2 rounded-lg bg-cyan text-void text-sm font-semibold hover:opacity-90"
        >
          Export Excel
        </a>
      </div>

      <div className="max-h-[28rem] overflow-y-auto scrollbar-thin rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-panel2 text-mute text-left">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Winner</th>
              <th className="px-4 py-2">Division</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Gift</th>
              <th className="px-4 py-2">Time</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {winners.map((w) => (
              <tr key={w.id} className="border-t border-line">
                <td className="px-4 py-2 text-mute">{w.serial}</td>
                <td className="px-4 py-2 text-ink">{w.name}</td>
                <td className="px-4 py-2 text-mute">{w.division}</td>
                <td className="px-4 py-2 text-ink">{w.phone || "—"}</td>
                <td className="px-4 py-2 text-gold">{w.gift}</td>
                <td className="px-4 py-2 text-mute">{new Date(w.created_at).toLocaleString()}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => redo(w.id)}
                    className="text-xs px-3 py-1.5 rounded-md bg-panel2 border border-line text-mute hover:text-magenta"
                  >
                    Redo
                  </button>
                </td>
              </tr>
            ))}
            {!loading && winners.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-mute">
                  No winners drawn yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
