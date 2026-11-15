import { Icon, type IconName } from './Icons'

/** Toolbar button with an icon and a text label. */
export function ToolButton({
  icon,
  label,
  onClick,
  disabled,
  pressed,
  shortcut,
  shortcutLabel,
}: {
  icon: IconName
  label: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  shortcut?: string
  shortcutLabel?: string
}) {
  return (
    <button
      type="button"
      className="tool"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      // The visible label is hidden on phones (icon only); keep the name the label, not the tooltip.
      aria-label={label}
      aria-keyshortcuts={shortcut}
      title={shortcutLabel ? `${label} (${shortcutLabel})` : label}
    >
      <Icon name={icon} />
      <span className="tool-label">{label}</span>
    </button>
  )
}
