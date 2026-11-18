import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderPluck, scaleNote, stepper } from './synth'
import { SOUND_NAMES, SOUND_THEME_IDS, SOUND_THEMES } from './themes'

/**
 * A stand-in AudioContext that records what the themes schedule and rejects
 * what a real browser rejects: exponential ramps to zero or below, and
 * non-finite or negative times and values.
 */
class FakeParam {
  value = 0
  events: string[] = []
  private check(v: number, t: number) {
    if (!Number.isFinite(v) || !Number.isFinite(t) || t < 0) throw new RangeError(`bad automation ${v} @ ${t}`)
  }
  setValueAtTime(v: number, t: number) {
    this.check(v, t)
    this.events.push('set')
    return this
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.check(v, t)
    return this
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.check(v, t)
    if (v <= 0) throw new RangeError('exponential ramp to a non-positive value')
    return this
  }
  setTargetAtTime(v: number, t: number) {
    this.check(v, t)
    return this
  }
}

class FakeNode {
  connect(next: FakeNode) {
    return next
  }
  disconnect() {}
}

class FakeSource extends FakeNode {
  frequency = new FakeParam()
  detune = new FakeParam()
  playbackRate = new FakeParam()
  type = 'sine'
  buffer: unknown = null
  started = false
  private ctx: FakeContext
  constructor(ctx: FakeContext) {
    super()
    this.ctx = ctx
  }
  setPeriodicWave() {}
  start(t = 0) {
    if (!Number.isFinite(t) || t < 0) throw new RangeError('bad start')
    this.started = true
    this.ctx.voices++
  }
  stop(t = 0) {
    if (!Number.isFinite(t) || t < 0) throw new RangeError('bad stop')
  }
}

class FakeContext {
  currentTime = 0
  sampleRate = 8000
  state = 'running'
  destination = new FakeNode()
  voices = 0
  createGain() {
    return Object.assign(new FakeNode(), { gain: new FakeParam() })
  }
  createOscillator() {
    return new FakeSource(this)
  }
  createBufferSource() {
    return new FakeSource(this)
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam() })
  }
  createDynamicsCompressor() {
    const p = () => new FakeParam()
    return Object.assign(new FakeNode(), { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p() })
  }
  createConvolver() {
    return Object.assign(new FakeNode(), { buffer: null as unknown, normalize: true })
  }
  createPeriodicWave() {
    return {}
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length)
    return { getChannelData: () => data, length }
  }
  resume() {
    return Promise.resolve()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function loadWithFakeAudio() {
  const ctx = new FakeContext()
  vi.stubGlobal('AudioContext', function AudioContext() {
    return ctx
  })
  const sfx = await import('./sfx')
  return { ctx, sfx }
}

describe('sound effects', () => {
  it('tracks the mute setting', async () => {
    const { isMuted, setMuted } = await import('./sfx')
    expect(isMuted()).toBe(false)
    setMuted(true)
    expect(isMuted()).toBe(true)
  })

  it('does not throw when Web Audio is unavailable (as in jsdom)', async () => {
    const { playSound, previewSound, setMuted } = await import('./sfx')
    for (const name of SOUND_NAMES) expect(() => playSound(name)).not.toThrow()
    setMuted(true)
    for (const name of SOUND_NAMES) expect(() => previewSound(name)).not.toThrow()
  })

  it('every theme voices every sound, with automation a browser accepts', async () => {
    const { ctx, sfx } = await loadWithFakeAudio()
    for (const id of SOUND_THEME_IDS) {
      sfx.setSoundTheme(id)
      for (const name of SOUND_NAMES) {
        const before = ctx.voices
        expect(() => sfx.playSound(name), `${id} ${name}`).not.toThrow()
        expect(ctx.voices, `${id} ${name} makes a sound`).toBeGreaterThan(before)
        ctx.currentTime += 1
      }
    }
  })

  it('stays silent when muted, but the Settings preview still plays', async () => {
    const { ctx, sfx } = await loadWithFakeAudio()
    sfx.setMuted(true)
    sfx.playSound('capture')
    expect(ctx.voices).toBe(0)
    sfx.previewSound('capture', 'tabla')
    expect(ctx.voices).toBeGreaterThan(0)
  })

  it('ignores unknown theme ids', async () => {
    const { sfx } = await loadWithFakeAudio()
    sfx.setSoundTheme('sitar')
    sfx.setSoundTheme('kazoo' as never)
    expect(sfx.currentSoundTheme()).toBe('sitar')
  })

  it('describes each theme for Settings', () => {
    for (const id of SOUND_THEME_IDS) {
      expect(SOUND_THEMES[id].label).toBeTruthy()
      expect(SOUND_THEMES[id].blurb.length).toBeGreaterThan(10)
    }
  })
})

describe('synthesis helpers', () => {
  it('walks Raag Bhupali up through the octaves', () => {
    expect(scaleNote(100, 0)).toBe(100)
    expect(scaleNote(100, 2)).toBe(125) // Ga
    expect(scaleNote(100, 5)).toBe(200) // Sa an octave up
    expect(scaleNote(100, -1)).toBeCloseTo(83.33, 1) // Dha below
  })

  it('counts quick calls and resets after a pause', () => {
    const step = stepper(0.5)
    expect([step(0), step(0.1), step(0.2), step(1), step(1.1)]).toEqual([0, 1, 2, 0, 1])
  })

  it('renders a plucked string that rings at its pitch and fades', () => {
    const sr = 8000
    const out = new Float32Array(sr)
    let seed = 1
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    renderPluck(out, sr, 200, { decay: 0.995, brightness: 0.5, buzz: 0, duration: 1 }, rng)
    const energy = (from: number, to: number) => out.slice(from, to).reduce((s, x) => s + x * x, 0)
    expect(Math.max(...out.map(Math.abs))).toBeCloseTo(1, 5)
    expect(energy(0, 800)).toBeGreaterThan(energy(7200, 8000) * 4)
    // A string is periodic: one period later the wave nearly repeats.
    const period = sr / 200
    let diff = 0
    for (let i = 2000; i < 2400; i++) diff += Math.abs(out[i]! - out[i + period]!)
    expect(diff / 400).toBeLessThan(0.05)
  })
})
