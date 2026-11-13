/** Small inline SVG icons. They use currentColor so they follow button text colour. */
export type IconName = 'undo' | 'redo' | 'pause' | 'play' | 'speaker' | 'gear' | 'restart' | 'list' | 'clock' | 'dice' | 'robot' | 'forward' | 'sun' | 'moon' | 'monitor'

const PATHS: Record<IconName, string> = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  play: 'M8 5.5v13l10.5-6.5z',
  speaker: 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8 3.5-2.1-.6a6.8 6.8 0 0 0-.6-1.5l1.1-1.9-1.9-1.9-1.9 1.1a6.8 6.8 0 0 0-1.5-.6L12 4l-2.1 2.1a6.8 6.8 0 0 0-1.5.6L6.5 5.6 4.6 7.5l1.1 1.9a6.8 6.8 0 0 0-.6 1.5L3 12l2.1.6c.1.5.3 1 .6 1.5l-1.1 1.9 1.9 1.9 1.9-1.1c.5.3 1 .5 1.5.6L12 20l.6-2.1c.5-.1 1-.3 1.5-.6l1.9 1.1 1.9-1.9-1.1-1.9c.3-.5.5-1 .6-1.5z',
  restart: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  monitor: 'M4 5h16v11H4zM9 20h6M12 16v4',
  forward: 'M4.5 6.5 11 12l-6.5 5.5zM12.5 6.5 19 12l-6.5 5.5z',
  robot: 'M12 3.5v3M7 6.5h10A2.5 2.5 0 0 1 19.5 9v7a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 16V9A2.5 2.5 0 0 1 7 6.5zM9.5 11.5h.01M14.5 11.5h.01M9.5 15h5',
  dice: 'M6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11A2.5 2.5 0 0 1 6.5 4zM8.5 8.5h.01M15.5 15.5h.01M12 12h.01',
}

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === 'pause' || name === 'play' || name === 'speaker' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={name === 'pause' || name === 'play' ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
