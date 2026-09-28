"use client";

import { motion, AnimatePresence } from "framer-motion";

type Winner = { id: string; serial: number; name: string; division: string; gift: string };

export default function WinnerSidebar({ winners }: { winners: Winner[] }) {
  return (
    <aside className="w-full h-full flex flex-col">
      <h2 className="font-display text-sm tracking-widest text-cyan/80 px-5 pt-5 pb-3">
        WINNERS · {winners.length}
      </h2>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-5 pb-5 space-y-2">
        <AnimatePresence initial={false}>
          {[...winners].reverse().map((w) => (
            <motion.div
              key={w.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35 }}
              className="rounded-lg bg-panel border border-line px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-cyan font-display text-sm">#{w.serial}</span>
                <span className="text-gold text-xs">🎁 {w.gift}</span>
              </div>
              <p className="text-ink font-medium mt-1 truncate">{w.name}</p>
              <p className="text-mute text-xs">{w.division}</p>
            </motion.div>
          ))}
        </AnimatePresence>
        {winners.length === 0 && (
          <p className="text-mute text-sm text-center pt-10">No winners yet — the draw hasn&apos;t started.</p>
        )}
      </div>
    </aside>
  );
}
