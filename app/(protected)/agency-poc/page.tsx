"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAuthStore } from "@/store"
import { getPackageQueue } from "@/lib/packages-api"
import {
  isVideoLockedPhase3Done,
  isVideoReadyToUploadFlu,
  mergeScriptQueueRows,
  mergeUniqueScriptsById,
  mergeVideoQueueRows,
  SCRIPT_REVIEW_WITH_OTHER_TEAMS_STATUSES,
  scriptsForScriptQueueTab,
  scriptsMatchingVideoFilter,
} from "@/lib/agency-poc-queue-scripts"
import { scriptNeedsAgencyFirstLineUpUpload } from "@/lib/agency-first-line-up"
import { groupQueueVideosIntoPackages } from "@/lib/package-video-helpers"
import { packageVisibleInAgencyPhase6Workflow } from "@/lib/video-phase-gates"
import {
  getScriptQueue,
  getScriptStats,
  listScripts,
} from "@/lib/scripts-api"
import { getVideoQueue } from "@/lib/videos-api"
import type { Video } from "@/types/video"
import { filterScriptsBySearch } from "@/lib/script-search"
import type { Script, ScriptStatsResponse } from "@/types/script"
import { ScriptListSkeleton } from "@/components/loading/script-list-skeleton"
import { ScriptListingCard } from "@/components/script-listing-card"
import { ScriptListPagination } from "@/components/ui/pagination"
import { ScriptStatsCards } from "@/components/script-stats-cards"
import {
  Clapperboard,
  FileText,
  Package,
  Search,
  Send,
  Upload,
} from "lucide-react"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10

type TabKey =
  | "script_queue"
  | "review_in_progress"
  | "ready_to_upload"
  | "locked_phase3"

export default function AgencyPocPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  /** Merged GET /api/videos/queue rows — single source for tabs + cards. */
  const [queueVideos, setQueueVideos] = useState<Video[]>([])
  /** Merged GET /api/scripts/queue — script rows for Script queue tab (AGENCY_PRODUCTION, etc.). */
  const [scriptQueueScripts, setScriptQueueScripts] = useState<Script[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<ScriptStatsResponse | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [tab, setTab] = useState<TabKey>("script_queue")
  /** scriptId → package id from agency package queue (for locked script actions). */
  const [finalPackageIdByScriptId, setFinalPackageIdByScriptId] = useState<
    Map<string, string>
  >(() => new Map())
  /** Video queue rows — FLU upload visibility uses `script.fluStatus` when present; videos are fallback only. */
  const [videos, setVideos] = useState<Video[]>([])
  /** Scripts in text review with Medical / Content/Brand / Approver (GET /api/scripts by status). */
  const [scriptsInReviewWithOtherTeams, setScriptsInReviewWithOtherTeams] =
    useState<Script[]>([])

  const isAgencyPoc = user?.role === "AGENCY_POC"

  const tabFilteredScripts = useMemo(() => {
    switch (tab) {
      case "script_queue":
        return scriptsForScriptQueueTab(queueVideos, scriptQueueScripts)
      case "review_in_progress":
        return scriptsInReviewWithOtherTeams
      case "ready_to_upload":
      case "locked_phase3":
        if (queueVideos.length === 0) return []
        break
      default:
        return []
    }
    switch (tab) {
      case "ready_to_upload":
        return scriptsMatchingVideoFilter(queueVideos, isVideoReadyToUploadFlu)
      case "locked_phase3":
        return scriptsMatchingVideoFilter(queueVideos, isVideoLockedPhase3Done)
      default:
        return []
    }
  }, [queueVideos, scriptQueueScripts, tab, scriptsInReviewWithOtherTeams])

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
    Promise.all([
      getVideoQueue(token),
      getPackageQueue(token),
      getScriptQueue(token),
      ...SCRIPT_REVIEW_WITH_OTHER_TEAMS_STATUSES.map((status) =>
        listScripts(token, { status, page: 1, limit: 100 }).catch(() => ({
          success: true as const,
          scripts: [] as Script[],
          total: 0,
          page: 1,
          limit: 100,
          totalPages: 0,
        }))
      ),
    ])
      .then(([videoRes, packageRes, scriptRes, ...reviewListRes]) => {
        if (cancelled) return
        const mergedVideos = mergeVideoQueueRows(videoRes)
        setQueueVideos(mergedVideos)
        setVideos(mergedVideos)
        setScriptQueueScripts(mergeScriptQueueRows(scriptRes))
        setScriptsInReviewWithOtherTeams(
          mergeUniqueScriptsById(
            reviewListRes.flatMap((r) => r.scripts ?? [])
          )
        )
        const m = new Map<string, string>()
        const packages = groupQueueVideosIntoPackages(packageRes.videos ?? [])
        for (const p of packages) {
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
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load video queue"
          )
          setQueueVideos([])
          setVideos([])
          setScriptQueueScripts([])
          setScriptsInReviewWithOtherTeams([])
          setFinalPackageIdByScriptId(new Map())
        }
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
            className="flex flex-wrap gap-1"
            role="tablist"
            aria-label="Script list tabs"
          >
            {(
              [
                { key: "script_queue" as TabKey, label: "Script queue" },
                {
                  key: "review_in_progress" as TabKey,
                  label: "Script review in progress",
                },
                { key: "ready_to_upload" as TabKey, label: "Ready to upload" },
                {
                  key: "locked_phase3" as TabKey,
                  label: "Locked scripts",
                },
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
                  "border-b-2 px-3 py-3 text-sm font-medium transition-colors",
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
        ) : queueVideos.length === 0 &&
          scriptQueueScripts.length === 0 &&
          scriptsInReviewWithOtherTeams.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="size-12 text-muted-foreground" />
              <p className="mt-4 font-medium">Nothing in the queues</p>
              <p className="mt-1 text-sm text-muted-foreground">
                When scripts are in production, video and script queue rows appear
                here.
              </p>
            </CardContent>
          </Card>
        ) : tabFilteredScripts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="size-12 text-muted-foreground" />
              <p className="mt-4 font-medium">
                {tab === "script_queue"
                  ? "Nothing in your script queue"
                  : tab === "review_in_progress"
                    ? "No scripts in review with other teams"
                    : tab === "ready_to_upload"
                      ? "No locked scripts ready for First Line Up upload"
                      : "No First Cut rows approved yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tab === "script_queue"
                  ? "Includes scripts at Agency production (new or after rejection), plus first-time and resubmit video uploads (except First Line Up on a locked script — use Ready to upload)."
                  : tab === "review_in_progress"
                    ? "Scripts waiting on Medical Affairs, Content/Brand, or Content Approver (text review) appear here. Video cuts in review are listed under Video production."
                    : tab === "ready_to_upload"
                      ? "Locked scripts with a First Line Up slot waiting for upload are listed here."
                      : tab === "locked_phase3"
                        ? "First Cut rows with status Approved (phase 3 complete for that deliverable) appear here."
                        : "Try another tab or clear search."}
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
              const needsFirstLineUpUpload = scriptNeedsAgencyFirstLineUpUpload(
                script,
                videos
              )
              return (
                <ScriptListingCard
                  key={script.id}
                  script={script}
                  detailHref={`/agency-poc/${script.id}`}
                  authorSubtitle="Agency POC"
                  onCardClick={
                    tab === "review_in_progress"
                      ? undefined
                      : () => router.push(`/agency-poc/${script.id}`)
                  }
                  actions={
                    tab === "review_in_progress" ? null : script.status === "LOCKED" ? (
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
