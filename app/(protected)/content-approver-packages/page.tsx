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
  getPackage,
  getPackageMyReviews,
  getPackageQueue,
  getPackageStats,
} from "@/lib/packages-api"
import {
  deliverableLabelsForQueueVideos,
  filterQueueVideosBySearch,
  groupQueueVideosByPackage,
  packageReadyForContentApproverFullView,
  type QueuePackageGroup,
} from "@/lib/package-video-helpers"
import type { PackageVideo } from "@/types/package"
import type { UserRole } from "@/types/auth"
import {
  TRACK_STATUS_LABELS,
  VIDEO_STATUS_LABELS,
  formatPackageDate,
  videoStatusBadgeClass,
} from "@/lib/package-ui"
import { ArrowRight, Loader2, Package, Search } from "lucide-react"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10

type TabKey = "queue" | "approved"

export default function ContentApproverPackagesPage() {
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
  const canAccess = role === "CONTENT_APPROVER" || role === "SUPER_ADMIN"

  const [approverPackageReadiness, setApproverPackageReadiness] = useState<{
    readyIds: Set<string>
    loading: boolean
  } | null>(null)

  const queueSearchFiltered = useMemo(
    () => filterQueueVideosBySearch(queueVideos, searchQuery),
    [queueVideos, searchQuery]
  )

  const queueFiltered = useMemo(() => {
    if (role !== "CONTENT_APPROVER" || tab !== "queue") {
      return queueSearchFiltered
    }
    if (
      approverPackageReadiness === null ||
      approverPackageReadiness.loading
    ) {
      return []
    }
    return queueSearchFiltered.filter((v) =>
      approverPackageReadiness.readyIds.has(v.packageId)
    )
  }, [role, tab, queueSearchFiltered, approverPackageReadiness])

  const queuePackageGroups = useMemo(
    () => groupQueueVideosByPackage(queueFiltered),
    [queueFiltered]
  )

  const queueTotalPages = Math.max(
    1,
    Math.ceil(queuePackageGroups.length / PAGE_SIZE)
  )
  const queuePageSlice = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return queuePackageGroups.slice(start, start + PAGE_SIZE)
  }, [queuePackageGroups, page])

  const queueDeliverableLabels = useMemo(
    () => deliverableLabelsForQueueVideos(queueFiltered),
    [queueFiltered]
  )

  const historyPackageGroups = useMemo(
    () => groupQueueVideosByPackage(historyVideos),
    [historyVideos]
  )

  const historyDeliverableLabels = useMemo(
    () => deliverableLabelsForQueueVideos(historyVideos),
    [historyVideos]
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
        decision: "APPROVED",
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

  useEffect(() => {
    if (!token || tab !== "queue" || role !== "CONTENT_APPROVER") {
      setApproverPackageReadiness(null)
      return
    }
    const ids = [
      ...new Set(
        queueVideos.map((v) => v.packageId).filter((id): id is string => !!id)
      ),
    ]
    if (ids.length === 0) {
      setApproverPackageReadiness({ readyIds: new Set(), loading: false })
      return
    }
    let cancelled = false
    setApproverPackageReadiness((prev) => ({
      readyIds: prev?.readyIds ?? new Set(),
      loading: true,
    }))
    Promise.all(ids.map((packageId) => getPackage(token, packageId)))
      .then((results) => {
        if (cancelled) return
        const ready = new Set<string>()
        for (const res of results) {
          const p = res.package
          if (
            p?.id &&
            packageReadyForContentApproverFullView(p.videos ?? [])
          ) {
            ready.add(p.id)
          }
        }
        setApproverPackageReadiness({ readyIds: ready, loading: false })
      })
      .catch(() => {
        if (cancelled) return
        setApproverPackageReadiness({ readyIds: new Set(ids), loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [token, tab, role, queueVideos])

  const byStatus = stats?.stats?.byStatus ?? {}

  if (!canAccess) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Only Content Approver can open this queue.
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
            Final packages — Final approval
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You can open a package and see videos, metadata, and thumbnails only
            after <strong>every</strong> deliverable in that package has left
            Medical and Content/Brand review. Then you can final-approve (no
            reject) each video that is awaiting you.
          </p>
        </div>

        {stats?.stats && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["total", stats.stats.total, "Total"],
                ["ap", byStatus.AWAITING_APPROVER ?? 0, "Your queue"],
                ["ok", byStatus.APPROVED ?? 0, "Approved"],
                ["mr", byStatus.MEDICAL_REVIEW ?? 0, "Earlier stages"],
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
              { key: "approved", label: "Approved" },
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

        {role === "CONTENT_APPROVER" &&
          tab === "queue" &&
          (approverPackageReadiness === null ||
            approverPackageReadiness.loading) && (
            <p className="text-sm text-muted-foreground">
              Checking which packages are ready for full review…
            </p>
          )}

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
                    {role === "CONTENT_APPROVER" &&
                    tab === "queue" &&
                    (approverPackageReadiness === null ||
                      approverPackageReadiness.loading) ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        Verifying package readiness…
                      </span>
                    ) : role === "CONTENT_APPROVER" &&
                      !approverPackageReadiness?.loading &&
                      queueSearchFiltered.length > 0 ? (
                      "Nothing ready to open yet. Some queue items are hidden until every deliverable in those packages has cleared Medical and Content/Brand review."
                    ) : (
                      "Nothing in your queue."
                    )}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ul className="space-y-4">
                {queuePageSlice.map((group) => (
                  <li key={group.packageId}>
                    <PackageQueueCard
                      group={group}
                      deliverableLabels={queueDeliverableLabels}
                    />
                  </li>
                ))}
              </ul>
            )}
            {queuePackageGroups.length > PAGE_SIZE && (
              <ScriptListPagination
                page={page}
                totalPages={queueTotalPages}
                total={queuePackageGroups.length}
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
                No approved videos in your history yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <ul className="space-y-4">
              {historyPackageGroups.map((group) => (
                <li key={group.packageId}>
                  <PackageQueueCard
                    group={group}
                    deliverableLabels={historyDeliverableLabels}
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

function PackageQueueCard({
  group,
  deliverableLabels,
}: {
  group: QueuePackageGroup
  deliverableLabels: Map<string, string>
}) {
  const { packageId, videos, packageName, scriptTitle } = group
  const awaiting = videos.filter((v) => v.status === "AWAITING_APPROVER").length
  const base = "/content-approver-packages"

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight">{packageName}</p>
            {scriptTitle ? (
              <p className="mt-1 text-sm text-muted-foreground">{scriptTitle}</p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {videos.length} deliverable{videos.length === 1 ? "" : "s"}
              {awaiting > 0
                ? ` · ${awaiting} awaiting final approval`
                : null}
            </p>
          </div>
          <Button size="sm" variant="default" asChild className="shrink-0">
            <Link href={`${base}/${packageId}`} className="gap-1">
              Open package
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <ul className="divide-y rounded-lg border bg-muted/20">
          {videos.map((v) => {
            const label =
              deliverableLabels.get(v.id)?.trim() || v.type.replace("_", " ")
            return (
              <li
                key={v.id}
                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        videoStatusBadgeClass(v.status)
                      )}
                    >
                      {VIDEO_STATUS_LABELS[v.status]}
                    </Badge>
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {TRACK_STATUS_LABELS[v.videoTrackStatus]} /{" "}
                    {TRACK_STATUS_LABELS[v.metadataTrackStatus]} · v
                    {v.currentVersion} · {formatPackageDate(v.updatedAt ?? "")}
                  </p>
                </div>
                <Button size="sm" variant="outline" asChild className="shrink-0">
                  <Link
                    href={`${base}/${packageId}?video=${encodeURIComponent(v.id)}`}
                    className="gap-1"
                  >
                    Open
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
