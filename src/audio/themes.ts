/**
 * Sound themes. Each theme gives every game sound its own voice; the game only
 * ever asks for a sound by name ("roll", "capture"...), so adding a theme touches
 * nothing else.
 *
 * Every theme is synthesised (see synth.ts): no audio files, no licences,
 * nothing to download. To tweak a theme, change the numbers here and use the
 * "Try" buttons in Settings to listen.
 */
import {
  flute,
  noise,
  pluck,
  scaleNote,
  semis,
  stepper,
  strike,
  tone,
  type Ctx,
  type Partial,
  type PluckSpec,
} from './synth'

export type SoundName =
  | 'roll'
  /** One square walked. */
  | 'move'
  /** A token comes out of its base. */
  | 'out'
  /** An opponent sent back to base. */
  | 'capture'
  /** A token reached the centre. */
  | 'centre'
  /** A player finished, or the game ended. */
  | 'win'
  /** The turn passed: no legal move, or three sixes. */
  | 'pass'

export const SOUND_NAMES: readonly SoundName[] = ['roll', 'move', 'out', 'capture', 'centre', 'win', 'pass']

/** Short labels for the "Try" buttons in Settings. */
export const SOUND_LABEL: Record<SoundName, string> = {
  roll: 'Roll',
  move: 'Step',
  out: 'Out of base',
  capture: 'Capture',
  centre: 'Centre',
  win: 'Finish',
  pass: 'No move',
}

/** Plays one sound starting at time `t` into `out`. */
export type Voice = (ac: Ctx, out: AudioNode, t: number) => void

export interface SoundTheme {
  label: string
  /** One line for Settings: what it sounds like. */
  blurb: string
  /** Level trim so themes sound about equally loud. */
  level: number
  /**
   * Low-pass cutoff in Hz, or none. Ears are most sensitive around 2 to 5 kHz,
   * so energy there sounds sharp and loud even at a modest level; rolling it off
   * makes a theme sweeter without making it quieter where it matters.
   */
  warmth?: number
  /** How much of the theme goes to the shared room reverb, 0 to 1. A little makes notes bloom. */
  space?: number
  sounds: Record<SoundName, Voice>
}

export type SoundThemeId = 'classic' | 'tabla' | 'bansuri' | 'sitar' | 'santoor'
export const SOUND_THEME_IDS: readonly SoundThemeId[] = ['classic', 'tabla', 'bansuri', 'sitar', 'santoor']

// ---------------------------------------------------------------------------
// Classic: the original bleeps.

// Softened: sine and triangle waves only (square and sawtooth waves are all
// buzzy overtones), slightly slower attacks, a darker dice rattle and a little
// room, so the bleeps chime rather than beep.

const classic: SoundTheme = {
  label: 'Classic',
  blurb: 'Soft game chimes and chirps.',
  level: 2,
  warmth: 3200,
  space: 0.18,
  sounds: {
    roll: (ac, out, t) => {
      // Dice rattle: a few soft ticks, then a gentle thud.
      for (let i = 0; i < 6; i++) noise(ac, out, t + i * 0.03, { duration: 0.03, gain: 0.2, filter: 'bandpass', freq: 1100, q: 1.2 })
      tone(ac, out, t + 0.18, { freq: 180, duration: 0.14, type: 'sine', gain: 0.3 })
    },
    move: (ac, out, t) => tone(ac, out, t, { freq: 523, duration: 0.1, type: 'sine', gain: 0.2, attack: 0.012, slideTo: 392 }),
    out: (ac, out, t) => tone(ac, out, t, { freq: 587, duration: 0.14, gain: 0.17, attack: 0.015, slideTo: 880 }),
    capture: (ac, out, t) => {
      tone(ac, out, t, { freq: 294, duration: 0.2, type: 'triangle', gain: 0.2, slideTo: 110 })
      tone(ac, out, t + 0.12, { freq: 659, duration: 0.22, type: 'sine', gain: 0.12, slideTo: 392 })
    },
    centre: (ac, out, t) => {
      ;[523, 659, 784].forEach((freq, i) => tone(ac, out, t + i * 0.12, { freq, duration: i === 2 ? 0.3 : 0.16, type: 'sine', gain: 0.2, attack: 0.012 }))
    },
    win: (ac, out, t) => {
      ;[523, 659, 784, 1046, 784, 1046].forEach((freq, i) => tone(ac, out, t + i * 0.14, { freq, duration: i === 5 ? 0.5 : 0.22, type: 'sine', gain: 0.2, attack: 0.012 }))
    },
    pass: (ac, out, t) => {
      // "Uh-oh": two short falling notes, the second lower and drooping.
      tone(ac, out, t, { freq: 440, duration: 0.15, type: 'triangle', gain: 0.17 })
      tone(ac, out, t + 0.17, { freq: 330, duration: 0.28, type: 'triangle', gain: 0.17, slideTo: 277 })
    },
  },
}

