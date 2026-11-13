import { LANE_ENTRY_INDEX, SAFE_INDICES, START_INDEX } from '../game/board'
import { LANE, RING, YARD_ORIGIN, YARD_SLOTS, placeTokens, tokenCentre, yardSlotCentre, type Cell } from '../game/layout'
import { pathSteps } from '../game/rules'
import type { Color, Move, Player } from '../game/types'
import { COLOR_HEX, COLOR_LIGHT, COLOR_NAME } from './colors'

interface BoardProps {
  players: Player[]
  /** Seat that is currently to play. Its base is highlighted. */
  activeColor: Color
  /** Tokens the current human may move. They get a halo and can be clicked. */
  clickable: { color: Color; tokenId: number }[]
  onPick: (tokenId: number) => void
  /** Seat whose tokens show their number (1 to 4) as a keyboard hint, or null. */
  labelColor?: Color | null
  /** The most recent move, drawn as a faint trail so everyone can follow what happened. */
  lastMove?: { color: Color; move: Move } | null
}

const COLOURS: Color[] = ['red', 'green', 'yellow', 'blue']

/** Centre triangles, one per colour, pointing into the home area. */
const HOME_TRIANGLES: { color: Color; points: string }[] = [
  { color: 'green', points: '6,6 9,6 7.5,7.5' },
  { color: 'yellow', points: '9,6 9,9 7.5,7.5' },
  { color: 'blue', points: '9,9 6,9 7.5,7.5' },
  { color: 'red', points: '6,9 6,6 7.5,7.5' },
]

/** Five-point star centred on (cx, cy), used for safe squares. */
function starPoints(cx: number, cy: number, outer = 0.36, inner = 0.15): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (Math.PI / 5) * i - Math.PI / 2
    pts.push(`${(cx + r * Math.cos(a)).toFixed(3)},${(cy + r * Math.sin(a)).toFixed(3)}`)
  }
  return pts.join(' ')
}

/** Triangle on a lane-entry square, pointing along the lane toward the board centre. */
function arrowPoints(cell: Cell): string {
  const cx = cell[0] + 0.5
  const cy = cell[1] + 0.5
  const dx = 7.5 - cx
  const dy = 7.5 - cy
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const px = -uy
  const py = ux
  const tip = [cx + ux * 0.34, cy + uy * 0.34]
  const b1 = [cx - ux * 0.2 + px * 0.22, cy - uy * 0.2 + py * 0.22]
  const b2 = [cx - ux * 0.2 - px * 0.22, cy - uy * 0.2 - py * 0.22]
  return [tip, b1, b2].map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ')
}

/**
 * A faint line along the squares the last move passed through, in the mover's
 * colour, with a ring on the square it left. A dark casing under the line keeps
 * it visible on the mover's own coloured lane.
 */
function LastMoveTrail({ color, move }: { color: Color; move: Move }) {
  const at = (s: Move['from']) => tokenCentre(color, move.tokenId, s)
  const points = [move.from, ...pathSteps(color, move.from, move.to)].map((s) => at(s).map((n) => n.toFixed(3)).join(',')).join(' ')
  const [fx, fy] = at(move.from)
  return (
    <g className="last-move-trail" style={{ ['--arm' as string]: COLOR_HEX[color] }} aria-hidden="true">
      <polyline className="last-move-casing" points={points} />
      <polyline className="last-move" points={points} />
      <circle className="last-move-casing" cx={fx} cy={fy} r={0.4} />
      <circle className="last-move-from" cx={fx} cy={fy} r={0.4} />
    </g>
  )
}

