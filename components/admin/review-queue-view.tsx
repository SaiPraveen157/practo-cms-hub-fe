"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ClipboardList,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { WorkflowStatusBadge } from "@/components/admin/workflow-status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getAdminContent } from "@/lib/admin-api"
import { getAdminContentHref } from "@/lib/admin-content-href"
import { isAdminContentPendingReview } from "@/lib/pending-review-filter"
import { useAuthStore } from "@/store"
import type { AdminContentItem } from "@/types/admin"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25
const FETCH_LIMIT = 100
const MAX_PAGES = 40

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

async function fetchAllAdminContentItems(token: string): Promise<{
  items: AdminContentItem[]
  pagesFetched: number
  truncated: boolean
}> {
  const first = await getAdminContent(token, {
    page: 1,
    limit: FETCH_LIMIT,
    sort: "newest",
  })
  let items = [...first.items]
  const totalPages = first.totalPages ?? 1
  const pagesToFetch = Math.min(totalPages, MAX_PAGES)
  const truncated = totalPages > MAX_PAGES

  if (pagesToFetch > 1) {
    const pageRequests: Promise<typeof first>[] = []
    for (let p = 2; p <= pagesToFetch; p++) {
      pageRequests.push(
        getAdminContent(token, {
          page: p,
          limit: FETCH_LIMIT,
          sort: "newest",
        })
      )
    }
    const rest = await Promise.all(pageRequests)
    for (const r of rest) {
      items = items.concat(r.items)
    }
  }

  return { items, pagesFetched: pagesToFetch, truncated }
}

export function ReviewQueueView() {
  const token = useAuthStore((s) => s.token)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rawItems, setRawItems] = useState<AdminContentItem[]>([])
  const [meta, setMeta] = useState<{
    pagesFetched: number
    truncated: boolean
  } | null>(null)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { items, pagesFetched, truncated } =
        await fetchAllAdminContentItems(token)
      setRawItems(items)
      setMeta({ pagesFetched, truncated })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load review queue")
      setRawItems([])
      setMeta(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const pending = useMemo(
    () => rawItems.filter(isAdminContentPendingReview),
    [rawItems]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return pending
    return pending.filter((row) => {
      const hay = [
        row.title,
        row.phaseLabel,
        row.statusLabel,
        row.doctorName,
        row.specialty,
        row.packageName,
        row.contentType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [pending, search])

  useEffect(() => {
    setPage(1)
  }, [search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  return (
    <AdminPageShell maxWidth="7xl">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <AdminPageHeader
            title="Review queue"
            description="Scripts and videos (and package / language deliverables) that are still waiting on a review or approval step somewhere in the workflow."
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-2"
            disabled={loading || !token}
            onClick={() => void load()}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {meta?.truncated && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Showing pending items from the first {meta.pagesFetched} pages of
            admin content ({FETCH_LIMIT} rows per page). Refine backend filters
            if you need the full corpus.
          </p>
        )}

        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="py-4 text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {filtered.length}
              </span>{" "}
              pending for review
              {pending.length !== rawItems.length ? (
                <span className="text-muted-foreground">
                  {" "}
                  (of {rawItems.length} loaded rows)
                </span>
              ) : null}
            </p>
            <div className="relative max-w-sm flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search title, phase, status…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9"
              />
            </div>
          </div>
        )}

        <Card className="overflow-hidden border-border/80 shadow-none ring-1 ring-border/60">
          <CardContent className="px-0 py-0">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            ) : pageItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
                <ClipboardList className="size-12 text-muted-foreground" />
                <p className="mt-4 font-medium text-foreground">
                  {filtered.length === 0 && pending.length === 0
                    ? "Nothing pending for review"
                    : "No matches"}
                </p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {filtered.length === 0 && pending.length === 0
                    ? "All loaded script and video items are in a draft, locked, agency-only, or fully approved state."
                    : "Try a different search term."}
                </p>
              </div>
            ) : (
              <Table className="[&_tbody_tr]:border-border/50">
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/60">
                    <TableHead className="px-4 py-3.5 text-xs font-medium text-muted-foreground">
                      Title
                    </TableHead>
                    <TableHead className="py-3.5 text-xs font-medium text-muted-foreground">
                      Type
                    </TableHead>
                    <TableHead className="py-3.5 text-xs font-medium text-muted-foreground">
                      Phase
                    </TableHead>
                    <TableHead className="py-3.5 text-xs font-medium text-muted-foreground">
                      Status
                    </TableHead>
                    <TableHead className="py-3.5 text-xs font-medium text-muted-foreground">
                      Updated
                    </TableHead>
                    <TableHead className="px-4 py-3.5 text-right text-xs font-medium text-muted-foreground">
                      Open
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr]:border-border/40">
                  {pageItems.map((row) => {
                    const detailHref = `/content-library/${encodeURIComponent(row.id)}?contentType=${encodeURIComponent(row.contentType)}`
                    const workflowHref = getAdminContentHref(row)
                    return (
                      <TableRow key={`${row.contentType}-${row.id}`}>
                        <TableCell className="max-w-xs px-4 py-4 align-middle">
                          <Link
                            href={detailHref}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {row.title}
                          </Link>
                          {row.doctorName || row.specialty ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {[row.doctorName, row.specialty]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="py-4 align-middle text-sm text-muted-foreground capitalize">
                          {row.contentType}
                        </TableCell>
                        <TableCell className="max-w-40 py-4 align-middle text-sm text-muted-foreground">
                          <span className="line-clamp-2">{row.phaseLabel}</span>
                        </TableCell>
                        <TableCell className="py-4 align-middle">
                          <WorkflowStatusBadge
                            status={row.status}
                            label={row.statusLabel}
                          />
                        </TableCell>
                        <TableCell className="py-4 align-middle text-xs text-muted-foreground tabular-nums">
                          {formatWhen(row.updatedAt)}
                        </TableCell>
                        <TableCell className="px-4 py-4 align-middle">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={detailHref}>Details</Link>
                            </Button>
                            {workflowHref ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1"
                                asChild
                              >
                                <Link href={workflowHref}>
                                  Workflow
                                  <ExternalLink className="size-3.5 opacity-70" />
                                </Link>
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </AdminPageShell>
  )
}
