"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuthStore } from "@/store"
import { getScriptQueue, getMyReviews, getScriptStats } from "@/lib/scripts-api"
import { filterScriptsBySearch } from "@/lib/script-search"
import {
  pendingStatusOptionsForPhase,
  scriptInPhaseTab,
  type PhaseTabKey,
} from "@/lib/script-workflow-phase"
import { STATUS_DISPLAY_LABELS } from "@/lib/script-status-styles"
import type { Script, ScriptStatsResponse, ScriptStatus } from "@/types/script"
import { ScriptListSkeleton } from "@/components/loading/script-list-skeleton"
import { ScriptListingCard } from "@/components/script-listing-card"
import { ScriptListPagination } from "@/components/ui/pagination"
import { ScriptStatsCards } from "@/components/script-stats-cards"
import { CheckCircle, FileText, Filter, Search, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10
const MY_REVIEWS_FETCH_LIMIT = 500

type TabKey = "pending" | "approved" | "rejected"

function dedupeScriptsById(scripts: Script[]): Script[] {
  const seen = new Set<string>()
  const out: Script[] = []
  for (const s of scripts) {
    if (seen.has(s.id)) continue
    seen.add(s.id)
    out.push(s)
  }
  return out
}

function isPendingContentBrandScript(s: Script): boolean {
  return (
    s.status === "CONTENT_BRAND_REVIEW" ||
    s.status === "CONTENT_BRAND_APPROVAL"
  )
}

export default function ContentBrandReviewerPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [phaseTab, setPhaseTab] = useState<PhaseTabKey>("phase12")
  const [tab, setTab] = useState<TabKey>("pending")
  const [scripts, setScripts] = useState<Script[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<ScriptStatus | "">("")
  const [sortBy, setSortBy] = useState<"name" | "dateCreated">("dateCreated")
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<ScriptStatsResponse | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const isContentBrand = user?.role === "CONTENT_BRAND"

  const sortedScripts = useMemo(() => {
    const list = [...scripts]
    if (sortBy === "name") {
      list.sort((a, b) => {
        const na = (a.title || "Untitled script").toLowerCase()
        const nb = (b.title || "Untitled script").toLowerCase()
        return na.localeCompare(nb)
      })
    } else {
      list.sort((a, b) => {
        const da = new Date(a.createdAt ?? a.updatedAt).getTime()
        const db = new Date(b.createdAt ?? b.updatedAt).getTime()
        return db - da
      })
    }
    return list
  }, [scripts, sortBy])

  const filteredSortedScripts = useMemo(() => {
    if (tab !== "pending" || !statusFilter) return sortedScripts
    return sortedScripts.filter((s) => s.status === statusFilter)
  }, [tab, statusFilter, sortedScripts])

  const searchFilteredScripts = useMemo(
    () => filterScriptsBySearch(filteredSortedScripts, searchQuery),
    [filteredSortedScripts, searchQuery]
  )

  const paginationTotal = searchFilteredScripts.length
  const paginationTotalPages = Math.max(
    1,
    Math.ceil(paginationTotal / PAGE_SIZE)
  )

  const displayedScripts = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return searchFilteredScripts.slice(start, start + PAGE_SIZE)
  }, [page, searchFilteredScripts])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setScripts([])
    if (tab === "pending") {
      getScriptQueue(token)
        .then((res) => {
          if (!cancelled) {
            const merged = dedupeScriptsById([
              ...(res.available ?? []),
              ...(res.myReviews ?? []),
            ])
            const rows = merged.filter(
              (s) =>
                isPendingContentBrandScript(s) &&
                scriptInPhaseTab(s, phaseTab)
            )
            setScripts(rows)
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
    } else {
      getMyReviews(token, {
        decision: tab === "approved" ? "APPROVED" : "REJECTED",
        page: 1,
        limit: MY_REVIEWS_FETCH_LIMIT,
      })
        .then((res) => {
          if (!cancelled) {
            const raw = res.scripts ?? []
            setScripts(raw.filter((s) => scriptInPhaseTab(s, phaseTab)))
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
    }
    return () => {
      cancelled = true
    }
  }, [token, tab, phaseTab])

  useEffect(() => {
    if (!token) return
    getScriptStats(token)
      .then(setStats)
      .catch(() => setStats(null))
  }, [token])

  useEffect(() => {
    const allowed = pendingStatusOptionsForPhase(phaseTab)
    if (statusFilter && !allowed.includes(statusFilter)) {
      setStatusFilter("")
    }
  }, [phaseTab, statusFilter])

  if (!isContentBrand) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Only Content/Brand can access this review queue.
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
            Content/Brand Review
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the phase tabs to separate early script review (phases 1–2) from
            agency script production and final approvals (phase 3). Pending
            lists scripts that need your review or approval. TAT 24 hours.
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
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as "name" | "dateCreated")}
            >
              <SelectTrigger className="h-10 w-[140px]">
                <SelectValue>{sortBy === "name" ? "Name" : "Date"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="dateCreated">Date</SelectItem>
              </SelectContent>
            </Select>
            {tab === "pending" && (
              <Select
                value={statusFilter || "all"}
                onValueChange={(v) => {
                  setStatusFilter(v === "all" ? "" : (v as ScriptStatus))
                  setPage(1)
                }}
              >
                <SelectTrigger
                  className="h-10 min-w-[160px] sm:w-[180px]"
                  aria-label="Filter by status"
                >
                  <Filter className="mr-1.5 size-4 shrink-0" />
                  <SelectValue>
                    {statusFilter
                      ? STATUS_DISPLAY_LABELS[statusFilter]
                      : "Filter"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All in queue</SelectItem>
                  {pendingStatusOptionsForPhase(phaseTab).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_DISPLAY_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="w-full border-b border-border">
          <nav
            className="flex w-full items-stretch"
            role="tablist"
            aria-label="Workflow phase"
          >
            {(
              [
                {
                  key: "phase12" as const,
                  label: "Phases 1 & 2",
                  description: "Script creation & Content/Brand",
                },
                {
                  key: "phase3" as const,
                  label: "Phase 3",
                  description: "Agency script production",
                },
              ] as const
            ).map(({ key, label, description }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={phaseTab === key}
                onClick={() => {
                  setPhaseTab(key)
                  setPage(1)
                  setStatusFilter("")
                }}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center border-b-2 px-2 py-3 text-center transition-colors sm:px-4",
                  phaseTab === key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="text-sm font-medium">{label}</span>
                <span className="mt-0.5 hidden text-xs font-normal opacity-80 sm:block">
                  {description}
                </span>
              </button>
            ))}
          </nav>
        </div>

        <div className="w-full border-b border-border">
          <nav
            className="flex w-full items-stretch"
            role="tablist"
            aria-label="Script list tabs"
          >
            {(
              [
                { key: "pending" as TabKey, label: "Pending" },
                { key: "approved" as TabKey, label: "Approved" },
                { key: "rejected" as TabKey, label: "Rejected" },
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
                  setStatusFilter("")
                }}
                className={cn(
                  "min-w-0 flex-1 border-b-2 px-2 py-2.5 text-center text-sm font-medium transition-colors sm:px-4",
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
              <p className="mt-4 font-medium">
                {tab === "pending" &&
                  (phaseTab === "phase12"
                    ? "Nothing in phases 1–2 for you right now"
                    : "Nothing in agency script production for you right now")}
                {tab === "approved" &&
                  (phaseTab === "phase12"
                    ? "No approved scripts in phases 1–2 here"
                    : "No approved scripts in phase 3 here")}
                {tab === "rejected" &&
                  (phaseTab === "phase12"
                    ? "No rejected scripts in phases 1–2 here"
                    : "No rejected scripts in phase 3 here")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tab === "pending" &&
                  phaseTab === "phase12" &&
                  "Scripts in Content/Brand Review (Medical Affairs draft) appear here when they need you."}
                {tab === "pending" &&
                  phaseTab === "phase3" &&
                  "Content/Brand Approval and other phase-3 steps you own appear here."}
                {tab === "approved" &&
                  phaseTab === "phase12" &&
                  "Approvals from early Content/Brand review stages show here when applicable."}
                {tab === "approved" &&
                  phaseTab === "phase3" &&
                  "Scripts you approved in Content/Brand Approval or related phase-3 review appear here."}
                {tab === "rejected" &&
                  phaseTab === "phase12" &&
                  "Rejections from early review stages show here when applicable."}
                {tab === "rejected" &&
                  phaseTab === "phase3" &&
                  "Scripts you rejected in phase-3 review appear here."}
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
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {displayedScripts.map((script) => (
                <ScriptListingCard
                  key={script.id}
                  script={script}
                  detailHref={`/content-brand-reviewer/${script.id}`}
                  authorSubtitle="Content Creator"
                  onCardClick={() =>
                    router.push(`/content-brand-reviewer/${script.id}`)
                  }
                  actions={
                    tab === "pending" ? (
                      <>
                        <Button
                          asChild
                          size="sm"
                          className="gap-1.5 bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={`/content-brand-reviewer/${script.id}`}>
                            <CheckCircle className="size-4 shrink-0" />
                            {script.status === "CONTENT_BRAND_APPROVAL"
                              ? "Approve"
                              : "Review"}
                          </Link>
                        </Button>
                        <Button
                          asChild
                          size="sm"
                          variant="destructive"
                          className="gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={`/content-brand-reviewer/${script.id}`}>
                            <XCircle className="size-4 shrink-0" />
                            Reject
                          </Link>
                        </Button>
                      </>
                    ) : null
                  }
                />
              ))}
            </div>
            {!loading && searchFilteredScripts.length > 0 && (
              <ScriptListPagination
                page={page}
                totalPages={paginationTotalPages}
                total={paginationTotal}
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
