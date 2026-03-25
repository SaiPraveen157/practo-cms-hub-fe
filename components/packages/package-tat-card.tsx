"use client"

import { Card, CardContent } from "@/components/ui/card"
import type { FinalPackage, PackageTat } from "@/types/package"
import { cn } from "@/lib/utils"

/** Progress bar + labels — same SLA visualization as `ScriptTatBar`. */
function PackageTatBarInner({ tat }: { tat: PackageTat }) {
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
    ? Math.max(
        0,
        100 - (hoursInCurrentCycle / repeatCycleHours) * 100
      )
    : Math.max(0, 100 - (hoursElapsed / tatLimitHours) * 100)

  return (
    <div className="space-y-2 ">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground ">
        <span className="font-medium text-foreground">
          SLA timer
          {isOverdue && cycleNumber != null && (
            <span className="ml-1 font-normal text-muted-foreground">
              · Cycle {cycleNumber}
            </span>
          )}
        </span>
        <span className={cn(isOverdue && "font-medium text-destructive")}>
          {isOverdue
            ? `${hoursLeftInCycle}h left in ${repeatCycleHours}h window`
            : `${hoursElapsed}h / ${tatLimitHours}h`}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
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
            "h-full rounded-full transition-[width] duration-300 bg-green-600 dark:bg-green-600",
            isOverdue ? "bg-destructive" : "bg-primary"
          )}
          style={{ width: `${remainingPercent}%` }}
        />
      </div>
      {tat.cycleNumber > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Escalation cycle {tat.cycleNumber} · {tat.hoursInCurrentCycle}h elapsed
          in current {tat.repeatCycleHours}h repeat window
        </p>
      )}
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
        <PackageTatBarInner tat={tat} />
        <p className="text-xs text-muted-foreground">
          {tat.isOverdue
            ? "This package is past the initial review window. Repeat reminders follow the shorter cycle above."
            : `Initial review window: ${tat.tatLimitHours}h from assignment.`}
        </p>
      </CardContent>
    </Card>
  )
}
