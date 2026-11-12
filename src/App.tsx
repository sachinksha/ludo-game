import { GameScreen } from './components/GameScreen'
import { SetupScreen } from './components/SetupScreen'
import { useLudoGame } from './hooks/useLudoGame'
import { useGameStore } from './store/gameStore'

const PROFILE_URL = 'https://github.com/sachinksha'
const REPO_URL = `${PROFILE_URL}/ludo-game`

/**
 * Chooses the screen from the store. With no game, show setup. With a game,
 * render it keyed by session, so a new game remounts all timing state.
 */
export default function App() {
  const game = useGameStore((s) => s.game)
  const session = useGameStore((s) => s.session)
  const start = useGameStore((s) => s.start)
  const lastConfigs = useGameStore((s) => s.lastConfigs)

  return (
    <>
      <main className="app">
        {game ? <LudoSession key={session} /> : <SetupScreen onStart={start} initial={lastConfigs} />}
      </main>
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
