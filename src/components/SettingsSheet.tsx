import { useId, useState } from 'react'
import { previewSound } from '../audio/sfx'
import { SOUND_LABEL, SOUND_NAMES, SOUND_THEME_IDS, SOUND_THEMES } from '../audio/themes'
import { DEFAULT_SETTINGS, useGameStore, type Settings, type ToggleSetting } from '../store/gameStore'
import { THEMES, type Theme } from '../theme'
import { Icon, type IconName } from './Icons'
import { Sheet } from './Sheet'

const THEME_LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const THEME_ICON: Record<Theme, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' }

/** One on/off preference: label and hint on the left, a switch on the right. */
function SwitchRow({ setting, label, hint }: { setting: ToggleSetting; label: string; hint?: string }) {
  const on = useGameStore((s) => s.settings[setting])
  const updateSettings = useGameStore((s) => s.updateSettings)
  const hintId = useId()
  return (
    <div className="setting-row">
      <span className="setting-text">
        <span className="setting-label">{label}</span>
        {hint && (
          <span className="setting-hint" id={hintId}>
            {hint}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        aria-describedby={hint ? hintId : undefined}
        className="setting-switch"
        onClick={() => updateSettings({ [setting]: !on })}
      >
        <span className={`switch-track${on ? ' switch-on' : ''}`} aria-hidden="true">
          <span className="switch-knob" />
        </span>
      </button>
    </div>
  )
}

/** A small set of mutually exclusive choices, shown as a segmented control (native radios). */
function Segmented<K extends keyof Settings>({
  setting,
  label,
  options,
  optionLabel,
  icon,
}: {
  setting: K
  label: string
  options: readonly Settings[K][]
  optionLabel: (v: Settings[K]) => string
  icon?: (v: Settings[K]) => IconName
}) {
  const value = useGameStore((s) => s.settings[setting])
  const updateSettings = useGameStore((s) => s.updateSettings)
  const name = useId()
  return (
    <fieldset className="setting-row setting-fieldset">
      <legend className="setting-label">{label}</legend>
      <div className="segmented">
        {options.map((v) => (
          <label key={String(v)} className="segment">
            <input type="radio" name={name} checked={value === v} onChange={() => updateSettings({ [setting]: v } as Partial<Settings>)} />
            {icon && <Icon name={icon(v)} size={16} />}
            <span>{optionLabel(v)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Choose the instrument that voices the game, and listen before choosing. */
function SoundThemePicker() {
  const soundTheme = useGameStore((s) => s.settings.soundTheme)
  const volume = useGameStore((s) => s.settings.volume)
  const sound = useGameStore((s) => s.settings.sound)
  const updateSettings = useGameStore((s) => s.updateSettings)
  const name = useId()
  return (
    <>
      <div className="setting-row">
        <label className="setting-label" htmlFor={`${name}-volume`}>
          Volume
        </label>
        <input
          id={`${name}-volume`}
          className="setting-range"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          disabled={!sound}
          aria-valuetext={`${Math.round(volume * 100)}%`}
          onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
          // Let the player hear the new level as soon as they let go.
          onPointerUp={() => previewSound('centre')}
          onKeyUp={() => previewSound('move')}
        />
      </div>
      <fieldset className="sound-themes">
        <legend className="setting-label">Sound style</legend>
        {SOUND_THEME_IDS.map((id) => (
          <div key={id} className={`sound-theme${soundTheme === id ? ' sound-theme-on' : ''}`}>
            <label className="sound-theme-pick">
              <input type="radio" name={name} checked={soundTheme === id} onChange={() => updateSettings({ soundTheme: id })} />
              <span>
                <span className="setting-label">{SOUND_THEMES[id].label}</span>
                <span className="setting-hint">{SOUND_THEMES[id].blurb}</span>
              </span>
            </label>
            <button type="button" className="sound-play" onClick={() => previewSound('win', id)} aria-label={`Play a sample of ${SOUND_THEMES[id].label}`}>
              <Icon name="play" size={16} />
            </button>
          </div>
        ))}
      </fieldset>
      <div className="sound-try" role="group" aria-label={`Try each ${SOUND_THEMES[soundTheme].label} sound`}>
        <span className="setting-hint">Try each sound:</span>
        {SOUND_NAMES.map((n) => (
          <button key={n} type="button" className="chip-button" onClick={() => previewSound(n)}>
            {SOUND_LABEL[n]}
          </button>
        ))}
      </div>
    </>
  )
}

/**
 * Every preference in one place. Changes apply at once and never interrupt a
 * game. Anything that ends or restarts the game lives in the Game menu
 * instead, so nothing here can lose a game by accident.
 */
export function SettingsContent() {
  return (
    <div className="settings">
      <section aria-labelledby="settings-play">
        <h3 id="settings-play">Playing</h3>
        <SwitchRow setting="autoRoll" label="Auto roll" hint="Roll the dice by itself on your turn. You still choose every real move." />
        <SwitchRow setting="autoMove" label="Auto move" hint="Play your move by itself when there is no real choice: one piece can move, or they all sit on the same square." />
        <SwitchRow
          setting="undo"
          label="Undo and redo"
          hint="Show Undo and Redo in local games (Ctrl+Z, Ctrl+Y). Each undo goes back one step: your move first, then your roll."
        />
      </section>

      <section aria-labelledby="settings-sound">
        <h3 id="settings-sound">Sound</h3>
        <SwitchRow setting="sound" label="Sound effects" />
        <SoundThemePicker />
      </section>

      <section aria-labelledby="settings-look">
        <h3 id="settings-look">Look</h3>
        <Segmented setting="theme" label="Theme" options={THEMES} optionLabel={(v) => THEME_LABEL[v]} icon={(v) => THEME_ICON[v]} />
      </section>

      <section aria-labelledby="settings-reset">
        <h3 id="settings-reset" className="sr-only">Reset</h3>
        <ResetDefaults />
      </section>

    </div>
  )
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <SettingsContent />
    </Sheet>
  )
}

/**
 * Puts every preference back to its default, including the house rules new
 * games start with. A game already in progress keeps its rules. Asks first,
 * inline, since it undoes choices the player made on purpose.
 */
function ResetDefaults() {
  const [confirming, setConfirming] = useState(false)
  const updateSettings = useGameStore((s) => s.updateSettings)
  if (!confirming) {
    return (
      <button type="button" className="link-button settings-reset" onClick={() => setConfirming(true)}>
        Reset all settings to defaults
      </button>
    )
  }
  return (
    <div className="settings-reset-confirm" role="group" aria-label="Reset settings">
      <span className="setting-hint">Reset every setting, and the house rules for new games, to the defaults?</span>
      <button type="button" onClick={() => setConfirming(false)}>
        Cancel
      </button>
      <button
        type="button"
        className="primary"
        onClick={() => {
          updateSettings({ ...DEFAULT_SETTINGS })
          setConfirming(false)
        }}
      >
        Reset
      </button>
    </div>
  )
}

/** A self-contained Settings button with its sheet, for screens outside the game. */
export function SettingsButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="tool" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Icon name="gear" />
        <span>Settings</span>
      </button>
      <SettingsSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
