"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAuthStore } from "@/store"
import { getPackageQueue } from "@/lib/packages-api"
import { scriptNeedsAgencyFirstLineUpUpload } from "@/lib/agency-first-line-up"
import { packageVisibleInAgencyPhase6Workflow } from "@/lib/video-phase-gates"
import { getScriptQueue, getScriptStats } from "@/lib/scripts-api"
import { getVideoQueue } from "@/lib/videos-api"
import type { Video } from "@/types/video"
import { filterScriptsBySearch } from "@/lib/script-search"
import type { Script, ScriptStatus, ScriptStatsResponse } from "@/types/script"
import { ScriptListSkeleton } from "@/components/loading/script-list-skeleton"
import { ScriptListingCard } from "@/components/script-listing-card"
import { ScriptListPagination } from "@/components/ui/pagination"
import { ScriptStatsCards } from "@/components/script-stats-cards"
import { Clapperboard, FileText, Package, Search, Send, Upload } from "lucide-react"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10

type TabKey = "all" | "locked"

const STATUS_LABELS: Record<ScriptStatus, string> = {
  DRAFT: "Draft",
  CONTENT_BRAND_REVIEW: "Content/Brand Review",
  AGENCY_PRODUCTION: "Agency Production",
  MEDICAL_REVIEW: "Medical Review",
  CONTENT_BRAND_APPROVAL: "Content/Brand Approval",
  CONTENT_APPROVER_REVIEW: "Content Approver Review",
  LOCKED: "Locked",
}

export default function AgencyPocPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [scripts, setScripts] = useState<Script[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<ScriptStatsResponse | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [tab, setTab] = useState<TabKey>("all")
  /** scriptId → package id from agency package queue (for locked script actions). */
  const [finalPackageIdByScriptId, setFinalPackageIdByScriptId] = useState<
    Map<string, string>
  >(() => new Map())
  /** For locked scripts: video queue rows (Phase 4/5) — used to hide First Line Up upload when FLU is approved. */
  const [videos, setVideos] = useState<Video[]>([])

  const isAgencyPoc = user?.role === "AGENCY_POC"

  const tabFilteredScripts = useMemo(() => {
    if (tab === "locked") return scripts.filter((s) => s.status === "LOCKED")
    return scripts
  }, [scripts, tab])

  const searchFilteredScripts = useMemo(
    () => filterScriptsBySearch(tabFilteredScripts, searchQuery),
    [tabFilteredScripts, searchQuery]
  )
  const displayedScripts = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return searchFilteredScripts.slice(start, start + PAGE_SIZE)
  }, [page, searchFilteredScripts])

  const paginationTotalPages = Math.max(
    1,
    Math.ceil(searchFilteredScripts.length / PAGE_SIZE)
  )

  useEffect(() => {
    if (!token) return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true)
        setError(null)
      }
    })
    getScriptQueue(token)
      .then((res) => {
        if (!cancelled) {
          const combined = [...(res.available ?? []), ...(res.myReviews ?? [])]
          setScripts(combined)
          setTotal(res.total ?? combined.length)
          setTotalPages(
            Math.max(1, Math.ceil((res.total ?? combined.length) / PAGE_SIZE))
          )
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load scripts"
          )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    Promise.all([getPackageQueue(token), getVideoQueue(token)])
      .then(([packageRes, videoRes]) => {
        if (cancelled) return
        const mergedVideos = [
          ...(videoRes.available ?? []),
          ...(videoRes.myReviews ?? []),
        ]
        setVideos(mergedVideos)
        const m = new Map<string, string>()
        for (const p of [
          ...(packageRes.available ?? []),
          ...(packageRes.myReviews ?? []),
        ]) {
          if (
            p.scriptId &&
            p.id &&
            packageVisibleInAgencyPhase6Workflow(p, mergedVideos)
          ) {
            m.set(p.scriptId, p.id)
          }
        }
        setFinalPackageIdByScriptId(m)
      })
      .catch(() => {
        if (!cancelled) {
          setVideos([])
          setFinalPackageIdByScriptId(new Map())
        }
      })
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    getScriptStats(token)
      .then(setStats)
      .catch(() => setStats(null))
  }, [token])

  if (!isAgencyPoc) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Only Agency POC can access this queue.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.back()}
            >
              Go back
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Agency Production
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scripts approved by Content/Brand. Edit and submit your revision for
            Medical Affairs review. TAT 24 hours.
          </p>
        </div>

        <ScriptStatsCards stats={stats} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by title..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(1)
              }}
              className="h-10 pl-9"
            />
          </div>
        </div>

        <div className="border-b border-border">
          <nav
            className="flex gap-1"
            role="tablist"
            aria-label="Script list tabs"
          >
            {(
              [
                { key: "all" as TabKey, label: "All" },
                { key: "locked" as TabKey, label: "Locked" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => {
                  setTab(key)
                  setPage(1)
                }}
                className={cn(
                  "border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                  tab === key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <ScriptListSkeleton />
        ) : scripts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="size-12 text-muted-foreground" />
              <p className="mt-4 font-medium">No scripts in production</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Scripts approved by Content/Brand will appear here.
              </p>
            </CardContent>
          </Card>
        ) : tabFilteredScripts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="size-12 text-muted-foreground" />
              <p className="mt-4 font-medium">
                {tab === "locked" ? "No locked scripts" : "No scripts"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tab === "locked"
                  ? "Locked scripts enter the video phase. Upload First Line Up from Videos."
                  : "Scripts approved by Content/Brand will appear here."}
              </p>
            </CardContent>
          </Card>
        ) : searchFilteredScripts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="size-12 text-muted-foreground" />
              <p className="mt-4 font-medium">No scripts match your search</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different search term or clear the search.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setSearchQuery("")
                  setPage(1)
                }}
              >
                Clear search
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {displayedScripts.map((script) => {
              const finalPackageId = finalPackageIdByScriptId.get(script.id)
              const needsFirstLineUpUpload =
                scriptNeedsAgencyFirstLineUpUpload(script.id, videos)
              return (
                <ScriptListingCard
                  key={script.id}
                  script={script}
                  detailHref={`/agency-poc/${script.id}`}
                  authorSubtitle="Agency POC"
                  onCardClick={() => router.push(`/agency-poc/${script.id}`)}
                  actions={
                    script.status === "LOCKED" ? (
                      <div
                        className="flex flex-wrap gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {finalPackageId ? (
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                          >
                            <Link
                              href={`/agency-poc-packages/${finalPackageId}`}
                            >
                              <Package className="size-4 shrink-0" />
                              Final package
                            </Link>
                          </Button>
                        ) : needsFirstLineUpUpload ? (
                          <Button
                            asChild
                            size="sm"
                            className="gap-1.5 border-0 bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-white hover:opacity-90"
                          >
                            <Link href={`/agency-poc/${script.id}/upload`}>
                              <Upload className="size-4 shrink-0" />
                              Upload First Line Up
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                          >
                            <Link href="/agency-poc-videos">
                              <Clapperboard className="size-4 shrink-0" />
                              Video production
                            </Link>
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Button
                        asChild
                        size="sm"
                        className="gap-1.5 bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/agency-poc/${script.id}`}>
                          <Send className="size-4 shrink-0" />
                          Edit & submit revision
                        </Link>
                      </Button>
                    )
                  }
                />
              )
            })}
          </div>
        )}

        {!loading && searchFilteredScripts.length > 0 && (
          <ScriptListPagination
            page={page}
            totalPages={paginationTotalPages}
            total={searchFilteredScripts.length}
            limit={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  )
}
