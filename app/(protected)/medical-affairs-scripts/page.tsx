"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuthStore } from "@/store"
import { getScriptQueue, getMyReviews } from "@/lib/scripts-api"
import { getScriptDisplayInfo } from "@/lib/script-status-styles"
import type { Script, ScriptStatus } from "@/types/script"
import { ScriptListSkeleton } from "@/components/loading/script-list-skeleton"
import { ScriptTatBar } from "@/components/script-tat-bar"
import { ScriptListPagination } from "@/components/ui/pagination"
import { ArrowRight, FileText, PlusCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10

const STATUS_LABELS: Record<ScriptStatus, string> = {
  DRAFT: "DRAFT",
  CONTENT_BRAND_REVIEW: "CONTENT BRAND REVIEW",
  AGENCY_PRODUCTION: "AGENCY PRODUCTION",
  MEDICAL_REVIEW: "MEDICAL REVIEW",
  CONTENT_BRAND_APPROVAL: "CONTENT BRAND APPROVAL",
  CONTENT_APPROVER_REVIEW: "CONTENT APPROVER REVIEW",
  LOCKED: "LOCKED",
}

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return s
  }
}

type TabKey = "all" | "approved" | "rejected"

export default function MedicalAffairsScriptsPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<TabKey>("all")
  const [scripts, setScripts] = useState<Script[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<ScriptStatus | "">("")
  const [sortBy, setSortBy] = useState<"name" | "dateCreated">("dateCreated")
  const [error, setError] = useState<string | null>(null)

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
    if (tab !== "all" || !statusFilter) return sortedScripts
    return sortedScripts.filter((s) => s.status === statusFilter)
  }, [tab, statusFilter, sortedScripts])

  const displayedScripts = useMemo(() => {
    if (tab !== "all") return filteredSortedScripts
    const start = (page - 1) * PAGE_SIZE
    return filteredSortedScripts.slice(start, start + PAGE_SIZE)
  }, [tab, page, filteredSortedScripts])

  const queuePaginationTotal = filteredSortedScripts.length
  const queueTotalPages = Math.max(1, Math.ceil(queuePaginationTotal / PAGE_SIZE))
  const paginationTotal = tab === "all" ? queuePaginationTotal : total
  const paginationTotalPages = tab === "all" ? queueTotalPages : totalPages

  const isMedicalAffairs = user?.role === "MEDICAL_AFFAIRS"

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
            const combined = [...(res.available ?? []), ...(res.myReviews ?? [])]
            setScripts(combined)
            setTotal(res.total ?? combined.length)
            setTotalPages(Math.max(1, Math.ceil((res.total ?? combined.length) / PAGE_SIZE)))
          }
        })
        .catch((err) => {
          if (!cancelled)
            setError(err instanceof Error ? err.message : "Failed to load scripts")
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
            setError(err instanceof Error ? err.message : "Failed to load scripts")
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    return () => {
      cancelled = true
    }
  }, [token, tab, statusFilter, page])

  if (!isMedicalAffairs) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Access restricted</CardTitle>
            <CardDescription>
              Only Medical Affairs can create and manage scripts here. Use the
              sidebar to go to your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => router.back()}>
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Medical Affairs Scripts
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create scripts and send them to Content/Brand for review. TAT 24
              hours.
            </p>
          </div>
          <Button asChild>
            <Link href="/medical-affairs-scripts/new">
              <PlusCircle className="mr-2 size-4" />
              Create script
            </Link>
          </Button>
        </div>

        <div className="border-b">
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
                onClick={() => { setTab(key); setPage(1) }}
                className={cn(
                  "border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                  tab === key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              Sort by
            </span>
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as "name" | "dateCreated")}
            >
              <SelectTrigger className="min-w-[160px]">
                <SelectValue>{sortBy === "name" ? "Name" : "Date"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="dateCreated">Date</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {tab === "all" && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                Filter by status
              </span>
              <Select
                value={statusFilter || "all"}
              onValueChange={(v) => {
                setStatusFilter(v === "all" ? "" : (v as ScriptStatus))
                setPage(1)
              }}
              >
                <SelectTrigger className="min-w-[200px] lowercase">
                  <SelectValue>
                    {statusFilter ? STATUS_LABELS[statusFilter].toLowerCase() : "All statuses"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="lowercase">
                  <SelectItem value="all" className="text-md">
                    All statuses
                  </SelectItem>
                  {(Object.keys(STATUS_LABELS) as ScriptStatus[]).map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
                {tab === "all" && "No scripts yet"}
                {tab === "approved" && "No scripts you approved"}
                {tab === "rejected" && "No scripts you rejected"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tab === "all" &&
                  "Create your first script to send to Content/Brand for review."}
                {tab === "approved" &&
                  "Scripts you approve in Medical Review will appear here."}
                {tab === "rejected" &&
                  "Scripts you reject in Medical Review will appear here."}
              </p>
              {tab === "all" && (
                <Button asChild className="mt-4">
                  <Link href="/medical-affairs-scripts/new">Create script</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-4">
            {displayedScripts.map((script) => (
              <li key={script.id}>
                <Card className="overflow-hidden shadow-sm transition-shadow hover:shadow-md">
                  <CardContent className="flex flex-col gap-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/medical-affairs-scripts/${script.id}`}
                        className="min-w-0 flex-1 text-xl leading-tight font-semibold hover:underline"
                      >
                        {script.title || "Untitled script"}
                      </Link>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 uppercase",
                          getScriptDisplayInfo(script).className
                        )}
                      >
                        {getScriptDisplayInfo(script).label}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {script.insight || "No insight"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created by Medical Affairs ·{" "}
                      {formatDate(script.createdAt ?? script.updatedAt)}
                    </p>
                    <ScriptTatBar script={script} />
                    {script.status === "DRAFT" && (
                      <Button asChild className="mt-1 w-fit text-blue-500 focus-visible:ring-blue-500/30" variant="outline">
                        <Link
                          href={`/medical-affairs-scripts/${script.id}?submit=1`}
                        >
                          Send to Content/Brand for review
                          <ArrowRight className="ml-2 size-4" />
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {!loading && scripts.length > 0 && (
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
