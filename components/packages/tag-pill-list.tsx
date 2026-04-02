"use client"

import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/** Shared class for read-only tag pills (Phase 6 / 7). */
export const TAG_PILL_BADGE_CLASS =
  "rounded-full border-transparent px-3 py-0.5 text-xs font-normal leading-normal sm:py-1 sm:text-sm"

export function parseTagsFromCommaInput(raw: string): string[] {
  return raw
    .split(/[,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

type TagPillListProps = {
  tags: string[] | null | undefined
  className?: string
  /** Applied to the outer `<ul>`. */
  listClassName?: string
  /** When there are no tags after trimming. */
  emptyLabel?: ReactNode
}

/**
 * Read-only tags as pill-shaped badges (final package + language packages).
 */
export function TagPillList({
  tags,
  className,
  listClassName,
  emptyLabel,
}: TagPillListProps) {
  const list = (tags ?? []).map((t) => String(t).trim()).filter(Boolean)
  if (list.length === 0) {
    if (emptyLabel !== undefined) {
      return <div className={className}>{emptyLabel}</div>
    }
    return (
      <p
        className={cn("text-xs text-muted-foreground sm:text-sm", className)}
        aria-hidden
      >
        —
      </p>
    )
  }
  return (
    <ul
      className={cn("flex list-none flex-wrap gap-2", listClassName, className)}
      aria-label="Tags"
    >
      {list.map((t, i) => (
        <li key={`${t}-${i}`}>
          <Badge variant="secondary" className={TAG_PILL_BADGE_CLASS}>
            {t}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
