import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { applyTheme, THEMES, type Theme } from '../theme'
import { Icon, type IconName } from './Icons'

const LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const ICON: Record<Theme, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' }

/**
 * System / Light / Dark switch. Lives in the footer so it is on every screen.
 * Also keeps <html data-theme> in sync with the stored setting.
 */
export function ThemePicker() {
  const theme = useGameStore((s) => s.settings.theme)
  const updateSettings = useGameStore((s) => s.updateSettings)

  useEffect(() => applyTheme(theme), [theme])

  return (
    <span className="theme-picker" role="group" aria-labelledby="theme-label">
      <span id="theme-label">Theme</span>
      <span className="theme-options">
        {THEMES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={theme === t}
            title={t === 'system' ? 'Match your device’s light or dark setting' : `Always use the ${LABEL[t].toLowerCase()} theme`}
            onClick={() => updateSettings({ theme: t })}
          >
            <Icon name={ICON[t]} size={14} />
            {LABEL[t]}
          </button>
        ))}
      </span>
    </span>
  )
}
