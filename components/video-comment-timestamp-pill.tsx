import { Clock } from "lucide-react"

import { cn } from "@/lib/utils"

import { formatVideoTimestamp } from "@/lib/video-timestamp"

export type VideoCommentTimestampPillProps = {
  seconds: number | null
  className?: string
  emptyLabel?: string
  onClick?: () => void
}

export function VideoCommentTimestampPill({
  seconds,
  className,
  emptyLabel,
  onClick,
}: VideoCommentTimestampPillProps) {
  const hasTime = seconds != null && Number.isFinite(seconds)
  const fallbackEmpty = emptyLabel ?? "00:00"

  const styles = cn(
    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors",
    hasTime
      ? "border-yellow-500/80 bg-yellow-500/10 text-yellow-700 shadow-sm dark:border-yellow-400/70 dark:bg-yellow-400/10 dark:text-yellow-300"
      : "border-dashed border-yellow-500/40 bg-yellow-500/5 text-yellow-700/80 dark:border-yellow-400/35 dark:bg-yellow-400/10 dark:text-yellow-400/80",
    onClick &&
      hasTime &&
      "cursor-pointer hover:bg-yellow-500/15 focus-visible:ring-2 focus-visible:ring-yellow-500/50 focus-visible:outline-none dark:hover:bg-yellow-400/15",
    className
  )

  const label = hasTime ? formatVideoTimestamp(seconds) : fallbackEmpty

  const inner = (
    <>
      <Clock
        className={cn(
          "size-3.5 shrink-0",
          hasTime
            ? "text-yellow-600 dark:text-yellow-400"
            : "text-yellow-600/70 dark:text-yellow-400/70"
        )}
        aria-hidden
      />
      <span className="font-mono tracking-tight">{label}</span>
    </>
  )

  if (onClick && hasTime) {
    return (
      <button
        type="button"
        className={styles}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        aria-label={`Seek video to ${formatVideoTimestamp(seconds)}`}
      >
        {inner}
      </button>
    )
  }

  return (
    <div className={styles} aria-live="polite">
      {inner}
    </div>
  )
}
