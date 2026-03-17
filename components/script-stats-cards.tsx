"use client"

import { Card, CardContent } from "@/components/ui/card"
import type { ScriptStatsResponse } from "@/types/script"
import { AlertCircle, CheckCircle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

export function ScriptStatsCards({
  stats,
  title = "Review Queue",
  subtitle = "Multi-stage content approval workflow",
}: {
  stats: ScriptStatsResponse | null
  title?: string
  subtitle?: string
}) {
  if (!stats) return null

  const cards = [
    {
      label: "Pending Review",
      value: stats.pendingReview,
      icon: Clock,
      borderClass: "border-l-amber-500",
      iconClass: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "High Priority",
      value: stats.overdueCount,
      icon: AlertCircle,
      borderClass: "border-l-red-500",
      iconClass: "text-red-600 dark:text-red-400",
    },
    {
      label: "Reviewed Today",
      value: stats.reviewedToday,
      icon: CheckCircle,
      borderClass: "border-l-green-500",
      iconClass: "text-green-600 dark:text-green-400",
    },
  ]

  return (
    <section className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map(({ label, value, icon: Icon, borderClass, iconClass }) => (
          <Card
            key={label}
            className={cn("border-l-4 bg-card", borderClass)}
          >
            <CardContent className="flex flex-row items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
                  {value}
                </p>
              </div>
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full bg-muted",
                  iconClass
                )}
              >
                <Icon className="size-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
