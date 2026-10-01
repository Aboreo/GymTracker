// Browser capabilities for focus mode. Each one degrades gracefully when unsupported.

// ---- Sound (Web Audio). iOS only allows audio after a user gesture, so unlockAudio()
// must be called from a tap (e.g. "Start focus mode").

let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    // Play one silent frame: this is what actually unlocks audio on iOS.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    ctx = null;
  }
}

function tone(freq: number, ms: number, when = 0, gain = 0.25): void {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.value = freq;
  osc.type = 'sine';
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + ms / 1000 + 0.02);
}

export interface Cues {
  sound: boolean;
  vibration: boolean;
}

/** Short tick for the last 3 seconds. */
export function countdownBeep(c: Cues): void {
  if (c.sound) tone(880, 120);
  if (c.vibration) vibrate(40);
}

/** Distinct rising chime when rest is over. */
export function finishChime(c: Cues): void {
  if (c.sound) {
    tone(660, 160, 0, 0.3);
    tone(990, 260, 0.17, 0.3);
  }
  if (c.vibration) vibrate([120, 60, 120]);
}

// ---- Vibration (not supported on iOS Safari: silently skipped)

function vibrate(pattern: number | number[]): void {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

// ---- Screen Wake Lock: keep the screen on during focus mode, re-acquire when visible again.

export function keepAwake(): () => void {
  let lock: WakeLockSentinel | null = null;
  let active = true;
  const acquire = async () => {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      lock = await navigator.wakeLock.request('screen');
    } catch {
      lock = null; // e.g. low battery mode; not fatal
    }
  };
  const onVisible = () => {
    if (active && document.visibilityState === 'visible') void acquire();
  };
  void acquire();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    active = false;
    document.removeEventListener('visibilitychange', onVisible);
    void lock?.release();
  };
}
