"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAuthStore } from "@/store"
import { getScriptQueue, getMyReviews, getScriptStats } from "@/lib/scripts-api"
import { filterScriptsBySearch } from "@/lib/script-search"
import type { Script, ScriptStatus, ScriptStatsResponse } from "@/types/script"
import { ScriptListSkeleton } from "@/components/loading/script-list-skeleton"
import { ScriptListingCard } from "@/components/script-listing-card"
import { ScriptListPagination } from "@/components/ui/pagination"
import { ScriptStatsCards } from "@/components/script-stats-cards"
import { FileText, Lock, Search, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10

const STATUS_LABELS: Record<ScriptStatus, string> = {
  DRAFT: "Draft",
  CONTENT_BRAND_REVIEW: "Content/Brand Review",
  AGENCY_PRODUCTION: "Agency Production",
  MEDICAL_REVIEW: "Medical Review",
  CONTENT_BRAND_APPROVAL: "Content/Brand Approval",
  CONTENT_APPROVER_REVIEW: "Content Approver Review",
  LOCKED: "Locked",
}

type TabKey = "all" | "approved" | "rejected"

export default function ContentApproverScriptNewPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<TabKey>("all")
  const [scripts, setScripts] = useState<Script[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<ScriptStatsResponse | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const isContentApprover = user?.role === "CONTENT_APPROVER"

  const searchFilteredScripts = useMemo(
    () => filterScriptsBySearch(scripts, searchQuery),
    [scripts, searchQuery]
  )
  const displayedScripts = useMemo(() => {
    if (tab !== "all") return searchFilteredScripts
    const start = (page - 1) * PAGE_SIZE
    return searchFilteredScripts.slice(start, start + PAGE_SIZE)
  }, [tab, page, searchFilteredScripts])

  const paginationTotal = tab === "all" ? searchFilteredScripts.length : total
  const paginationTotalPages =
    tab === "all"
      ? Math.max(1, Math.ceil(searchFilteredScripts.length / PAGE_SIZE))
      : totalPages

  useEffect(() => {
    if (!token) return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true)
        setError(null)
      }
    })
    if (tab === "all") {
      getScriptQueue(token)
        .then((res) => {
          if (!cancelled) {
            const combined = [
              ...(res.available ?? []),
              ...(res.myReviews ?? []),
            ]
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
    } else {
      getMyReviews(token, {
        decision: tab === "approved" ? "APPROVED" : "REJECTED",
        page,
        limit: PAGE_SIZE,
      })
        .then((res) => {
          if (!cancelled && res.scripts) {
            setScripts(res.scripts)
            setTotal(res.total ?? 0)
            setTotalPages(res.totalPages ?? 1)
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
  }, [token, tab, page])

  useEffect(() => {
    if (!token) return
    getScriptStats(token)
      .then(setStats)
      .catch(() => setStats(null))
  }, [token])

  if (!isContentApprover) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Only Content Approver can access this queue.
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
            Script Approvals
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Final approval authority — Review all content before moving to
            production.
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
              <p className="mt-4 font-medium">
                {tab === "all" && "No scripts to lock"}
                {tab === "approved" && "No scripts you approved"}
                {tab === "rejected" && "No scripts you rejected"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tab === "all" &&
                  "Scripts that have passed Content/Brand final approval will appear here."}
                {tab === "approved" &&
                  "Scripts you locked (approved) will appear here."}
                {tab === "rejected" && "Scripts you rejected will appear here."}
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
            {displayedScripts.map((script) => (
              <ScriptListingCard
                key={script.id}
                script={script}
                detailHref={`/content-approver-script-new/${script.id}`}
                authorSubtitle="Content Creator"
                onCardClick={() =>
                  router.push(`/content-approver-script-new/${script.id}`)
                }
                actions={
                  tab === "approved" ? null : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        asChild
                        size="sm"
                        className="gap-1.5 bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/content-approver-script-new/${script.id}`}>
                          <Lock className="size-4 shrink-0" />
                          Final Approve
                        </Link>
                      </Button>
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-500 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/content-approver-script-new/${script.id}`}>
                          <XCircle className="size-4 shrink-0" />
                          Reject
                        </Link>
                      </Button>
                    </div>
                  )
                }
              />
            ))}
          </div>
        )}

        {!loading && searchFilteredScripts.length > 0 && (
          <ScriptListPagination
            page={page}
            totalPages={paginationTotalPages}
            total={paginationTotal}
            limit={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  )
}
