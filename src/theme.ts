/**
 * Colour theme. "system" follows the operating system's light/dark setting
 * (via the prefers-color-scheme media query in index.css); "light" and "dark"
 * override it. The choice is stored with the other settings ('ludo:settings').
 *
 * index.html applies the saved theme with a tiny inline script before the page
 * first paints, so a dark-mode player never sees a light flash. This module
 * keeps it in sync afterwards.
 */
export type Theme = 'system' | 'light' | 'dark'

export const THEMES: readonly Theme[] = ['system', 'light', 'dark']

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

/** Sets or clears `data-theme` on <html>; CSS does the rest. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
}
