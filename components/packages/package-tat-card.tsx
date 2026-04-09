"use client"

import { Card, CardContent } from "@/components/ui/card"
import type { FinalPackage, PackageTat } from "@/types/package"
import { cn } from "@/lib/utils"

/** Progress bar + labels — same SLA visualization as `ScriptTatBar` / Phase 5 video TAT. */
export function PackageTatProgress({
  tat,
  compact,
  className,
  showFooterNote,
}: {
  tat: PackageTat
  compact?: boolean
  className?: string
  /** Extra line under the bar (package card only). */
  showFooterNote?: boolean
}) {
  const {
    hoursElapsed,
    tatLimitHours,
    isOverdue,
    repeatCycleHours,
    hoursInCurrentCycle,
    cycleNumber,
  } = tat

  const hoursLeftInCycle = Math.max(0, repeatCycleHours - hoursInCurrentCycle)

  const remainingPercent = isOverdue
    ? Math.max(0, 100 - (hoursInCurrentCycle / repeatCycleHours) * 100)
    : Math.max(0, 100 - (hoursElapsed / tatLimitHours) * 100)

  const barH = compact ? "h-1.5" : "h-2"

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          SLA Timer
          {isOverdue && cycleNumber != null && (
            <span className="ml-1 font-normal text-muted-foreground">
              · Cycle {cycleNumber}
            </span>
          )}
        </span>
        <span className={cn(isOverdue && "font-medium text-destructive")}>
          {isOverdue
            ? `${Math.round(hoursLeftInCycle)}h left in ${repeatCycleHours}h window`
            : `${Math.round(hoursElapsed)}h / ${tatLimitHours}h`}
        </span>
      </div>
      <div
        className={cn("w-full overflow-hidden rounded-full bg-muted", barH)}
        role="progressbar"
        aria-valuenow={isOverdue ? hoursInCurrentCycle : hoursElapsed}
        aria-valuemin={0}
        aria-valuemax={isOverdue ? repeatCycleHours : tatLimitHours}
        aria-label={
          isOverdue
            ? `Overdue SLA cycle ${cycleNumber}; ${hoursLeftInCycle}h remaining in ${repeatCycleHours}h window`
            : `TAT ${hoursElapsed} of ${tatLimitHours} hours`
        }
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            isOverdue
              ? "bg-red-600 dark:bg-red-600"
              : "bg-green-600 dark:bg-green-600"
          )}
          style={{ width: `${remainingPercent}%` }}
        />
      </div>
      {tat.cycleNumber > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Escalation cycle {tat.cycleNumber} ·{" "}
          {Math.round(tat.hoursInCurrentCycle * 10) / 10}h elapsed in current{" "}
          {tat.repeatCycleHours}h repeat window
        </p>
      )}
      {showFooterNote ? (
        <p className="text-xs text-muted-foreground">
          {tat.isOverdue
            ? "Past the initial review window. Repeat reminders follow the shorter cycle above."
            : `Initial review window: ${tat.tatLimitHours}h from assignment.`}
        </p>
      ) : null}
    </div>
  )
}

export function PackageTatCard({ pkg }: { pkg: FinalPackage }) {
  const tat = pkg.tat
  if (!tat) return null

  return (
    <Card
      className={cn(
        tat.isOverdue
          ? "border-destructive/40 bg-destructive/5"
          : "border-border"
      )}
    >
      <CardContent className="space-y-3 py-4">
        <PackageTatProgress tat={tat} showFooterNote />
      </CardContent>
    </Card>
  )
}
