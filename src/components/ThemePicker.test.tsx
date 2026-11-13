import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../store/gameStore'
import { applyTheme, isTheme } from '../theme'
import { ThemePicker } from './ThemePicker'

afterEach(() => {
  useGameStore.getState().updateSettings({ theme: 'system' })
})

describe('ThemePicker', () => {
  it('follows the system by default', () => {
    render(<ThemePicker />)
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('forces dark or light, saves the choice, and returns to system', () => {
    render(<ThemePicker />)
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(window.localStorage.getItem('ludo:settings')!)).toMatchObject({ theme: 'dark' })

    fireEvent.click(screen.getByRole('button', { name: 'Light' }))
    expect(document.documentElement.dataset.theme).toBe('light')

    fireEvent.click(screen.getByRole('button', { name: 'System' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
})

describe('theme helpers', () => {
  it('validates stored values', () => {
    expect(isTheme('dark')).toBe(true)
    expect(isTheme('purple')).toBe(false)
    expect(isTheme(undefined)).toBe(false)
  })

  it('sets and clears data-theme on the given element', () => {
    const el = document.createElement('div')
    applyTheme('light', el)
    expect(el.dataset.theme).toBe('light')
    applyTheme('system', el)
    expect(el.dataset.theme).toBeUndefined()
  })
})
