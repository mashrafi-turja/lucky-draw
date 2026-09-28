let ctx: AudioContext | null = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = "sine", gain = 0.15) {
  const audio = getCtx();
  if (!audio) return;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(audio.destination);
  const t = audio.currentTime + start;
  osc.start(t);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.stop(t + duration + 0.02);
}

export function playTick() {
  tone(880, 0, 0.08, "square", 0.06);
}

export function playCountdownBeep() {
  tone(440, 0, 0.15, "sine", 0.12);
}

export function playReveal() {
  tone(523.25, 0, 0.18, "triangle", 0.15);
  tone(659.25, 0.12, 0.18, "triangle", 0.15);
  tone(783.99, 0.24, 0.35, "triangle", 0.18);
}
