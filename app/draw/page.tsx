"use client";

import { useEffect, useRef, useState } from "react";
import { supabasePublic } from "@/lib/supabasePublic";
import SpinStage from "@/components/SpinStage";
import WinnerSidebar from "@/components/WinnerSidebar";

type Winner = { id: string; serial: number; name: string; division: string; gift: string };

export default function LiveDrawPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [eventName, setEventName] = useState("Live Draw");
  const [allWinners, setAllWinners] = useState<Winner[]>([]);
  const [displayedWinners, setDisplayedWinners] = useState<Winner[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const displayedIds = useRef<Set<string>>(new Set());
  const currentSessionRef = useRef<string | null>(null);
  const initializedFor = useRef<string | null>(null);

  // Follow whichever project the admin has marked LIVE. If the admin
  // switches projects, the screen resets itself and follows the new one.
  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        const res = await fetch("/api/session/current", { cache: "no-store" });
        const data = await res.json();
        if (cancelled || !data.session) return;

        setEventName(data.session.name);
        if (currentSessionRef.current !== data.session.id) {
          currentSessionRef.current = data.session.id;
          displayedIds.current = new Set();
          setDisplayedWinners([]);
          setAllWinners([]);
          setSessionId(data.session.id);
        }
      } catch {
        // network hiccup: try again on the next tick
      }
    }

    resolve();
    const interval = setInterval(resolve, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Name pool for the spin animation (names only, no phone/division).
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    function load() {
      fetch(`/api/draw/pool-preview?session_id=${sessionId}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) setNames(d.names ?? []);
        })
        .catch(() => {});
    }

    load();
    const interval = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);

  // Poll winners from the public, read-only Supabase client.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function poll() {
      const { data } = await supabasePublic
        .from("winners")
        .select("id, serial, name, division, gift")
        .eq("session_id", sessionId)
        .order("serial", { ascending: true });
      if (cancelled || !data) return;

      const rows = data as Winner[];
      setAllWinners(rows);

      // First load of this project: winners that already exist go straight
      // into the sidebar with NO animation. Only winners drawn after the
      // screen is open get the countdown + shuffle + reveal.
      if (initializedFor.current !== sessionId) {
        initializedFor.current = sessionId;
        displayedIds.current = new Set(rows.map((w) => w.id));
        setDisplayedWinners(rows);
        return;
      }

      // If the admin used Redo / Restart / Reset, winners disappear from
      // the database. Remove them from the sidebar too.
      const liveIds = new Set(rows.map((w) => w.id));
      setDisplayedWinners((prev) =>
        prev.some((w) => !liveIds.has(w.id)) ? prev.filter((w) => liveIds.has(w.id)) : prev
      );
      displayedIds.current.forEach((id) => {
        if (!liveIds.has(id)) displayedIds.current.delete(id);
      });
    }

    poll();
    const interval = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);

  const queue = allWinners.filter((w) => !displayedIds.current.has(w.id));

  function handleDone(winner: Winner) {
    displayedIds.current.add(winner.id);
    setDisplayedWinners((prev) => [...prev, winner]);
  }

  return (
    <main className="h-screen flex bg-void overflow-hidden">
      <div className="flex-1 flex flex-col h-full min-h-0">
        <header className="flex items-center justify-between px-8 py-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan/15 border border-cyan/40 flex items-center justify-center">
              <span className="text-cyan font-display font-bold">L</span>
            </div>
            <p className="font-display text-lg tracking-wide text-ink">{eventName}</p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-mute text-sm">{displayedWinners.length} winners announced</p>
            <button
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  document.documentElement.requestFullscreen();
                }
              }}
              className="text-xs px-3 py-1.5 rounded-md bg-panel border border-line text-mute hover:text-ink transition-colors"
            >
              Full Screen
            </button>
          </div>
        </header>

        <SpinStage queue={queue} names={names} onDone={handleDone} />
      </div>

      <div className="w-80 border-l border-line bg-panel/40 h-full min-h-0">
        <WinnerSidebar winners={displayedWinners} />
      </div>
    </main>
  );
}