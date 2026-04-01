"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScriptListPagination } from "@/components/ui/pagination"
import { PackageListTabNav } from "@/components/packages/package-list-tab-nav"
import { useAuthStore } from "@/store"
import {
  getPackageMyReviews,
  getPackageQueue,
  getPackageStats,
} from "@/lib/packages-api"
import {
  aggregatePackageDisplayStatus,
  filterQueuePackagesBySearch,
  groupQueueVideosIntoPackages,
  packageVideosSorted,
} from "@/lib/package-video-helpers"
import type { FinalPackage, PackageVideo } from "@/types/package"
import type { UserRole } from "@/types/auth"
import {
  PACKAGE_STATUS_LABELS,
  formatPackageDate,
  packageStatusBadgeClass,
} from "@/lib/package-ui"
import { ArrowRight, Loader2, Package, Search } from "lucide-react"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10

type TabKey = "queue" | "approved" | "rejected"

export default function MedicalAffairsPackagesPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<TabKey>("queue")
  const [page, setPage] = useState(1)
  const [queueVideos, setQueueVideos] = useState<PackageVideo[]>([])
  const [historyVideos, setHistoryVideos] = useState<PackageVideo[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyTotalPages, setHistoryTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [stats, setStats] = useState<Awaited<
    ReturnType<typeof getPackageStats>
  > | null>(null)

  const role = user?.role as UserRole | undefined
  const canAccess = role === "MEDICAL_AFFAIRS" || role === "SUPER_ADMIN"

  const queuePackages = useMemo(
    () => groupQueueVideosIntoPackages(queueVideos),
    [queueVideos]
  )

  const queueFiltered = useMemo(
    () => filterQueuePackagesBySearch(queuePackages, searchQuery),
    [queuePackages, searchQuery]
  )

  const queueTotalPages = Math.max(
    1,
    Math.ceil(queueFiltered.length / PAGE_SIZE)
  )
  const queuePageSlice = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return queueFiltered.slice(start, start + PAGE_SIZE)
  }, [queueFiltered, page])

  const historyPackages = useMemo(
    () => groupQueueVideosIntoPackages(historyVideos),
    [historyVideos]
  )

  const historyFiltered = useMemo(
    () => filterQueuePackagesBySearch(historyPackages, searchQuery),
    [historyPackages, searchQuery]
  )

  const loadQueue = useCallback(async () => {
    if (!token || !canAccess) return
    const res = await getPackageQueue(token)
    setQueueVideos(res.videos ?? [])
  }, [token, canAccess])

  useEffect(() => {
    if (!token || !canAccess) return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true)
        setError(null)
      }
    })
    if (tab === "queue") {
      loadQueue()
        .then(() => {
          if (!cancelled) setLoading(false)
        })
        .catch((e) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Failed to load")
            setLoading(false)
          }
        })
    } else {
      getPackageMyReviews(token, {
        decision: tab === "approved" ? "APPROVED" : "REJECTED",
        page,
        limit: PAGE_SIZE,
      })
        .then((res) => {
          if (!cancelled) {
            setHistoryVideos(res.videos ?? [])
            setHistoryTotal(res.total ?? 0)
            setHistoryTotalPages(Math.max(1, res.totalPages ?? 1))
          }
        })
        .catch((e) => {
          if (!cancelled)
            setError(e instanceof Error ? e.message : "Failed to load")
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    return () => {
      cancelled = true
    }
  }, [token, canAccess, tab, page, loadQueue])

  useEffect(() => {
    if (!token || !canAccess) return
    getPackageStats(token).then(setStats).catch(() => setStats(null))
  }, [token, canAccess])

  const byStatus = stats?.stats?.byStatus ?? {}

  if (!canAccess) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Only Medical Affairs can open this queue.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => router.back()}>
              Go back
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Final packages — Medical review
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Phase 6 — Each deliverable has its own video track. Open a package to
            approve or reject the <strong>video file</strong> for each
            deliverable as needed.
          </p>
        </div>

        {stats?.stats && (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ["total", stats.stats.total, "Total videos"],
                ["mr", byStatus.MEDICAL_REVIEW ?? 0, "Medical stage"],
                ["br", byStatus.BRAND_VIDEO_REVIEW ?? 0, "Brand quality"],
                ["ap", byStatus.AWAITING_APPROVER ?? 0, "Final approval"],
                ["ok", byStatus.APPROVED ?? 0, "Approved"],
                ["wd", byStatus.WITHDRAWN ?? 0, "Withdrawn"],
              ] as const
            ).map(([k, v, label]) => (
              <Card key={k}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold">{v}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <PackageListTabNav<TabKey>
          tabs={
            [
              { key: "queue", label: "Queue" },
              { key: "approved", label: "Approved (history)" },
              { key: "rejected", label: "Rejected (history)" },
            ] as const
          }
          active={tab}
          onChange={(k) => {
            setTab(k)
            setPage(1)
          }}
          ariaLabel="Final package list tabs"
        />

        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : tab === "queue" ? (
          <>
            {queueFiltered.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center py-10 text-center">
                  <Package className="size-10 text-muted-foreground" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    No packages in your queue.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ul className="space-y-3">
                {queuePageSlice.map((pkg) => (
                  <li key={pkg.id}>
                    <MedicalPackageQueueRow pkg={pkg} />
                  </li>
                ))}
              </ul>
            )}
            {queueFiltered.length > PAGE_SIZE && (
              <ScriptListPagination
                page={page}
                totalPages={queueTotalPages}
                total={queueFiltered.length}
                limit={PAGE_SIZE}
                onPageChange={setPage}
              />
            )}
          </>
        ) : historyVideos.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <Package className="size-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                No items in this history tab.
              </p>
            </CardContent>
          </Card>
        ) : historyFiltered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <Package className="size-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                No packages match your search.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <ul className="space-y-3">
              {historyFiltered.map((pkg) => (
                <li key={pkg.id}>
                  <MedicalPackageQueueRow pkg={pkg} variant="history" />
                </li>
              ))}
            </ul>
            <ScriptListPagination
              page={page}
              totalPages={historyTotalPages}
              total={historyTotal}
              limit={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  )
}