// ---------------------------------------------------------------------------
// Tabla: the pair of hand drums. The right drum (dayan) is tuned to Sa and rings
// with near-harmonic overtones; the left drum (bayan) is deep, and the player's
// wrist slides its pitch up or down. Strokes have names (bols), and the sounds
// below are short phrases of real bols.

/** Dayan tuned to C#4, a common pitch for a medium tabla. */
const DAYAN = 277
const BAYAN = 82

const NA: readonly Partial[] = [
  [1, 1, 0.32],
  [2, 0.55, 0.22],
  [3, 0.35, 0.16],
  [4, 0.18, 0.1],
]
const TIN: readonly Partial[] = [
  [1, 0.4, 0.5],
  [2, 0.8, 0.45],
  [3, 0.4, 0.3],
]

const bol = {
  /** Na: a bright ringing stroke on the dayan's rim. */
  na: (ac: Ctx, out: AudioNode, t: number, gain = 0.32) => {
    strike(ac, out, t, { freq: DAYAN, partials: NA, gain })
    noise(ac, out, t, { duration: 0.012, gain: gain * 0.6, filter: 'highpass', freq: 3500 })
  },
  /** Tin: a softer, longer ring with more overtone. */
  tin: (ac: Ctx, out: AudioNode, t: number, gain = 0.26) => strike(ac, out, t, { freq: DAYAN, partials: TIN, gain }),
  /** Te / Ti: a closed, damped tap. `alt` switches fingers for a slightly different colour. */
  te: (ac: Ctx, out: AudioNode, t: number, gain = 0.28, alt = false) => {
    strike(ac, out, t, { freq: DAYAN * (alt ? 1.06 : 1), partials: [[1, 1, 0.05], [2.4, 0.4, 0.03]], gain })
    noise(ac, out, t, { duration: 0.025, gain: gain * 0.7, filter: 'bandpass', freq: alt ? 2600 : 2000, q: 2 })
  },
  /** Ge: the open bayan, its pitch pushed up by the wrist. */
  ge: (ac: Ctx, out: AudioNode, t: number, gain = 0.5, glide = 1.25) =>
    strike(ac, out, t, { freq: BAYAN, partials: [[1, 1, 0.55], [2, 0.25, 0.3]], gain, glideTo: BAYAN * glide, glideTime: 0.25 }),
  /** Ke / Ka: a flat-palm slap on the bayan, no pitch. */
  ka: (ac: Ctx, out: AudioNode, t: number, gain = 0.35) =>
    noise(ac, out, t, { duration: 0.06, gain, filter: 'lowpass', freq: 500, q: 0.7 }),
  /** Dha: Na and Ge together, the strongest stroke. */
  dha: (ac: Ctx, out: AudioNode, t: number, gain = 0.32) => {
    bol.na(ac, out, t, gain)
    bol.ge(ac, out, t, gain * 1.5)
  },
  /** Dhin: Tin and Ge together. */
  dhin: (ac: Ctx, out: AudioNode, t: number, gain = 0.26) => {
    bol.tin(ac, out, t, gain)
    bol.ge(ac, out, t, gain * 1.4, 1.15)
  },
}

