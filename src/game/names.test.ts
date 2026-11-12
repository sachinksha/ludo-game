import { describe, expect, it } from 'vitest'
import { validateNames } from './names'

describe('validateNames', () => {
  it('accepts distinct, non-blank names', () => {
    expect(
      validateNames([
        { color: 'red', kind: 'human', name: 'Asha' },
        { color: 'yellow', kind: 'human', name: 'Ben' },
      ]),
    ).toEqual({})
  })

  it('rejects a blank or whitespace-only human name', () => {
    expect(validateNames([{ color: 'red', kind: 'human', name: '   ' }])).toEqual({ red: 'Name cannot be blank.' })
  })

  it('rejects duplicates, ignoring case and surrounding spaces, including bot names', () => {
    const errors = validateNames([
      { color: 'red', kind: 'human', name: 'asha ' },
      { color: 'green', kind: 'human', name: 'Asha' },
      { color: 'yellow', kind: 'human', name: 'bot 1' },
      { color: 'blue', kind: 'bot', name: 'Bot 1' },
    ])
    expect(errors).toEqual({
      red: 'Name is already taken.',
      green: 'Name is already taken.',
      yellow: 'Name is already taken.',
    })
  })
})
