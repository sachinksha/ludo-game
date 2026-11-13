import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  /** Style of the confirm button. Defaults to "danger" for destructive choices. */
  confirmClass?: string
  onConfirm: () => void
  onCancel: () => void
}

/** Modal that asks the player to confirm a choice. Focus starts on "cancel" (the safe choice). */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, confirmClass = 'danger', onConfirm, onCancel }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="overlay" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
      <div className="overlay-card">
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        <div className="overlay-actions">
          <button type="button" ref={cancelRef} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={confirmClass} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
