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
  getPackageQueue,
  getPackageMyReviews,
  getPackageStats,
} from "@/lib/packages-api"
import {
  dedupePackages,
  filterPackagesBySearch,
} from "@/lib/package-list-utils"
import type { FinalPackage, PackageStatus } from "@/types/package"
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

export default function ContentBrandPackagesPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<TabKey>("queue")
  const [page, setPage] = useState(1)
  const [available, setAvailable] = useState<FinalPackage[]>([])
  const [queueMyReviews, setQueueMyReviews] = useState<FinalPackage[]>([])
  const [historyPackages, setHistoryPackages] = useState<FinalPackage[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyTotalPages, setHistoryTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [stats, setStats] = useState<Awaited<
    ReturnType<typeof getPackageStats>
  > | null>(null)

  const role = user?.role as UserRole | undefined
  const canAccess = role === "CONTENT_BRAND" || role === "SUPER_ADMIN"

  const queueCombined = useMemo(
    () => dedupePackages([...available, ...queueMyReviews]),
    [available, queueMyReviews]
  )

  const queueFiltered = useMemo(
    () => filterPackagesBySearch(queueCombined, searchQuery),
    [queueCombined, searchQuery]
  )

  const queueTotalPages = Math.max(
    1,
    Math.ceil(queueFiltered.length / PAGE_SIZE)
  )
  const queuePageSlice = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return queueFiltered.slice(start, start + PAGE_SIZE)
  }, [queueFiltered, page])

  const loadQueue = useCallback(async () => {
    if (!token || !canAccess) return
    const res = await getPackageQueue(token)
    setAvailable(res.available ?? [])
    setQueueMyReviews(res.myReviews ?? [])
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
            setHistoryPackages(res.packages ?? [])
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

  const historyFiltered = useMemo(
    () => filterPackagesBySearch(historyPackages, searchQuery),
    [historyPackages, searchQuery]
  )

  if (!canAccess) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Only Content/Brand can open this queue.
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
            Final packages — Content/Brand
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Metadata + thumbnails at Medical review, then full video review.
            History shows your past approvals and rejections.
          </p>
        </div>

        {stats && (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(
              [
                ["inReview", stats.inReview, "In review"],
                ["overdue", stats.overdue, "Overdue"],
                ["approved", stats.approved, "Approved"],
                ["rejected", stats.rejected, "Rejected"],
                ["draft", stats.draft, "Draft"],
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
                {queuePageSlice.map((p) => (
                  <li key={p.id}>
                    <QueueRow pkg={p} href={`/content-brand-packages/${p.id}`} />
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
        ) : historyFiltered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <Package className="size-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                No packages in this history tab.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <ul className="space-y-3">
              {historyFiltered.map((p) => (
                <li key={p.id}>
                  <QueueRow
                    pkg={p}
                    href={`/content-brand-packages/${p.id}`}
                    showRejectionHint={tab === "rejected"}
                  />
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

function QueueRow({
  pkg,
  href,
  showRejectionHint,
}: {
  pkg: FinalPackage
  href: string
  showRejectionHint?: boolean
}) {
  const status = pkg.status as PackageStatus
  const stageHint =
    status === "MEDICAL_REVIEW"
      ? pkg.metadataTrackStatus === "PENDING"
        ? "Metadata review"
        : "Waiting on Medical video track"
      : status === "BRAND_REVIEW"
        ? "Full video review"
        : ""

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("text-xs", packageStatusBadgeClass(status))}
            >
              {PACKAGE_STATUS_LABELS[status]}
            </Badge>
            {stageHint && (
              <span className="text-xs text-muted-foreground">{stageHint}</span>
            )}
          </div>
          <p className="mt-1 font-medium">{pkg.title}</p>
          <p className="text-sm text-muted-foreground">
            {pkg.script?.title ?? "Script"} · v{pkg.version} ·{" "}
            {formatPackageDate(pkg.updatedAt)}
          </p>
          {showRejectionHint && pkg.latestRejection?.overallComments && (
            <p className="mt-2 line-clamp-2 text-xs text-destructive">
              {pkg.latestRejection.overallComments}
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" asChild className="shrink-0">
          <Link href={href} className="gap-1">
            Open
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
