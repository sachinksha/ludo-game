import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from 'react'
import { Icon } from './Icons'

/** Screens this narrow get a bottom sheet; wider ones get a centred dialog. Keep in sync with index.css. */
export const SHEET_QUERY = '(max-width: 700px)'

/** A downward drag past this share of the sheet's height closes it on release. */
const CLOSE_DISTANCE = 0.25
/** A quick downward flick (pixels per millisecond) closes it even if it moved only a little. */
const CLOSE_VELOCITY = 0.5
/** A flick must still travel this far, so a tap on the handle never closes the sheet. */
const MIN_FLICK_PX = 24

interface SheetProps {
  open: boolean
  /** Asks the owner to close the sheet. The sheet animates out once `open` turns false. */
  onClose: () => void
  title: string
  children: ReactNode
}

interface Drag {
  pointerId: number
  startY: number
  startTime: number
  dy: number
}

/** Resolves once every CSS animation running on `el` has finished (at once if there are none). */
function animationsDone(el: HTMLElement): Promise<unknown> {
  // getAnimations is missing in jsdom and very old browsers: treat that as "nothing to wait for".
  const running = typeof el.getAnimations === 'function' ? el.getAnimations({ subtree: true }) : []
  return Promise.allSettled(running.map((a) => a.finished))
}

/**
 * A modal panel built on the native <dialog> element. On phones it is a bottom
 * sheet that slides up and can be swiped down to close; on wider screens it is
 * a centred dialog.
 *
 * The browser does the hard parts: `showModal()` puts the dialog in the top
 * layer, makes the rest of the page inert (no focus, clicks or screen reader
 * access behind it), moves focus inside and gives it back to the opener on
 * close, and turns Esc into a `cancel` event. This component adds the exit
 * animation, backdrop taps, swipe to close and scroll containment.
 *
 * The owner keeps `open` in its own state. Every way of closing (button, Esc,
 * backdrop, swipe) calls `onClose`, so that state is the single source of truth.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const drag = useRef<Drag | null>(null)
  /** Whether the current click began on the backdrop (see onClick). */
  const pressedBackdrop = useRef(false)
  const titleId = useId()

  // Keeps the native dialog in step with `open`, animating out before closing.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      delete dialog.dataset.closing
      dialog.style.removeProperty('--drag-y')
      if (dialog.open) return
      // jsdom has no showModal; the `open` attribute alone is enough for tests.
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
      return
    }
    if (!dialog.open) return
    let cancelled = false
    dialog.dataset.closing = ''
    void animationsDone(dialog).then(() => {
      // Reopened while the exit animation ran: stay open.
      if (cancelled) return
      delete dialog.dataset.closing
      dialog.style.removeProperty('--drag-y')
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    })
    return () => {
      cancelled = true
    }
  }, [open])

  // Unmounting while open (say, the game ends) must not leave the page inert.
  useEffect(() => {
    const dialog = dialogRef.current
    return () => {
      if (dialog?.open && typeof dialog.close === 'function') dialog.close()
    }
  }, [])

  /** Swipe to close. Only the handle and header start a drag, so the body still scrolls normally. */
  const onDragStart = (e: PointerEvent<HTMLElement>) => {
    if (!window.matchMedia?.(SHEET_QUERY).matches || e.button !== 0) return
    // Taps on the close button are clicks, not drags.
    if ((e.target as HTMLElement).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { pointerId: e.pointerId, startY: e.clientY, startTime: e.timeStamp, dy: 0 }
    dialogRef.current!.dataset.dragging = ''
  }

  const onDragMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    // Follows the finger downward only. Written straight to the element:
    // a re-render on every pointer move would be wasted work.
    d.dy = Math.max(0, e.clientY - d.startY)
    dialogRef.current!.style.setProperty('--drag-y', `${d.dy}px`)
  }

  const onDragEnd = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    const dialog = dialogRef.current!
    delete dialog.dataset.dragging
    const velocity = d.dy / Math.max(1, e.timeStamp - d.startTime)
    const farEnough = d.dy > dialog.offsetHeight * CLOSE_DISTANCE
    const flicked = velocity > CLOSE_VELOCITY && d.dy > MIN_FLICK_PX
    if (e.type === 'pointerup' && (farEnough || flicked)) {
      // Keep --drag-y: the exit animation starts from where the finger let go.
      onClose()
    } else {
      // Snap back (the transition in CSS animates this).
      dialog.style.removeProperty('--drag-y')
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Esc: keep the dialog open long enough to animate out.
        e.preventDefault()
        onClose()
      }}
      onClose={() => {
        // Closed by the browser some other way: tell the owner.
        if (open) onClose()
      }}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        // The backdrop belongs to the <dialog> itself; its content fills the
        // dialog, so a click whose target is the dialog was on the backdrop.
        // It must also have started there: selecting text inside and releasing
        // outside should not close it.
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose()
        pressedBackdrop.current = false
      }}
    >
      <div className="sheet-panel">
        <header
          className="sheet-header"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <span className="sheet-handle" aria-hidden="true" />
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </dialog>
  )
}
