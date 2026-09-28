"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { playCountdownBeep, playTick, playReveal } from "@/lib/sfx";

type Winner = { id: string; serial: number; name: string; division: string; gift: string };

type Phase = "idle" | "countdown" | "spinning" | "reveal";

// Shuffle timing: names flip quickly at first, then slow down like a
// slot machine before landing on the real winner.
const SPIN_MS = 4200;
const FAST_MS = 45;
const SLOW_EXTRA_MS = 260;
const COUNT_MS = 800;
const LAND_HOLD_MS = 1000;
const REVEAL_MS = 4000;

function randomName(pool: string[], avoid: string[], fallback: string) {
  if (pool.length < 2) return fallback;
  for (let i = 0; i < 8; i++) {
    const n = pool[Math.floor(Math.random() * pool.length)];
    if (!avoid.includes(n)) return n;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function SpinStage({
  queue,
  names,
  onDone,
}: {
  queue: Winner[];
  names: string[];
  onDone: (winner: Winner) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdownVal, setCountdownVal] = useState(3);
  const [reel, setReel] = useState<string[]>(["", "", ""]);
  const [landed, setLanded] = useState(false);

  // Always read the newest name list. A spin that starts before the
  // names finish loading would otherwise shuffle nothing but the winner.
  const namesRef = useRef<string[]>(names);
  namesRef.current = names;

  const current = queue[0];

  useEffect(() => {
    if (!current) return;

    let cancelled = false;
    runSequence(current, () => cancelled);

    // In React's dev Strict Mode this effect runs twice in a row
    // (mount → cleanup → mount). The cleanup cancels the first run so
    // two sequences never overlap.
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  async function runSequence(winner: Winner, isCancelled: () => boolean) {
    // 1. Countdown 3-2-1
    setLanded(false);
    setPhase("countdown");
    for (let n = 3; n >= 1; n--) {
      if (isCancelled()) return;
      setCountdownVal(n);
      playCountdownBeep();
      await sleep(COUNT_MS);
    }

    // 2. Shuffle: names scroll upward, fast at first, slowing down
    if (isCancelled()) return;
    const pick = (avoid: string[]) => randomName(namesRef.current, avoid, winner.name);
    setReel([pick([]), pick([]), pick([])]);
    setPhase("spinning");

    const start = Date.now();
    while (Date.now() - start < SPIN_MS) {
      const t = (Date.now() - start) / SPIN_MS;
      await sleep(FAST_MS + SLOW_EXTRA_MS * t * t * t);
      if (isCancelled()) return;
      setReel((r) => [r[1], r[2], pick([r[1], r[2]])]);
      playTick();
    }

    // 3. Land on the real winner and hold for a moment
    if (isCancelled()) return;
    setReel((r) => [r[1], winner.name, pick([winner.name])]);
    setLanded(true);
    playCountdownBeep();
    await sleep(LAND_HOLD_MS);

    // 4. Reveal
    if (isCancelled()) return;
    setPhase("reveal");
    playReveal();
    fireConfetti();
    await sleep(REVEAL_MS);

    if (isCancelled()) return;
    setPhase("idle");
    onDone(winner);
  }

  function fireConfetti() {
    const defaults = { origin: { y: 0.6 }, zIndex: 60 };
    confetti({ ...defaults, particleCount: 120, spread: 90, colors: ["#3DF5D0", "#FF3DB0", "#FFC24B"] });
    setTimeout(
      () => confetti({ ...defaults, particleCount: 80, spread: 120, angle: 60, origin: { x: 0, y: 0.6 } }),
      200
    );
    setTimeout(
      () => confetti({ ...defaults, particleCount: 80, spread: 120, angle: 120, origin: { x: 1, y: 0.6 } }),
      200
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center relative px-6 min-h-0">
      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center"
          >
            <p className="font-display text-mute text-xl tracking-widest">
              {queue.length === 0 ? "WAITING FOR NEXT DRAW…" : "GET READY…"}
            </p>
          </motion.div>
        )}

        {phase === "countdown" && (
          <motion.div
            key={`count-${countdownVal}`}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.4, opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="font-display text-[10rem] leading-none font-bold text-cyan text-glow-cyan"
          >
            {countdownVal}
          </motion.div>
        )}

        {phase === "spinning" && (
          <motion.div
            key="spin"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center w-full max-w-4xl"
          >
            <p className="font-display text-mute text-sm tracking-[0.3em] mb-6">
              {landed ? "WINNER FOUND" : "SELECTING WINNER"}
            </p>
            <div
              className={`rounded-2xl border bg-panel/60 py-6 transition-colors duration-300 ${
                landed ? "border-gold/60 shadow-glow" : "border-cyan/30 shadow-glow"
              }`}
            >
              <p className="font-display text-2xl text-mute/40 truncate px-6 h-10 leading-10">{reel[0]}</p>
              <p
                className={`font-display text-5xl md:text-6xl font-bold px-6 py-4 truncate transition-colors duration-300 ${
                  landed ? "text-gold" : "text-ink text-glow-cyan"
                }`}
              >
                {reel[1]}
              </p>
              <p className="font-display text-2xl text-mute/40 truncate px-6 h-10 leading-10">{reel[2]}</p>
            </div>
          </motion.div>
        )}

        {phase === "reveal" && current && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 180, damping: 14 }}
            className="text-center"
          >
            <p className="font-display text-gold text-sm tracking-[0.3em] mb-3">WINNER #{current.serial}</p>
            <p className="font-display text-6xl md:text-8xl font-bold text-ink text-glow-cyan mb-4">
              {current.name}
            </p>
            <p className="text-mute text-xl mb-2">{current.division}</p>
            <p className="font-display text-3xl text-gold">🎁 {current.gift}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}