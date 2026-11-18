import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { RulesButton } from './RulesSheet'
import { Sheet } from './Sheet'

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Sheet
        open={open}
        onClose={() => {
          onClose()
          setOpen(false)
        }}
        title="Test sheet"
      >
        <p>Body text</p>
      </Sheet>
    </>
  )
}

const dialog = () => document.querySelector('dialog')!

describe('Sheet', () => {
  it('opens as a labelled dialog and closes from its close button', async () => {
    render(<Harness />)
    expect(dialog().open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('dialog', { name: 'Test sheet' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(dialog().open).toBe(false))
  })

  it('closes on Esc (the cancel event) without letting the browser close it first', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    const cancel = new Event('cancel', { cancelable: true })
    act(() => {
      dialog().dispatchEvent(cancel)
    })
    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a backdrop click, but not on a click inside or a drag that ends outside', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    const body = screen.getByText('Body text')

    fireEvent.pointerDown(body)
    fireEvent.click(body)
    expect(onClose).not.toHaveBeenCalled()

    // Pressed inside, released on the backdrop: the click lands on the dialog itself.
    fireEvent.pointerDown(body)
    fireEvent.click(dialog())
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(dialog())
    fireEvent.click(dialog())
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('Rules', () => {
  it('opens from the Rules button and explains comeback dice', () => {
    render(<RulesButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Rules' }))
    const sheet = screen.getByRole('dialog', { name: 'How to play' })
    expect(sheet).toHaveTextContent('The short version')
    expect(screen.getByRole('heading', { name: 'Comeback dice' })).toBeInTheDocument()
    // Numbers come from the engine: fair odds of a six are 1 in 6.
    expect(sheet).toHaveTextContent("normally it's 17%")
  })
})
