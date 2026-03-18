"use client"

import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import type { Video, VideoStatus } from "@/types/video"

const REVIEW_STATUSES: VideoStatus[] = ["MEDICAL_REVIEW", "CONTENT_BRAND_REVIEW"]

/** Prefer queue `tat`; else derive from assignedAt + limit (review stages only). */
export function resolveVideoTat(
  video: Video,
  defaultLimitHours = 24
): VideoTatInput | null {
  const t = video.tat
  if (t?.dueAt && t.limitHours != null && t.limitHours > 0) {
    return { dueAt: t.dueAt, limitHours: t.limitHours }
  }
  if (
    video.assignedAt &&
    REVIEW_STATUSES.includes(video.status) &&
    defaultLimitHours > 0
  ) {
    const start = new Date(video.assignedAt).getTime()
    if (Number.isNaN(start)) return null
    return {
      limitHours: defaultLimitHours,
      dueAt: new Date(start + defaultLimitHours * 3_600_000).toISOString(),
    }
  }
  return null
}

export type VideoTatInput = {
  dueAt: string
  limitHours: number
}

/**
 * TAT progress from queue/detail shape: dueAt + limitHours.
 * Before due: green bar shrinks toward deadline. After due: repeat cycles (default 6h) like script SLA.
 */
export function VideoTatBar({
  tat,
  repeatCycleHours = 6,
  className,
}: {
  tat: VideoTatInput | null | undefined
  /** From GET /api/videos/stats tatConfig.repeatCycleHours */
  repeatCycleHours?: number
  className?: string
}) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const computed = useMemo(() => {
    if (!tat?.dueAt || tat.limitHours == null || tat.limitHours <= 0) return null
    const due = new Date(tat.dueAt).getTime()
    if (Number.isNaN(due)) return null
    const now = Date.now()
    const limitMs = tat.limitHours * 3_600_000
    const isOverdue = now > due

    if (!isOverdue) {
      const remainingMs = Math.max(0, due - now)
      const elapsedMs = limitMs - remainingMs
      const hoursElapsed = Math.max(0, elapsedMs / 3_600_000)
      const remainingPercent = Math.max(0, Math.min(100, (remainingMs / limitMs) * 100))
      return {
        isOverdue: false,
        label: "SLA timer",
        sublabel: `${Math.round(hoursElapsed)}h / ${tat.limitHours}h`,
        widthPercent: remainingPercent,
        barClass: "bg-green-500 dark:bg-green-600",
        ariaMax: tat.limitHours,
        ariaNow: hoursElapsed,
      }
    }

    const cycleMs = Math.max(1, repeatCycleHours) * 3_600_000
    const overdueMs = now - due
    const cycleNumber = Math.floor(overdueMs / cycleMs) + 1
    const msInCycle = overdueMs % cycleMs
    const hoursInCurrentCycle = msInCycle / 3_600_000
    const hoursLeftInCycle = Math.max(0, repeatCycleHours - hoursInCurrentCycle)
    const remainingPercent = Math.max(
      0,
      100 - (hoursInCurrentCycle / repeatCycleHours) * 100
    )
    return {
      isOverdue: true,
      label: "SLA timer",
      sublabel: `${Math.round(hoursLeftInCycle)}h left in cycle`,
      widthPercent: remainingPercent,
      barClass: "bg-destructive",
      ariaMax: repeatCycleHours,
      ariaNow: hoursInCurrentCycle,
      cycleNumber,
    }
  }, [tat, repeatCycleHours, tick])

  if (!computed) return null

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {computed.label}
          {computed.isOverdue && computed.cycleNumber != null && (
            <span className="ml-1">· Cycle {computed.cycleNumber}</span>
          )}
        </span>
        <span className={cn(computed.isOverdue && "font-medium text-destructive")}>
          {computed.sublabel}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(computed.ariaNow * 10) / 10}
        aria-valuemin={0}
        aria-valuemax={computed.ariaMax}
        aria-label={computed.isOverdue ? "Overdue SLA cycle" : "Video review turnaround time"}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", computed.barClass)}
          style={{ width: `${computed.widthPercent}%` }}
        />
      </div>
      {tat && (
        <p className="text-[11px] text-muted-foreground">
          Due {new Date(tat.dueAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}
    </div>
  )
}
