import { useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'

/** Collapsible game log, newest first. Open/closed is remembered across games. */
export function GameLog() {
  const log = useGameStore((s) => s.log)
  const logOpen = useGameStore((s) => s.logOpen)
  const setLogOpen = useGameStore((s) => s.setLogOpen)
  const logRef = useRef<HTMLOListElement>(null)

  // Newest first, so the list starts at the top and scrolls back to it on each new entry.
  const newestFirst = [...log].reverse()
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0
  }, [log.length, logOpen])

  return (
    <section className="log-panel">
      <h2>
        <button
          type="button"
          className="log-toggle"
          aria-expanded={logOpen}
          aria-controls="game-log"
          aria-keyshortcuts="L"
          onClick={() => setLogOpen(!logOpen)}
        >
          <span className={`chevron${logOpen ? ' chevron-open' : ''}`} aria-hidden="true" />
          Game log
          <span className="log-count">{log.length}</span>
        </button>
      </h2>
      {logOpen && (
        <ol id="game-log" className="log" ref={logRef} aria-label="Game log, latest first">
          {newestFirst.length === 0 && <li className="log-empty">No moves yet.</li>}
          {newestFirst.map((entry) => (
            <li key={entry.id}>{entry.text}</li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** Keyboard help (hidden on touch-only devices by CSS). */
export function KeyboardHelp({ undo }: { undo: boolean }) {
  return (
    <section className="log-panel keys-panel">
      <h2>Keyboard</h2>
      <dl className="shortcuts">
        <dt><kbd>Space</kbd></dt><dd>Roll the dice</dd>
        <dt><kbd>1</kbd>–<kbd>4</kbd></dt><dd>Move that piece</dd>
        <dt><kbd>D</kbd></dt><dd>Switch die (several dice)</dd>
        {undo && (
          <>
            <dt><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd></dt><dd>Undo / redo</dd>
          </>
        )}
        <dt><kbd>P</kbd></dt><dd>Pause / resume</dd>
        <dt><kbd>L</kbd></dt><dd>Show / hide game log</dd>
        <dt><kbd>?</kbd></dt><dd>Rules</dd>
        <dt><kbd>S</kbd></dt><dd>Settings</dd>
        <dt><kbd>G</kbd></dt><dd>Game menu (restart, new setup)</dd>
        <dt><kbd>N</kbd></dt><dd>Restart</dd>
      </dl>
    </section>
  )
}
