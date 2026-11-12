/**
 * Sound effects synthesised with the Web Audio API. No audio files are shipped,
 * so there are no licensing concerns and nothing extra to download.
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is created
 * lazily on the first play call.
 */

export type SoundName = 'roll' | 'move' | 'capture' | 'finish' | 'win' | 'pass'

let ctx: AudioContext | null = null
let muted = false

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function setMuted(value: boolean): void {
  muted = value
}

export function isMuted(): boolean {
  return muted
}

interface ToneSpec {
  freq: number
  start: number
  duration: number
  type?: OscillatorType
  gain?: number
  /** Optional frequency slide target, for a rising or falling "chirp". */
  slideTo?: number
}

function playTones(tones: ToneSpec[]): void {
  if (muted) return
  const ac = getContext()
  if (!ac) return
  const now = ac.currentTime
  for (const t of tones) {
    const osc = ac.createOscillator()
    const amp = ac.createGain()
    osc.type = t.type ?? 'sine'
    osc.frequency.setValueAtTime(t.freq, now + t.start)
    if (t.slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(t.slideTo, now + t.start + t.duration)
    }
    const peak = t.gain ?? 0.2
    amp.gain.setValueAtTime(0, now + t.start)
    amp.gain.linearRampToValueAtTime(peak, now + t.start + 0.01)
    amp.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.duration)
    osc.connect(amp).connect(ac.destination)
    osc.start(now + t.start)
    osc.stop(now + t.start + t.duration + 0.02)
  }
}

/** A short burst of filtered noise, used for the dice rattle. */
function playNoiseBurst(duration: number, gain: number): void {
  if (muted) return
  const ac = getContext()
  if (!ac) return
  const length = Math.floor(ac.sampleRate * duration)
  const buffer = ac.createBuffer(1, length, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
  const src = ac.createBufferSource()
  src.buffer = buffer
  const amp = ac.createGain()
  amp.gain.value = gain
  src.connect(amp).connect(ac.destination)
  src.start()
}

const SOUNDS: Record<SoundName, () => void> = {
  roll: () => {
    // Dice rattle: a few noise ticks, then a soft thud.
    for (let i = 0; i < 6; i++) playNoiseBurst(0.03, 0.15)
    playTones([{ freq: 180, start: 0.18, duration: 0.12, type: 'triangle', gain: 0.25 }])
  },
  move: () => {
    playTones([{ freq: 520, start: 0, duration: 0.09, type: 'triangle', gain: 0.18, slideTo: 380 }])
  },
  capture: () => {
    playTones([
      { freq: 300, start: 0, duration: 0.18, type: 'sawtooth', gain: 0.12, slideTo: 90 },
      { freq: 880, start: 0.12, duration: 0.2, type: 'square', gain: 0.08, slideTo: 440 },
    ])
  },
  finish: () => {
    playTones([
      { freq: 523, start: 0, duration: 0.15, type: 'triangle', gain: 0.2 },
      { freq: 659, start: 0.12, duration: 0.15, type: 'triangle', gain: 0.2 },
      { freq: 784, start: 0.24, duration: 0.25, type: 'triangle', gain: 0.22 },
    ])
  },
  win: () => {
    const notes = [523, 659, 784, 1046, 784, 1046]
    playTones(
      notes.map((freq, i) => ({
        freq,
        start: i * 0.14,
        duration: 0.22,
        type: 'triangle' as const,
        gain: 0.22,
      })),
    )
  },
  pass: () => {
    playTones([{ freq: 260, start: 0, duration: 0.2, type: 'sine', gain: 0.15, slideTo: 180 }])
  },
}

export function playSound(name: SoundName): void {
  SOUNDS[name]()
}
