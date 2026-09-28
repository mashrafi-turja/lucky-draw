import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <p className="font-display text-sm tracking-wide text-cyan/80">Live Event System</p>
        <h1 className="font-display text-5xl md:text-6xl font-bold text-ink mt-2">
          Lucky Draw <span className="text-cyan text-glow-cyan">Live</span>
        </h1>
        <p className="text-mute mt-4 max-w-md mx-auto">
          Upload your participant list, set up gifts, and run a live, provably-random winner draw
          on the big screen.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/admin"
          className="px-8 py-3 rounded-lg bg-panel border border-line text-ink font-medium hover:border-cyan transition-colors"
        >
          Admin Login
        </Link>
        <Link
          href="/draw"
          className="px-8 py-3 rounded-lg bg-cyan text-void font-semibold shadow-glow hover:opacity-90 transition-opacity"
        >
          Open Live Draw Screen
        </Link>
      </div>
    </main>
  );
}