/** Ti-ra-ki-ta: four quick strokes, the classic tabla flourish. */
function tirakita(ac: Ctx, out: AudioNode, t: number, gap = 0.055) {
  bol.te(ac, out, t, 0.26)
  bol.te(ac, out, t + gap, 0.2, true)
  bol.ka(ac, out, t + gap * 2, 0.3)
  bol.te(ac, out, t + gap * 3, 0.24)
}

const tablaStep = stepper()

const tabla: SoundTheme = {
  label: 'Tabla',
  blurb: 'Hand drums: real tabla strokes (bols), with a tihai when someone finishes.',
  level: 0.55,
  sounds: {
    roll: (ac, out, t) => {
      tirakita(ac, out, t)
      bol.dha(ac, out, t + 0.26, 0.28)
    },
    // Walking alternates two fingers, like a player's light filler strokes.
    move: (ac, out, t) => bol.te(ac, out, t, 0.24, tablaStep(ac.currentTime) % 2 === 1),
    out: (ac, out, t) => bol.ge(ac, out, t, 0.55, 1.6),
    capture: (ac, out, t) => {
      bol.ka(ac, out, t, 0.4)
      bol.dha(ac, out, t + 0.08, 0.4)
    },
    // Dha dhin dhin dha: the first bar of teentaal, the most common rhythm cycle.
    centre: (ac, out, t) => {
      bol.dha(ac, out, t)
      bol.dhin(ac, out, t + 0.15)
      bol.dhin(ac, out, t + 0.3)
      bol.dha(ac, out, t + 0.45)
    },
    // A tihai: one phrase played three times, the last stroke landing on the beat (sam).
    win: (ac, out, t) => {
      const phrase = 0.42
      for (let i = 0; i < 3; i++) {
        const s = t + i * phrase
        bol.dha(ac, out, s, 0.3)
        tirakita(ac, out, s + 0.1, 0.05)
      }
      bol.dha(ac, out, t + 3 * phrase, 0.42)
      bol.ge(ac, out, t + 3 * phrase, 0.6, 1.35)
    },
    // The bayan's pitch sliding down: a drooping "ghe-oo".
    pass: (ac, out, t) => {
      bol.ka(ac, out, t, 0.25)
      bol.ge(ac, out, t + 0.07, 0.6, 0.7)
    },
  },
}

// ---------------------------------------------------------------------------
// Bansuri: the bamboo flute. Notes come from Raag Bhupali (Sa Re Ga Pa Dha) on
// A, the key of a longer, mellower bansuri (it was on E, a fourth higher,
// which put the finish near 1.3 kHz and sounded whistly). Slides between notes (meend) and late vibrato are
// what make it sound like a bansuri rather than a whistle.

const FLUTE_SA = 220
const fluteStep = stepper()
const fn = (i: number) => scaleNote(FLUTE_SA, i)

