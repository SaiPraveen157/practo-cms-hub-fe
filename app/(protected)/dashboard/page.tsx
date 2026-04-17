"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  BarChart3,
  FileText,
  Film,
  Package,
  Users,
} from "lucide-react"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import {
  AdminPageHeader,
  AdminSectionTitle,
} from "@/components/admin/admin-page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getAdminOverview, getAdminOverdue } from "@/lib/admin-api"
import { useAuthStore } from "@/store"
import type { AdminOverviewResponse, AdminOverdueItem } from "@/types/admin"
import { cn } from "@/lib/utils"

function StatCard({
  label,
  value,
  hint,
  hintClass,
  icon: Icon,
  borderClass,
  iconClass,
}: {
  label: string
  value: string | number
  hint?: string
  hintClass?: string
  icon: React.ComponentType<{ className?: string }>
  borderClass: string
  iconClass: string
}) {
  return (
    <Card className={cn("border-l-4 bg-card", borderClass)}>
      <CardContent className="flex flex-row items-center justify-between gap-4 p-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums tracking-tight">
            {value}
          </p>
          {hint ? (
            <p className={cn("text-xs font-medium", hintClass)}>{hint}</p>
          ) : null}
        </div>
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full bg-muted",
            iconClass
          )}
          aria-hidden
        >
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function buildStats(overview: AdminOverviewResponse) {
  const v = overview.videos
  const videoTotal =
    (v?.firstLineUp?.total ?? 0) + (v?.firstCut?.total ?? 0)
  const videoOverdue =
    (v?.firstLineUp?.overdue ?? 0) + (v?.firstCut?.overdue ?? 0)
  const pkgTotal =
    (overview.packages?.total ?? 0) +
    (overview.languagePackages?.total ?? 0)

  return [
    {
      label: "Scripts",
      value: overview.scripts?.total ?? 0,
      hint:
        (overview.scripts?.overdue ?? 0) > 0
          ? `${overview.scripts.overdue} overdue`
          : "In pipeline",
      hintClass:
        (overview.scripts?.overdue ?? 0) > 0
          ? "text-destructive"
          : "text-muted-foreground",
      icon: FileText,
      borderClass: "border-l-chart-2",
      iconClass: "text-chart-2",
    },
    {
      label: "Videos (FLU + FC)",
      value: videoTotal,
      hint:
        videoOverdue > 0
          ? `${videoOverdue} overdue`
          : "First line up & first cut",
      hintClass:
        videoOverdue > 0 ? "text-destructive" : "text-muted-foreground",
      icon: Film,
      borderClass: "border-l-chart-3",
      iconClass: "text-chart-3",
    },
    {
      label: "Packages",
      value: pkgTotal,
      hint: "Final + language",
      hintClass: "text-muted-foreground",
      icon: Package,
      borderClass: "border-l-chart-4",
      iconClass: "text-chart-4",
    },
    {
      label: "Team",
      value: overview.users?.active ?? 0,
      hint: `${overview.activity?.reviewsToday ?? 0} reviews today`,
      hintClass: "text-emerald-600 dark:text-emerald-400",
      icon: Users,
      borderClass: "border-l-green-500",
      iconClass: "text-green-600 dark:text-green-400",
    },
  ] as const
}

