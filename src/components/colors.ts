import type { Color } from '../game/types'

/** Strong colour for tokens, lanes and triangles. */
export const COLOR_HEX: Record<Color, string> = {
  red: '#d62828',
  green: '#2a9d4b',
  yellow: '#f4c20d',
  blue: '#1f6feb',
}

/** Pale tint for yard boxes. */
export const COLOR_LIGHT: Record<Color, string> = {
  red: '#f7c9c9',
  green: '#c8ecd3',
  yellow: '#fbeeb7',
  blue: '#c7dcfb',
}

export const COLOR_NAME: Record<Color, string> = {
  red: 'Red',
  green: 'Green',
  yellow: 'Yellow',
  blue: 'Blue',
}
