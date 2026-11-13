import { useEffect } from 'react'
import { GameScreen } from './components/GameScreen'
import { HostLobby } from './components/HostLobby'
import { JoinScreen } from './components/JoinScreen'
import { SetupScreen } from './components/SetupScreen'
import { useLudoGame } from './hooks/useLudoGame'
import { parseInvite } from './net/invite'
import { useGameStore } from './store/gameStore'
import { useOnlineStore } from './store/onlineStore'

const PROFILE_URL = 'https://github.com/sachinksha'
const REPO_URL = `${PROFILE_URL}/ludo-game`

/**
 * Chooses the screen from the stores. A game in progress always wins, keyed by
 * session so a new game remounts all timing state. Otherwise: the join screen
 * for a guest, the lobby for a host, or setup.
 */
export default function App() {
  const game = useGameStore((s) => s.game)
  const session = useGameStore((s) => s.session)
  const start = useGameStore((s) => s.start)
  const lastConfigs = useGameStore((s) => s.lastConfigs)
  const role = useOnlineStore((s) => s.role)
  const connecting = useOnlineStore((s) => s.connecting)
  const onlineError = useOnlineStore((s) => s.error)
  const startHosting = useOnlineStore((s) => s.startHosting)
  const openInvite = useOnlineStore((s) => s.openInvite)

  // An invite link opens the join screen.
  useEffect(() => {
    const invite = parseInvite(window.location.hash)
    if (invite) openInvite(invite)
  }, [openInvite])

  let screen
  if (game) screen = <LudoSession key={session} />
  else if (role === 'guest') screen = <JoinScreen />
  else if (role === 'host') screen = <HostLobby />
  else
    screen = (
      <SetupScreen
        onStart={(configs, online) => (online ? void startHosting(configs) : start(configs))}
        initial={lastConfigs}
        busy={connecting}
        error={onlineError}
      />
    )

  return (
    <>
      <main className="app">{screen}</main>
      <footer className="site-footer">
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">Source on GitHub</a>
        <span aria-hidden="true">·</span>
        <span>
          Made by <a href={PROFILE_URL} target="_blank" rel="noopener noreferrer">@sachinksha</a>
        </span>
      </footer>
    </>
  )
}

function LudoSession() {
  const ludo = useLudoGame()
  return <GameScreen ludo={ludo} />
}
