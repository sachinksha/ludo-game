import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatClock, useGameClock } from './useGameClock'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('formatClock', () => {
  it('formats minutes and seconds, adding hours past an hour', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65_400)).toBe('1:05')
    expect(formatClock(3_725_000)).toBe('1:02:05')
  })
})

describe('useGameClock', () => {
  it('counts while running and freezes while paused', () => {
    const { result, rerender } = renderHook(({ running }) => useGameClock(running), { initialProps: { running: true } })
    act(() => vi.advanceTimersByTime(5000))
    expect(Math.round(result.current / 1000)).toBe(5)

    rerender({ running: false })
    act(() => vi.advanceTimersByTime(10_000))
    expect(Math.round(result.current / 1000)).toBe(5)

    rerender({ running: true })
    act(() => vi.advanceTimersByTime(3000))
    expect(Math.round(result.current / 1000)).toBe(8)
  })
})
