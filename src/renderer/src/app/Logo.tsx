import wordmark from '@/assets/wordmark.svg?raw'
import clsx from 'clsx'

/** The Wordelia wordmark. The caret blinks when `blink` is on. */
export function Logo({ height = 16, blink = false, className }: { height?: number; blink?: boolean; className?: string }): React.JSX.Element {
  return (
    <span
      className={clsx('logo', blink && 'logo-blink', className)}
      style={{ height }}
      role="img"
      aria-label="Wordelia"
      dangerouslySetInnerHTML={{ __html: wordmark }}
    />
  )
}
