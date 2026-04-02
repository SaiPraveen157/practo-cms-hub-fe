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
import type { UserRole } from "@/types/auth"
import {
  getLanguagePackageQueue,
  getLanguagePackageStats,
} from "@/lib/language-packages-api"
import {
  aggregateLanguagePackageRowStatus,
  filterLanguageQueuePackagesBySearch,
  groupLanguageQueueVideosIntoPackages,
  languagePackagesAllVideosApprovedFromQueue,
  languagePackagesAwaitingApproverFromQueue,
} from "@/lib/language-list-utils"
import type { LanguagePackage } from "@/types/language-package"
import {
  formatLanguageLabel,
  languageVideoStatusBadgeClass,
  LANGUAGE_VIDEO_STATUS_LABELS,
} from "@/lib/language-package-ui"
import { formatPackageDate } from "@/lib/package-ui"
import { ArrowRight, Languages, Loader2, Search } from "lucide-react"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10

type ListTab = "queue" | "approved"

function firstApproverQueueVideoId(pkg: LanguagePackage): string | undefined {
  for (const v of pkg.videos ?? []) {
    if (v.status === "AWAITING_APPROVER") return v.id
  }
  return pkg.videos?.[0]?.id
}

function firstApprovedVideoId(pkg: LanguagePackage): string | undefined {
  for (const v of pkg.videos ?? []) {
    if (v.status === "APPROVED") return v.id
  }
  return pkg.videos?.[0]?.id
}

function hrefForQueuePackage(pkg: LanguagePackage): string {
  const vid = firstApproverQueueVideoId(pkg)
  const base = `/content-approver-language-packages/${pkg.id}`
  return vid ? `${base}?video=${encodeURIComponent(vid)}` : base
}

function hrefForApprovedPackage(pkg: LanguagePackage): string {
  const vid = firstApprovedVideoId(pkg)
  const base = `/content-approver-language-packages/${pkg.id}`
  return vid ? `${base}?video=${encodeURIComponent(vid)}` : base
}

export default function ContentApproverLanguagePackagesPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [listTab, setListTab] = useState<ListTab>("queue")
  const [page, setPage] = useState(1)
  const [queueVideos, setQueueVideos] = useState<
    Awaited<ReturnType<typeof getLanguagePackageQueue>>["videos"]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [stats, setStats] = useState<Record<string, number> | null>(null)

  const role = user?.role as UserRole | undefined
  const canAccess = role === "CONTENT_APPROVER" || role === "SUPER_ADMIN"

  const loadQueue = useCallback(async () => {
    if (!token || !canAccess) return
    setLoading(true)
    setError(null)
    try {
      const qRes = await getLanguagePackageQueue(token)
      setQueueVideos(qRes.videos ?? [])
    } catch (e) {
      setQueueVideos([])
      setError(e instanceof Error ? e.message : "Failed to load queue")
    } finally {
      setLoading(false)
    }
  }, [token, canAccess])

  useEffect(() => {
    void loadQueue()
  }, [loadQueue])

  useEffect(() => {
    if (!token || !canAccess) return
    getLanguagePackageStats(token)
      .then((r) => {
        const d = r.data ?? (r as { stats?: Record<string, number> }).stats
        setStats(d && typeof d === "object" ? d : null)
      })
      .catch(() => setStats(null))
  }, [token, canAccess])

  const queuePackagesAll = useMemo(
    () => groupLanguageQueueVideosIntoPackages(queueVideos),
    [queueVideos]
  )
  const queuePackages = useMemo(
    () => languagePackagesAwaitingApproverFromQueue(queuePackagesAll),
    [queuePackagesAll]
  )
  const approvedPackages = useMemo(
    () => languagePackagesAllVideosApprovedFromQueue(queuePackagesAll),
    [queuePackagesAll]
  )

  const activePackages =
    listTab === "queue" ? queuePackages : approvedPackages

  const activeFiltered = useMemo(
    () => filterLanguageQueuePackagesBySearch(activePackages, searchQuery),
    [activePackages, searchQuery]
  )

  const totalPages = Math.max(1, Math.ceil(activeFiltered.length / PAGE_SIZE))
  const pageSlice = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return activeFiltered.slice(start, start + PAGE_SIZE)
  }, [activeFiltered, page])

  useEffect(() => {
    setPage(1)
  }, [listTab, searchQuery])

  if (!canAccess) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Only Content Approver (or Super Admin) can open this queue.
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
            Language packages — Final approval
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve only — no rejection at this stage (per Phase 7 workflow).
            In queue and Approved are split from the same queue response.
          </p>
        </div>

        {stats && Object.keys(stats).length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["BRAND_REVIEW", "In review"],
                ["AWAITING_APPROVER", "Your queue"],
                ["APPROVED", "Approved"],
                ["WITHDRAWN", "Withdrawn"],
              ] as const
            ).map(([key, label]) => (
              <Card key={key}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold">{stats[key] ?? 0}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <PackageListTabNav<ListTab>
          tabs={[
            { key: "queue", label: `In queue (${queuePackages.length})` },
            { key: "approved", label: `Approved (${approvedPackages.length})` },
          ]}
          active={listTab}
          onChange={(k) => setListTab(k)}
          ariaLabel="Language package lists"
        />

        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search packages…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : activeFiltered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <Languages className="size-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                {listTab === "queue"
                  ? "Nothing awaiting your approval in the queue right now."
                  : "No packages in the queue where every video is already approved."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <ul className="space-y-3">
              {pageSlice.map((pkg) => {
                const rowStatus = aggregateLanguagePackageRowStatus(pkg)
                const href =
                  listTab === "queue"
                    ? hrefForQueuePackage(pkg)
                    : hrefForApprovedPackage(pkg)
                return (
                  <li key={`${listTab}-${pkg.id}`}>
                    <Card>
                      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                languageVideoStatusBadgeClass(rowStatus)
                              )}
                            >
                              {LANGUAGE_VIDEO_STATUS_LABELS[rowStatus]}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {formatLanguageLabel(String(pkg.language))}
                            </Badge>
                          </div>
                          <p className="mt-1 font-medium leading-snug">
                            {pkg.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {pkg.script?.title
                              ? `Script: ${pkg.script.title} · `
                              : ""}
                            Updated {formatPackageDate(pkg.updatedAt ?? "")}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={href} className="gap-1">
                            Open
                            <ArrowRight className="size-4" />
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  </li>
                )
              })}
            </ul>
            {activeFiltered.length > PAGE_SIZE && (
              <ScriptListPagination
                page={page}
                totalPages={totalPages}
                total={activeFiltered.length}
                limit={PAGE_SIZE}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
