"use client"

import { cn } from "@/lib/utils"
import type { Script, ScriptStatus } from "@/types/script"

/** Statuses where TAT is tracked (script is in a review/waiting stage). */
const TAT_RELEVANT_STATUSES: ScriptStatus[] = [
  "CONTENT_BRAND_REVIEW",
  "CONTENT_BRAND_APPROVAL",
  "MEDICAL_REVIEW",
  "CONTENT_APPROVER_REVIEW",
  "AGENCY_PRODUCTION",
]

export function ScriptTatBar({ script }: { script: Script }) {
  const tat = script.tat
  const status = script.status

  if (!tat || !TAT_RELEVANT_STATUSES.includes(status)) return null

  const {
    hoursElapsed,
    tatLimitHours,
    isOverdue,
    repeatCycleHours,
    hoursInCurrentCycle,
    cycleNumber,
  } = tat

  const hoursLeftInCycle = Math.max(0, repeatCycleHours - hoursInCurrentCycle)

  // Reverse progress: full at start, decreases as time elapses.
  // Not overdue: show remaining time in initial 24h window.
  // Overdue: show remaining time in current 6h repeat cycle (resets each cycle).
  const remainingPercent = isOverdue
    ? Math.max(
        0,
        100 - (hoursInCurrentCycle / repeatCycleHours) * 100
      )
    : Math.max(0, 100 - (hoursElapsed / tatLimitHours) * 100)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          SLA Timer
          {isOverdue && cycleNumber != null && (
            <span className="ml-1">· Cycle {cycleNumber}</span>
          )}
        </span>
        <span className={cn(isOverdue && "font-medium text-destructive")}>
          {isOverdue
            ? `${hoursLeftInCycle}h remaining`
            : `${hoursElapsed}h / ${tatLimitHours}h`}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={isOverdue ? hoursInCurrentCycle : hoursElapsed}
        aria-valuemin={0}
        aria-valuemax={isOverdue ? repeatCycleHours : tatLimitHours}
        aria-label={
          isOverdue
            ? `Cycle ${cycleNumber}; ${hoursLeftInCycle}h remaining in ${repeatCycleHours}h window`
            : `Turnaround time ${hoursElapsed} of ${tatLimitHours} hours`
        }
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            isOverdue ? "bg-destructive" : "bg-green-500 dark:bg-green-600"
          )}
          style={{ width: `${remainingPercent}%` }}
        />
      </div>
    </div>
  )
}
