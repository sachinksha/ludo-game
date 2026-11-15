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
  sounds: Record<SoundName, Voice>
}

export type SoundThemeId = 'classic' | 'tabla' | 'bansuri' | 'sitar' | 'santoor'
export const SOUND_THEME_IDS: readonly SoundThemeId[] = ['classic', 'tabla', 'bansuri', 'sitar', 'santoor']

// ---------------------------------------------------------------------------
// Classic: the original bleeps.

const classic: SoundTheme = {
  label: 'Classic',
  blurb: 'The original game bleeps and chirps.',
  level: 1.4,
  sounds: {
    roll: (ac, out, t) => {
      // Dice rattle: a few noise ticks, then a soft thud.
      for (let i = 0; i < 6; i++) noise(ac, out, t + i * 0.03, { duration: 0.03, gain: 0.25, filter: 'highpass', freq: 1500 })
      tone(ac, out, t + 0.18, { freq: 180, duration: 0.12, type: 'triangle', gain: 0.25 })
    },
    move: (ac, out, t) => tone(ac, out, t, { freq: 520, duration: 0.09, type: 'triangle', gain: 0.18, slideTo: 380 }),
    out: (ac, out, t) => tone(ac, out, t, { freq: 660, duration: 0.12, gain: 0.16, slideTo: 990 }),
    capture: (ac, out, t) => {
      tone(ac, out, t, { freq: 300, duration: 0.18, type: 'sawtooth', gain: 0.12, slideTo: 90 })
      tone(ac, out, t + 0.12, { freq: 880, duration: 0.2, type: 'square', gain: 0.08, slideTo: 440 })
    },
    centre: (ac, out, t) => {
      ;[523, 659, 784].forEach((freq, i) => tone(ac, out, t + i * 0.12, { freq, duration: i === 2 ? 0.25 : 0.15, type: 'triangle', gain: 0.2 }))
    },
    win: (ac, out, t) => {
      ;[523, 659, 784, 1046, 784, 1046].forEach((freq, i) => tone(ac, out, t + i * 0.14, { freq, duration: 0.22, type: 'triangle', gain: 0.22 }))
    },
    pass: (ac, out, t) => {
      // "Uh-oh": two short falling notes, the second lower and drooping.
      tone(ac, out, t, { freq: 494, duration: 0.14, type: 'square', gain: 0.08 })
      tone(ac, out, t + 0.16, { freq: 370, duration: 0.26, type: 'square', gain: 0.08, slideTo: 300 })
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
// E, a common bansuri key. Slides between notes (meend) and late vibrato are
// what make it sound like a bansuri rather than a whistle.

const FLUTE_SA = 329.63
const fluteStep = stepper()
const fn = (i: number) => scaleNote(FLUTE_SA, i)

const bansuri: SoundTheme = {
  label: 'Bansuri',
  blurb: 'Bamboo flute in Raag Bhupali. A moving piece climbs the raag.',
  level: 1,
  sounds: {
    // A murki: a quick ornament of grace notes.
    roll: (ac, out, t) => {
      ;[2, 1, 0, 1].forEach((n, i) => flute(ac, out, t + i * 0.065, { freq: fn(n + 5), duration: 0.09, gain: 0.13, attack: 0.015, breath: 0.35 }))
      flute(ac, out, t + 0.27, { freq: fn(7), duration: 0.22, gain: 0.14, from: fn(6) })
    },
    move: (ac, out, t) => flute(ac, out, t, { freq: fn(fluteStep(ac.currentTime) % 8), duration: 0.13, gain: 0.13, attack: 0.02, breath: 0.2 }),
    out: (ac, out, t) => flute(ac, out, t, { freq: fn(8), from: fn(5), duration: 0.22, gain: 0.14 }),
    capture: (ac, out, t) => flute(ac, out, t, { freq: fn(10), to: fn(6), duration: 0.32, gain: 0.17, attack: 0.01, breath: 0.5 }),
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
    pass: (ac, out, t) => flute(ac, out, t, { freq: fn(7), to: fn(4), duration: 0.5, gain: 0.14, breath: 0.4 }),
  },
}

// ---------------------------------------------------------------------------
// Sitar: plucked strings with the buzzing jawari bridge. Low Sa on C#3; the
// chikari (high drone strings) are struck for rhythm, and pitch bends (meend)
// carry the out-of-base and no-move sounds.

const SITAR_SA = 138.6
const SITAR: PluckSpec = { decay: 0.996, brightness: 0.58, buzz: 0.6, duration: 1.4 }
const CHIKARI: PluckSpec = { decay: 0.99, brightness: 0.6, buzz: 0.3, duration: 0.5 }
const sn = (i: number) => scaleNote(SITAR_SA, i)
const sitarStep = stepper()

/** Chikari stroke: the high drone strings strummed together. */
function chikari(ac: Ctx, out: AudioNode, t: number, gain = 0.14) {
  pluck(ac, out, t, SITAR_SA * 4, { ...CHIKARI, gain })
  pluck(ac, out, t + 0.008, SITAR_SA * 8, { ...CHIKARI, gain: gain * 0.7 })
}

const sitar: SoundTheme = {
  label: 'Sitar',
  blurb: 'Plucked strings with the buzzing jawari bridge and slides between notes.',
  level: 0.65,
  sounds: {
    roll: (ac, out, t) => {
      for (let i = 0; i < 4; i++) chikari(ac, out, t + i * 0.07, 0.12)
      pluck(ac, out, t + 0.3, sn(5), { ...SITAR, gain: 0.3 })
    },
    move: (ac, out, t) => pluck(ac, out, t, sn(5 + (sitarStep(ac.currentTime) % 6)), { ...SITAR, duration: 0.5, gain: 0.26 }),
    out: (ac, out, t) => pluck(ac, out, t, sn(6), { ...SITAR, gain: 0.3, bendTo: sn(8), bendTime: 0.12 }),
    capture: (ac, out, t) => {
      pluck(ac, out, t, sn(0), { ...SITAR, buzz: 0.9, gain: 0.42 })
      chikari(ac, out, t + 0.09, 0.18)
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

const SANTOOR_SA = 587.33
const SANTOOR: PluckSpec = { decay: 0.994, brightness: 0.72, buzz: 0, duration: 1.1 }
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
  level: 1.8,
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
