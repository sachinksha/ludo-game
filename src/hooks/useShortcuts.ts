import { useEffect, useRef } from 'react'

/**
 * Keyboard shortcuts as a map from key to handler. Keys are lower-case single
 * characters or KeyboardEvent.key names ("ArrowLeft", "Escape", " "). Chords
 * with Ctrl (or Cmd on a Mac) are written "mod+z" or "mod+shift+z"; any chord
 * without a handler keeps its normal browser behaviour.
 *
 * Ignored while typing in a field, with Alt held, or when `enabled` is false
 * (a dialog is open and handles its own keys). A handler returns false when it
 * did nothing, so the key keeps its normal behaviour. Held keys do not repeat,
 * except the ones listed in `repeatable`.
 */
export function useShortcuts(
  handlers: Record<string, () => boolean | void>,
  enabled: boolean,
  repeatable: readonly string[] = ['ArrowLeft', 'ArrowRight'],
): void {
  // Latest handlers, so the listener is attached once and never goes stale.
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      const plain = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const key = e.ctrlKey || e.metaKey ? `mod+${e.shiftKey ? 'shift+' : ''}${plain}` : plain
      if (e.repeat && !repeatable.includes(key)) return
      const handler = ref.current[key]
      if (!handler) return
      if (handler() !== false) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, repeatable])
}

/** True on touch-only devices, where keyboard hints make no sense. */
export const IS_TOUCH =
  typeof window !== 'undefined' && window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches === true