export default function DashboardPage() {
  const token = useAuthStore((s) => s.token)
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null)
  const [overdueItems, setOverdueItems] = useState<AdminOverdueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [ov, od] = await Promise.all([
        getAdminOverview(token),
        getAdminOverdue(token),
      ])
      setOverview(ov)
      setOverdueItems(od.items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard")
      setOverview(null)
      setOverdueItems([])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const stats = overview ? buildStats(overview) : null
  const overdueTotal = overview?.overdue?.total ?? 0

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <AdminPageHeader
            title="Dashboard"
            description="Operational overview — scripts, videos, packages, and team activity."
          />
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <Link href="/content-library">Content library</Link>
          </Button>
        </div>

        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-2 h-8 w-16" />
                  <Skeleton className="mt-2 h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : stats ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((s) => (
              <StatCard key={s.label} {...s} />
            ))}
          </section>
        ) : null}

        {overview && !loading && overview.videos && (
          <section className="space-y-3">
            <AdminSectionTitle>Video pipeline (Phases 4–5)</AdminSectionTitle>
            <p className="text-sm text-muted-foreground">
              First line up and first cut cuts live here. Open the content library
              filtered by phase to review rows and previews.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-border/80 shadow-none ring-1 ring-border/60">
                <CardContent className="space-y-3 p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    <Film className="size-4 text-muted-foreground" aria-hidden />
                    <p className="text-sm font-medium">First line up</p>
                  </div>
                  <p className="text-3xl font-bold tabular-nums tracking-tight">
                    {overview.videos.firstLineUp.total}
                  </p>
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <li>Awaiting upload: {overview.videos.firstLineUp.awaitingUpload}</li>
                    <li>Medical review: {overview.videos.firstLineUp.medicalReview}</li>
                    <li>Brand review: {overview.videos.firstLineUp.brandReview}</li>
                    <li>Approved: {overview.videos.firstLineUp.approved}</li>
                  </ul>
                  <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
                    <Link href="/content-library?phase=FIRST_LINE_UP">
                      View in content library
                    </Link>
                  </Button>
                </CardContent>
              </Card>
              <Card className="border-border/80 shadow-none ring-1 ring-border/60">
                <CardContent className="space-y-3 p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    <Film className="size-4 text-muted-foreground" aria-hidden />
                    <p className="text-sm font-medium">First cut</p>
                  </div>
                  <p className="text-3xl font-bold tabular-nums tracking-tight">
                    {overview.videos.firstCut.total}
                  </p>
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <li>Awaiting upload: {overview.videos.firstCut.awaitingUpload}</li>
                    <li>Medical review: {overview.videos.firstCut.medicalReview}</li>
                    <li>Brand review: {overview.videos.firstCut.brandReview}</li>
                    <li>Approved: {overview.videos.firstCut.approved}</li>
                  </ul>
                  <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
                    <Link href="/content-library?phase=FIRST_CUT">
                      View in content library
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {overview && !loading && (
          <section className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Activity today
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {overview.activity?.actionsToday ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  Total workflow actions
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Unread notifications
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {overview.notifications?.unread ?? 0}
                </p>
                <Button variant="link" className="h-auto px-0 pt-1" asChild>
                  <Link href="/notifications">Open inbox</Link>
                </Button>
              </CardContent>
            </Card>
            <Card
              className={cn(
                overdueTotal > 0
                  ? "border-destructive/40 bg-destructive/5"
                  : ""
              )}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full",
                    overdueTotal > 0
                      ? "bg-destructive/15 text-destructive"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <AlertTriangle className="size-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">
                    {overdueTotal}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {overdueTotal > 0
                      ? "Items past TAT"
                      : "Nothing overdue"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        <section className="space-y-4">
          <AdminSectionTitle>
            {overdueItems.length > 0 ? "Overdue items" : "Attention queue"}
          </AdminSectionTitle>
          <Card>
            <CardContent className="divide-y divide-border px-0 py-0">
              {loading ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : overdueItems.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <BarChart3 className="size-10 text-muted-foreground" />
                  <p className="font-medium text-foreground">All clear</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    No items are currently past their TAT. Overdue work will
                    appear here automatically.
                  </p>
                </div>
              ) : (
                overdueItems.map((row) => (
                  <div
                    key={`${row.type}-${row.id}`}
                    className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{row.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {row.stageLabel} · {row.owner} ·{" "}
                        <span className="text-destructive">
                          {row.hoursOverdue}h overdue
                        </span>
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                      {row.type}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </AdminPageShell>
  )
}
