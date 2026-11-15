/**
 * Small synthesis building blocks for the sound themes. Every function takes
 * the audio context, the node to play into and a start time, so the same code
 * plays live (AudioContext) or renders offline (OfflineAudioContext, used to
 * check loudness).
 *
 * Envelopes never ramp exponentially to zero: Web Audio throws on that, so
 * they ramp to SILENT instead.
 */

export type Ctx = BaseAudioContext

/** Quietest level used as the end of an exponential ramp. */
export const SILENT = 0.0001

/** Frequency `semitones` above `base` in equal temperament. */
export const semis = (base: number, semitones: number) => base * 2 ** (semitones / 12)

/**
 * Raag Bhupali, a five-note (pentatonic) raag: Sa Re Ga Pa Dha. Any order of
 * these notes sounds consonant, which suits short game sounds. Ratios are just
 * intonation, as Indian classical music tunes by ear against the drone.
 */
export const BHUPALI = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3] as const

/** Note `i` of the pentatonic scale on `sa`, continuing into higher octaves. */
export function scaleNote(sa: number, i: number): number {
  const n = BHUPALI.length
  const octave = Math.floor(i / n)
  return sa * BHUPALI[((i % n) + n) % n]! * 2 ** octave
}

/** A gain node with an attack and an exponential decay. Returns the node to feed. */
export function envelope(ac: Ctx, out: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ac.createGain()
  g.gain.setValueAtTime(SILENT, t)
  g.gain.linearRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(SILENT, t + attack + decay)
  g.connect(out)
  return g
}

export interface ToneSpec {
  freq: number
  duration: number
  type?: OscillatorType
  gain?: number
  attack?: number
  /** Optional frequency slide target, for a rising or falling "chirp". */
  slideTo?: number
}

/** A plain oscillator note. Used by the classic theme. */
export function tone(ac: Ctx, out: AudioNode, t: number, s: ToneSpec): void {
  const osc = ac.createOscillator()
  osc.type = s.type ?? 'sine'
  osc.frequency.setValueAtTime(s.freq, t)
  if (s.slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(s.slideTo, t + s.duration)
  osc.connect(envelope(ac, out, t, s.gain ?? 0.2, s.attack ?? 0.01, s.duration))
  osc.start(t)
  osc.stop(t + s.duration + 0.05)
}

/** White noise buffers, cached per context. */
const noiseCache = new WeakMap<Ctx, AudioBuffer>()
function noiseBuffer(ac: Ctx): AudioBuffer {
  let buf = noiseCache.get(ac)
  if (!buf) {
    buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 1), ac.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noiseCache.set(ac, buf)
  }
  return buf
}

export interface NoiseSpec {
  duration: number
  gain: number
  filter: BiquadFilterType
  freq: number
  q?: number
  attack?: number
}

/** Filtered noise: clicks, slaps, breath and the dice rattle. */
export function noise(ac: Ctx, out: AudioNode, t: number, s: NoiseSpec): void {
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const f = ac.createBiquadFilter()
  f.type = s.filter
  f.frequency.setValueAtTime(s.freq, t)
  f.Q.setValueAtTime(s.q ?? 1, t)
  src.connect(f).connect(envelope(ac, out, t, s.gain, s.attack ?? 0.002, s.duration))
  src.start(t, Math.random() * 0.5)
  src.stop(t + s.duration + 0.05)
}

/** One partial of a struck sound: frequency ratio, level, decay time. */
export type Partial = readonly [ratio: number, gain: number, decay: number]

export interface StrikeSpec {
  freq: number
  partials: readonly Partial[]
  gain: number
  /** Glide the pitch to this frequency (the tabla's bayan does this under the wrist). */
  glideTo?: number
  glideTime?: number
}

/**
 * A struck membrane or bar: a few sine partials, each decaying on its own.
 * The tabla's dayan is unusual among drums: the black syahi patch makes its
 * overtones nearly harmonic (1, 2, 3, 4...), so it rings with a clear pitch.
 */
export function strike(ac: Ctx, out: AudioNode, t: number, s: StrikeSpec): void {
  for (const [ratio, level, decay] of s.partials) {
    const osc = ac.createOscillator()
    osc.frequency.setValueAtTime(s.freq * ratio, t)
    if (s.glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(s.glideTo * ratio, t + (s.glideTime ?? decay))
    }
    osc.connect(envelope(ac, out, t, s.gain * level, 0.003, decay))
    osc.start(t)
    osc.stop(t + decay + 0.05)
  }
}

export interface FluteSpec {
  freq: number
  duration: number
  gain: number
  /** Start this far away and glide in: a meend (slide) into the note. */
  from?: number
  /** Glide away to this pitch over the note. */
  to?: number
  /** Vibrato depth as a fraction of the pitch (0.006 is gentle). */
  vibrato?: number
  /** Breath noise level relative to the tone. */
  breath?: number
  attack?: number
}

/** Harmonic recipe for a bamboo flute: strong fundamental, weak odd overtones. */
const fluteWaves = new WeakMap<Ctx, PeriodicWave>()
function fluteWave(ac: Ctx): PeriodicWave {
  let w = fluteWaves.get(ac)
  if (!w) {
    const real = new Float32Array([0, 1, 0.22, 0.12, 0.04, 0.02])
    w = ac.createPeriodicWave(real, new Float32Array(real.length))
    fluteWaves.set(ac, w)
  }
  return w
}