const bansuri: SoundTheme = {
  label: 'Bansuri',
  blurb: 'Bamboo flute in Raag Bhupali. A moving piece climbs the raag.',
  level: 1.25,
  warmth: 3600,
  space: 0.3,
  sounds: {
    // A murki: a quick ornament of grace notes.
    roll: (ac, out, t) => {
      ;[2, 1, 0, 1].forEach((n, i) => flute(ac, out, t + i * 0.065, { freq: fn(n + 5), duration: 0.09, gain: 0.13, attack: 0.018, breath: 0.15 }))
      flute(ac, out, t + 0.27, { freq: fn(7), duration: 0.22, gain: 0.14, from: fn(6) })
    },
    move: (ac, out, t) => flute(ac, out, t, { freq: fn(fluteStep(ac.currentTime) % 8), duration: 0.13, gain: 0.13, attack: 0.025, breath: 0.1 }),
    out: (ac, out, t) => flute(ac, out, t, { freq: fn(8), from: fn(5), duration: 0.22, gain: 0.14 }),
    capture: (ac, out, t) => flute(ac, out, t, { freq: fn(10), to: fn(6), duration: 0.34, gain: 0.16, attack: 0.02, breath: 0.2 }),
    centre: (ac, out, t) => {
      ;[5, 6, 7].forEach((n, i) => flute(ac, out, t + i * 0.12, { freq: fn(n), duration: 0.14, gain: 0.14 }))
      flute(ac, out, t + 0.36, { freq: fn(8), duration: 0.45, gain: 0.16, vibrato: 0.008, from: fn(7) })
    },
    win: (ac, out, t) => {
      ;[5, 6, 7, 8, 9].forEach((n, i) => flute(ac, out, t + i * 0.11, { freq: fn(n), duration: 0.13, gain: 0.14 }))
      flute(ac, out, t + 0.55, { freq: fn(10), from: fn(9), duration: 0.9, gain: 0.17, vibrato: 0.01 })
      flute(ac, out, t + 1.45, { freq: fn(8), from: fn(9), duration: 0.6, gain: 0.12, vibrato: 0.008 })
    },
    // A sad slide down from Ga to Sa.
    pass: (ac, out, t) => flute(ac, out, t, { freq: fn(7), to: fn(4), duration: 0.5, gain: 0.14, breath: 0.15 }),
  },
}

// ---------------------------------------------------------------------------
// Sitar: plucked strings with the buzzing jawari bridge. Low Sa on C#3; the
// chikari (high drone strings) are struck for rhythm, and pitch bends (meend)
// carry the out-of-base and no-move sounds.

const SITAR_SA = 138.6
// Brightness near 0.5 is the darkest, roundest string; the jawari buzz is kept
// to a shimmer (it was 0.6, which rasped).
const SITAR: PluckSpec = { decay: 0.996, brightness: 0.52, buzz: 0.28, duration: 1.4, soft: 3 }
const CHIKARI: PluckSpec = { decay: 0.99, brightness: 0.52, buzz: 0.1, duration: 0.5, soft: 2 }
const sn = (i: number) => scaleNote(SITAR_SA, i)
const sitarStep = stepper()

/** Chikari stroke: the high drone strings strummed together. */
function chikari(ac: Ctx, out: AudioNode, t: number, gain = 0.12) {
  pluck(ac, out, t, SITAR_SA * 3, { ...CHIKARI, gain })
  pluck(ac, out, t + 0.008, SITAR_SA * 4, { ...CHIKARI, gain: gain * 0.6 })
}

const sitar: SoundTheme = {
  label: 'Sitar',
  blurb: 'Plucked strings with the buzzing jawari bridge and slides between notes.',
  level: 0.75,
  warmth: 3000,
  space: 0.22,
  sounds: {
    roll: (ac, out, t) => {
      for (let i = 0; i < 4; i++) chikari(ac, out, t + i * 0.07, 0.1)
      pluck(ac, out, t + 0.3, sn(5), { ...SITAR, gain: 0.3 })
    },
    move: (ac, out, t) => pluck(ac, out, t, sn(5 + (sitarStep(ac.currentTime) % 6)), { ...SITAR, duration: 0.5, gain: 0.26 }),
    out: (ac, out, t) => pluck(ac, out, t, sn(6), { ...SITAR, gain: 0.3, bendTo: sn(8), bendTime: 0.12 }),
    capture: (ac, out, t) => {
      pluck(ac, out, t, sn(0), { ...SITAR, buzz: 0.45, gain: 0.4 })
      chikari(ac, out, t + 0.09, 0.14)
    },
    centre: (ac, out, t) => {
      ;[5, 6, 7, 8].forEach((n, i) => pluck(ac, out, t + i * 0.12, sn(n), { ...SITAR, gain: 0.28 }))
    },
    // A short jhala: melody notes alternating with chikari strokes, ending on a long Sa
    // with the sympathetic strings (taraf) ringing softly after it.
    win: (ac, out, t) => {
      const notes = [5, 6, 7, 8, 9, 8, 9, 10]
      notes.forEach((n, i) => {
        pluck(ac, out, t + i * 0.16, sn(n), { ...SITAR, gain: 0.28 })
        chikari(ac, out, t + i * 0.16 + 0.08, 0.09)
      })
      const end = t + notes.length * 0.16
      pluck(ac, out, end, sn(5), { ...SITAR, duration: 1.6, gain: 0.36 })
      ;[10, 12, 13].forEach((n, i) => pluck(ac, out, end + 0.15 + i * 0.12, sn(n), { ...SITAR, buzz: 0.1, gain: 0.06 }))
    },
    pass: (ac, out, t) => pluck(ac, out, t, sn(7), { ...SITAR, gain: 0.32, bendTo: sn(4), bendTime: 0.35 }),
  },
}