function firstMedicalPendingVideoId(pkg: FinalPackage): string | undefined {
  for (const v of packageVideosSorted(pkg)) {
    if (v.status === "MEDICAL_REVIEW" && v.videoTrackStatus === "PENDING") {
      return v.id
    }
  }
  return undefined
}

function medicalPackageQueueHref(pkg: FinalPackage): string {
  const vid = firstMedicalPendingVideoId(pkg)
  const base = `/medical-affairs-packages/${pkg.id}`
  return vid ? `${base}?video=${encodeURIComponent(vid)}` : base
}

function medicalPackageHistoryHref(pkg: FinalPackage): string {
  const first = packageVideosSorted(pkg)[0]
  const base = `/medical-affairs-packages/${pkg.id}`
  return first?.id ? `${base}?video=${encodeURIComponent(first.id)}` : base
}

function MedicalPackageQueueRow({
  pkg,
  variant = "queue",
}: {
  pkg: FinalPackage
  variant?: "queue" | "history"
}) {
  const displayStatus = aggregatePackageDisplayStatus(pkg)
  const packageName = pkg.name?.trim() || "Final package"
  const scriptTitle = pkg.script?.title?.trim()

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("text-xs", packageStatusBadgeClass(displayStatus))}
            >
              {PACKAGE_STATUS_LABELS[displayStatus]}
            </Badge>
            {variant === "history" ? (
              <Badge variant="outline" className="text-xs font-normal">
                History
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 font-medium leading-snug">{packageName}</p>
          <p className="text-sm text-muted-foreground">
            {scriptTitle ? `Script: ${scriptTitle} · ` : ""}
            Updated {formatPackageDate(pkg.updatedAt ?? "")}
          </p>
        </div>
        <Button size="sm" variant="outline" asChild className="shrink-0 sm:mt-0">
          <Link
            href={
              variant === "history"
                ? medicalPackageHistoryHref(pkg)
                : medicalPackageQueueHref(pkg)
            }
            className="gap-1"
          >
            Open
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