export function Board({ players, activeColor, clickable, onPick, labelColor = null, lastMove = null }: BoardProps) {
  const clickableSet = new Set(clickable.map((c) => `${c.color}-${c.tokenId}`))

  return (
    <svg className="board" viewBox="0 0 15 15" role="img" aria-label="Ludo board" style={{ gridArea: 'board' }}>
      <rect className="sq" x={0} y={0} width={15} height={15} fill="#fff" />

      {/* Coloured bases with a white inner box and empty slots. */}
      {COLOURS.map((color) => {
        const [ox, oy] = YARD_ORIGIN[color]
        return (
          <g key={`base-${color}`}>
            <rect x={ox} y={oy} width={6} height={6} fill={COLOR_HEX[color]} stroke="#222" strokeWidth={0.04} />
            <rect className="sq" x={ox + 0.6} y={oy + 0.6} width={4.8} height={4.8} rx={0.5} fill="#fff" stroke="#222" strokeWidth={0.03} />
            {YARD_SLOTS.map((_, slot) => {
              const [sx, sy] = yardSlotCentre(color, slot)
              return <circle key={slot} cx={sx} cy={sy} r={0.46} fill={COLOR_LIGHT[color]} stroke={COLOR_HEX[color]} strokeWidth={0.05} />
            })}
            {color === activeColor && (
              <rect className="base-active" x={ox + 0.05} y={oy + 0.05} width={5.9} height={5.9} fill="none" stroke="#ffd60a" strokeWidth={0.12} />
            )}
          </g>
        )
      })}

      {/* Shared loop: white squares with thin grid lines, coloured starts, stars, and arrows where each lane begins. */}
      {RING.map((cell, i) => {
        const start = COLOURS.find((c) => START_INDEX[c] === i)
        const entry = COLOURS.find((c) => LANE_ENTRY_INDEX[c] === i)
        const isSafe = SAFE_INDICES.has(i)
        return (
          <g key={`ring-${i}`}>
            <rect className={start ? undefined : 'sq'} x={cell[0]} y={cell[1]} width={1} height={1} fill={start ? COLOR_HEX[start] : '#fff'} stroke="#222" strokeWidth={0.035} />
            {entry && <polygon points={arrowPoints(cell)} fill={COLOR_HEX[entry]} stroke="#222" strokeWidth={0.02} />}
            {isSafe && !start && (
              <polygon className="sq" points={starPoints(cell[0] + 0.5, cell[1] + 0.5)} fill="#fff" stroke="#222" strokeWidth={0.03} />
            )}
          </g>
        )
      })}

      {/* Coloured home lanes leading into the centre. */}
      {COLOURS.map((color) =>
        LANE[color].map((cell, step) => (
          <rect key={`lane-${color}-${step}`} x={cell[0]} y={cell[1]} width={1} height={1} fill={COLOR_HEX[color]} stroke="#222" strokeWidth={0.035} />
        )),
      )}

      {/* Centre home triangles. */}
      {HOME_TRIANGLES.map((t) => (
        <polygon key={`tri-${t.color}`} points={t.points} fill={COLOR_HEX[t.color]} stroke="#222" strokeWidth={0.03} />
      ))}

      {lastMove && <LastMoveTrail {...lastMove} />}

      {/* Tokens. Tokens on the same square are spread out, and clickable tokens are drawn last so they are never hidden. */}
      {/* Later elements paint on top. Non-clickable tokens go first, so clickable ones end up on top. */}
      {[...placeTokens(players)]
        .sort((a, b) => Number(clickableSet.has(`${a.color}-${a.tokenId}`)) - Number(clickableSet.has(`${b.color}-${b.tokenId}`)))
        .map(({ color, tokenId, cx, cy, r }) => {
          const isClickable = clickableSet.has(`${color}-${tokenId}`)
          const label = `${COLOR_NAME[color]} token ${tokenId + 1}`
          return (
            <g key={`token-${color}-${tokenId}`}>
              {isClickable && <circle className="halo" cx={cx} cy={cy} r={r + 0.14} fill="none" stroke="#111" strokeWidth={0.07} />}
              {isClickable && (
                // Larger invisible tap target, so small tokens are easy to hit on a phone.
                <circle className="token-hit" cx={cx} cy={cy} r={r + 0.16} fill="transparent" aria-hidden="true" onClick={() => onPick(tokenId)} />
              )}
              <circle
                data-testid={`token-${color}-${tokenId}`}
                className={`token${isClickable ? ' token-clickable' : ''}`}
                cx={cx}
                cy={cy}
                r={r}
                fill={COLOR_HEX[color]}
                stroke="#1a1a1a"
                strokeWidth={0.04}
                role={isClickable ? 'button' : undefined}
                aria-label={isClickable ? `Move ${label}` : label}
                tabIndex={isClickable ? 0 : -1}
                onClick={
                  isClickable
                    ? (e) => {
                        // Drop focus so no focus ring lingers after the move.
                        ;(e.currentTarget as unknown as SVGElement).blur()
                        onPick(tokenId)
                      }
                    : undefined
                }
                onKeyDown={
                  isClickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onPick(tokenId)
                        }
                      }
                    : undefined
                }
              />
              <circle className="token-shine" cx={cx - 0.08 * (r / 0.34)} cy={cy - 0.1 * (r / 0.34)} r={0.1 * (r / 0.34)} fill="#fff" opacity={0.45} pointerEvents="none" />
              {color === labelColor && (
                // Token numbers follow the token id, so each piece keeps its number all game.
                <text
                  className={`token-label${isClickable ? '' : ' token-label-idle'}`}
                  x={cx}
                  y={cy}
                  fontSize={r * 1.3}
                  textAnchor="middle"
                  dominantBaseline="central"
                  pointerEvents="none"
                  aria-hidden="true"
                >
                  {tokenId + 1}
                </text>
              )}
            </g>
          )
        })}
    </svg>
  )
}