/** A bansuri note: soft attack, breath, optional slide and vibrato. */
export function flute(ac: Ctx, out: AudioNode, t: number, s: FluteSpec): void {
  const attack = s.attack ?? 0.04
  const end = t + s.duration
  const amp = ac.createGain()
  amp.gain.setValueAtTime(SILENT, t)
  amp.gain.linearRampToValueAtTime(s.gain, t + attack)
  amp.gain.setValueAtTime(s.gain, Math.max(t + attack, end - s.duration * 0.35))
  amp.gain.exponentialRampToValueAtTime(SILENT, end)
  amp.connect(out)

  const osc = ac.createOscillator()
  osc.setPeriodicWave(fluteWave(ac))
  osc.frequency.setValueAtTime(s.from ?? s.freq, t)
  if (s.from !== undefined) osc.frequency.exponentialRampToValueAtTime(s.freq, t + Math.min(0.12, s.duration * 0.5))
  if (s.to !== undefined) osc.frequency.exponentialRampToValueAtTime(s.to, end)
  if (s.vibrato) {
    const lfo = ac.createOscillator()
    lfo.frequency.setValueAtTime(5.5, t)
    const depth = ac.createGain()
    depth.gain.setValueAtTime(0, t)
    // Vibrato grows in after the note settles, as a player does.
    depth.gain.linearRampToValueAtTime(s.freq * s.vibrato, t + Math.min(0.25, s.duration * 0.6))
    lfo.connect(depth).connect(osc.frequency)
    lfo.start(t)
    lfo.stop(end + 0.05)
  }
  osc.connect(amp)
  osc.start(t)
  osc.stop(end + 0.05)

  const breath = s.breath ?? 0.25
  if (breath > 0) {
    noise(ac, out, t, { duration: Math.min(0.2, s.duration), gain: s.gain * breath, filter: 'bandpass', freq: s.freq * 2, q: 1.5, attack: 0.02 })
  }
}

export interface PluckSpec {
  /** Decay per period, 0.99 (short) to 0.999 (long ring). */
  decay: number
  /** 0.5 is a dark, soft string; nearer 1 is brighter. */
  brightness: number
  /** Jawari buzz amount (sitar bridge), 0 for none. */
  buzz: number
  duration: number
}

const pluckCache = new WeakMap<Ctx, Map<string, AudioBuffer>>()

/**
 * Karplus-Strong plucked string, rendered once into a buffer and cached. A
 * burst of noise circulates in a delay line one period long; averaging
 * neighbouring samples on each pass removes high frequencies first, which is
 * exactly how a real string's tone darkens as it rings.
 */
export function pluckBuffer(ac: Ctx, freq: number, s: PluckSpec): AudioBuffer {
  let byKey = pluckCache.get(ac)
  if (!byKey) {
    byKey = new Map()
    pluckCache.set(ac, byKey)
  }
  const key = `${freq.toFixed(2)}|${s.decay}|${s.brightness}|${s.buzz}|${s.duration}`
  const cached = byKey.get(key)
  if (cached) return cached
  const sr = ac.sampleRate
  const buffer = ac.createBuffer(1, Math.floor(sr * s.duration), sr)
  renderPluck(buffer.getChannelData(0), sr, freq, s, Math.random)
  byKey.set(key, buffer)
  return buffer
}

/** The Karplus-Strong loop itself. Pure, so it can be tested without audio. */
export function renderPluck(out: Float32Array, sampleRate: number, freq: number, s: PluckSpec, rng: () => number): void {
  const period = Math.max(2, Math.round(sampleRate / freq))
  const ring = new Float32Array(period)
  for (let i = 0; i < period; i++) ring[i] = rng() * 2 - 1
  const a = s.brightness
  let peak = 0
  for (let n = 0; n < out.length; n++) {
    const i = n % period
    const x = ring[i]!
    ring[i] = s.decay * (a * x + (1 - a) * ring[(i + 1) % period]!)
    // Jawari: the sitar's curved bridge lets the string graze it, adding a buzz.
    // An uneven (asymmetric) curve adds both even and odd harmonics.
    const y = s.buzz > 0 ? Math.tanh(x * (1 + 3 * s.buzz) + s.buzz * x * x) : x
    out[n] = y
    peak = Math.max(peak, Math.abs(y))
  }
  if (peak > 0) for (let n = 0; n < out.length; n++) out[n]! /= peak
}

/** Plays a plucked or hammered string, optionally bending its pitch (a meend). */
export function pluck(
  ac: Ctx,
  out: AudioNode,
  t: number,
  freq: number,
  s: PluckSpec & { gain: number; bendTo?: number; bendTime?: number; detuneCents?: number },
): void {
  const src = ac.createBufferSource()
  src.buffer = pluckBuffer(ac, freq, s)
  if (s.detuneCents) src.detune.setValueAtTime(s.detuneCents, t)
  if (s.bendTo !== undefined) {
    src.playbackRate.setValueAtTime(1, t + 0.02)
    src.playbackRate.exponentialRampToValueAtTime(s.bendTo / freq, t + 0.02 + (s.bendTime ?? 0.15))
  }
  const g = ac.createGain()
  g.gain.setValueAtTime(s.gain, t)
  src.connect(g).connect(out)
  src.start(t)
  src.stop(t + s.duration)
}

/**
 * Counts quick repeated calls, resetting after a pause. A piece's walk calls
 * the "move" sound once per hole, so melodic themes climb a scale as it walks.
 */
export function stepper(resetAfter = 0.5) {
  let last = -Infinity
  let n = 0
  return (now: number) => {
    n = now - last > resetAfter ? 0 : n + 1
    last = now
    return n
  }
}
