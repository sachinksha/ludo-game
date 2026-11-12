import { afterEach, describe, expect, it } from 'vitest'
import { isMuted, playSound, setMuted } from './sfx'

afterEach(() => setMuted(false))

describe('sound effects', () => {
  it('tracks the mute setting', () => {
    expect(isMuted()).toBe(false)
    setMuted(true)
    expect(isMuted()).toBe(true)
  })

  it('does not throw when Web Audio is unavailable (as in jsdom)', () => {
    expect(() => playSound('roll')).not.toThrow()
    expect(() => playSound('win')).not.toThrow()
    setMuted(true)
    expect(() => playSound('capture')).not.toThrow()
  })
})
