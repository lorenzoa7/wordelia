// Optional typewriter sounds, made with Web Audio (no sound files).
// A short filtered noise burst for keys, a deeper thud for Enter, a small bell for scene breaks.

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

function audio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
    const len = Math.floor(ctx.sampleRate * 0.05)
    noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  }
  return ctx
}

function burst(freq: number, gain: number, duration: number): void {
  const c = audio()
  const src = c.createBufferSource()
  src.buffer = noise
  src.playbackRate.value = 0.9 + Math.random() * 0.25
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq * (0.92 + Math.random() * 0.16)
  filter.Q.value = 1.4
  const g = c.createGain()
  const t = c.currentTime
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  src.connect(filter).connect(g).connect(c.destination)
  src.start(t)
  src.stop(t + duration)
}

function bell(): void {
  const c = audio()
  const t = c.currentTime
  for (const [f, v] of [
    [2093, 0.05],
    [3136, 0.025]
  ] as const) {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    const g = c.createGain()
    g.gain.setValueAtTime(v, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
    o.connect(g).connect(c.destination)
    o.start(t)
    o.stop(t + 0.9)
  }
}

export function typewriterSound(kind: 'key' | 'space' | 'enter' | 'back' | 'bell'): void {
  try {
    if (kind === 'key') burst(2600, 0.22, 0.045)
    else if (kind === 'space') burst(1500, 0.2, 0.06)
    else if (kind === 'enter') {
      burst(700, 0.3, 0.12)
      setTimeout(() => burst(1800, 0.12, 0.05), 70)
    } else if (kind === 'back') burst(1900, 0.12, 0.035)
    else bell()
  } catch {
    /* audio is not available */
  }
}