// ---------------------------------------------------------------------------
// Santoor: a hammered dulcimer from Kashmir. Each note has a pair of strings
// tuned a hair apart, which gives the shimmer; fast repeated strokes (tremolo)
// and cascading runs are its signature.

// Sa on A4 (it was D5, a fourth higher), with a softer hammer: real santoor
// hammers (mallets) are often padded for exactly this.
const SANTOOR_SA = 440
const SANTOOR: PluckSpec = { decay: 0.994, brightness: 0.55, buzz: 0, duration: 1.1, soft: 4 }
const tn = (i: number) => scaleNote(SANTOOR_SA, i)
const santoorStep = stepper()

/** One hammer stroke on a string pair. */
function hammer(ac: Ctx, out: AudioNode, t: number, freq: number, gain = 0.2, duration = SANTOOR.duration) {
  pluck(ac, out, t, freq, { ...SANTOOR, duration, gain, detuneCents: -4 })
  pluck(ac, out, t + 0.004, freq, { ...SANTOOR, duration, gain: gain * 0.8, detuneCents: 5 })
}

const santoor: SoundTheme = {
  label: 'Santoor',
  blurb: 'Hammered strings: a bright shimmer, tremolo and cascading runs.',
  level: 1.1,
  warmth: 3200,
  space: 0.28,
  sounds: {
    // Tremolo: one note struck rapidly, swelling.
    roll: (ac, out, t) => {
      for (let i = 0; i < 7; i++) hammer(ac, out, t + i * 0.045, tn(2), 0.07 + i * 0.015, 0.4)
    },
    move: (ac, out, t) => hammer(ac, out, t, tn(santoorStep(ac.currentTime) % 8), 0.26, 0.5),
    out: (ac, out, t) => {
      hammer(ac, out, t, tn(3), 0.2, 0.4)
      hammer(ac, out, t + 0.06, tn(5), 0.24)
    },
    capture: (ac, out, t) => {
      hammer(ac, out, t, tn(0) / 2, 0.3)
      hammer(ac, out, t + 0.01, semis(tn(0) / 2, 1), 0.18)
    },
    centre: (ac, out, t) => {
      ;[0, 2, 4, 5].forEach((n, i) => hammer(ac, out, t + i * 0.09, tn(n), 0.18))
    },
    // A cascade down and back up, ending in a tremolo on Sa.
    win: (ac, out, t) => {
      const run = [9, 8, 7, 6, 5, 4, 3, 2, 3, 4, 5]
      run.forEach((n, i) => hammer(ac, out, t + i * 0.075, tn(n), 0.2))
      const end = t + run.length * 0.075
      for (let i = 0; i < 10; i++) hammer(ac, out, end + i * 0.05, tn(5), 0.08 + 0.01 * Math.min(i, 5), 0.6)
      hammer(ac, out, end + 0.55, tn(5), 0.22, 1.4)
    },
    pass: (ac, out, t) => {
      hammer(ac, out, t, tn(2), 0.16)
      hammer(ac, out, t + 0.15, tn(0), 0.16)
      hammer(ac, out, t + 0.3, tn(-2), 0.18)
    },
  },
}

export const SOUND_THEMES: Record<SoundThemeId, SoundTheme> = { classic, tabla, bansuri, sitar, santoor }
