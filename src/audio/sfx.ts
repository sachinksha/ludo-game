/**
 * Sound effects synthesised with the Web Audio API, in a choice of themes
 * (themes.ts). No audio files are shipped, so there are no licensing concerns
 * and nothing extra to download.
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is created
 * lazily on the first play call. Every sound goes through one master chain:
 * theme level, then the player's volume, then a limiter so stacked sounds
 * (a tabla tihai, a fast walk) never clip.
 */
import { SOUND_THEMES, type SoundName, type SoundThemeId } from './themes'

export type { SoundName, SoundThemeId } from './themes'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false
let volume = 0.8
let theme: SoundThemeId = 'classic'

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) {
    ctx = new Ctor()
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -10
    limiter.knee.value = 6
    limiter.ratio.value = 12
    limiter.attack.value = 0.003
    limiter.release.value = 0.15
    master = ctx.createGain()
    master.gain.value = volume
    master.connect(limiter).connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function setMuted(value: boolean): void {
  muted = value
}

export function isMuted(): boolean {
  return muted
}

/** Master volume, 0 to 1. */
export function setVolume(value: number): void {
  volume = Math.min(1, Math.max(0, value))
  if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02)
}

export function setSoundTheme(id: SoundThemeId): void {
  if (id in SOUND_THEMES) theme = id
}

export function currentSoundTheme(): SoundThemeId {
  return theme
}

/** Plays `name` from `themeId` now, through the master chain. */
function play(name: SoundName, themeId: SoundThemeId): void {
  const ac = getContext()
  if (!ac || !master) return
  const t = SOUND_THEMES[themeId]
  const trim = ac.createGain()
  trim.gain.value = t.level
  trim.connect(master)
  t.sounds[name](ac, trim, ac.currentTime + 0.005)
}

/** A game sound in the chosen theme. Silent when muted. */
export function playSound(name: SoundName): void {
  if (muted) return
  play(name, theme)
}

/**
 * Plays a sound for the Settings "Try" buttons. It plays even when game
 * sounds are off: the player pressed a button to hear it.
 */
export function previewSound(name: SoundName, themeId: SoundThemeId = theme): void {
  play(name, themeId)
}
