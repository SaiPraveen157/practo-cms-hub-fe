"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, Filter } from "lucide-react"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { WorkflowStatusBadge } from "@/components/admin/workflow-status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { getAdminContent, type AdminContentQuery } from "@/lib/admin-api"
import { useAuthStore } from "@/store"
import type {
  AdminContentItem,
  AdminContentResponse,
} from "@/types/admin"
import { cn } from "@/lib/utils"

const thBase =
  "py-3.5 px-3 text-xs font-medium text-muted-foreground first:pl-4 last:pr-4"

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

/** Shorter date for dense tables */
function formatDateShort(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

const ADMIN_PHASE_PARAMS = new Set([
  "SCRIPT",
  "FIRST_LINE_UP",
  "FIRST_CUT",
  "FINAL_PACKAGE",
  "LANGUAGE_PACKAGE",
])

export function ContentLibraryView() {
  const token = useAuthStore((s) => s.token)
  const searchParams = useSearchParams()
  const appliedUrlPhase = useRef(false)
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [phaseFilter, setPhaseFilter] = useState("SCRIPT")
  const [languageFilter, setLanguageFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [sort, setSort] = useState<AdminContentQuery["sort"]>("newest")
  const [page, setPage] = useState(1)
  const limit = 20

  const [listRes, setListRes] = useState<AdminContentResponse | null>(null)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  /** Deep links e.g. /content-library?phase=FIRST_LINE_UP from the dashboard. */
  useEffect(() => {
    if (appliedUrlPhase.current) return
    const raw = searchParams.get("phase")?.trim().toUpperCase() ?? ""
    if (raw && ADMIN_PHASE_PARAMS.has(raw)) {
      setPhaseFilter(raw)
      appliedUrlPhase.current = true
    }
  }, [searchParams])

  useEffect(() => {
    setPage(1)
  }, [
    debouncedSearch,
    statusFilter,
    phaseFilter,
    languageFilter,
    typeFilter,
    sort,
  ])

  const loadList = useCallback(async () => {
    if (!token) return
    setListLoading(true)
    setListError(null)
    try {
      const data = await getAdminContent(token, {
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        phase: phaseFilter || undefined,
        language: languageFilter || undefined,
        type: typeFilter || undefined,
        page,
        limit,
        sort: sort ?? "newest",
      })
      setListRes(data)
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load content")
      setListRes(null)
    } finally {
      setListLoading(false)
    }
  }, [
    token,
    debouncedSearch,
    statusFilter,
    phaseFilter,
    languageFilter,
    typeFilter,
    page,
    limit,
    sort,
  ])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const filterOptions = listRes?.filterOptions
  const phaseSelectOptions = useMemo(() => {
    const api = filterOptions?.phases ?? []
    return Array.from(new Set(["SCRIPT", ...api]))
  }, [filterOptions?.phases])
  const items = listRes?.items ?? []
  const totalPages = listRes?.totalPages ?? 1

  return (
    <AdminPageShell maxWidth="7xl">
      <div className="space-y-8">
        <div className="space-y-5">
          <AdminPageHeader
            title="Content Library"
            description="Browse, filter, and review content across phases and types."
          />
        </div>

        <div className="space-y-6">
            <Card className="overflow-hidden border-border/80 shadow-none ring-1 ring-border/60">
              <CardHeader className="space-y-1 border-b border-border/60 px-4 py-3 sm:px-5">
                <CardTitle className="text-sm font-medium tracking-tight">
                  Filters
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Combined with AND. Options reflect your current data.
                </p>
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-end">
                  <div className="space-y-2 lg:col-span-4">
                    <Label
                      htmlFor="search-content"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Search
                    </Label>
                    <div className="relative">
                      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="search-content"
                        placeholder="Title, doctor, package…"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="h-10 pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 lg:col-span-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Phase
                    </Label>
                    <Select
                      value={phaseFilter === "" ? "all" : phaseFilter}
                      onValueChange={(v) =>
                        setPhaseFilter(v == null || v === "all" ? "" : v)
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder="Phase" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All phases</SelectItem>
                        {phaseSelectOptions.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 lg:col-span-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Status
                    </Label>
                    <Select
                      value={statusFilter || "all"}
                      onValueChange={(v) =>
                        setStatusFilter(v == null || v === "all" ? "" : v)
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {(filterOptions?.statuses ?? []).map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 lg:col-span-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Sort
                    </Label>
                    <Select
                      value={sort ?? "newest"}
                      onValueChange={(v) =>
                        setSort((v ?? "newest") as AdminContentQuery["sort"])
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">Newest</SelectItem>
                        <SelectItem value="oldest">Oldest</SelectItem>
                        <SelectItem value="title">Title</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Language
                    </Label>
                    <Select
                      value={languageFilter || "all"}
                      onValueChange={(v) =>
                        setLanguageFilter(v == null || v === "all" ? "" : v)
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All languages</SelectItem>
                        {(filterOptions?.languages ?? []).map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Asset type
                    </Label>
                    <Select
                      value={typeFilter || "all"}
                      onValueChange={(v) =>
                        setTypeFilter(v == null || v === "all" ? "" : v)
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        {(filterOptions?.assetTypes ?? []).map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end lg:col-span-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full gap-2 sm:w-auto"
                      onClick={() => void loadList()}
                    >
                      <Filter className="size-4" />
                      Refresh
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {listError && (
              <Card className="border-destructive/50 bg-destructive/10">
                <CardContent className="py-4 text-sm text-destructive">
                  {listError}
                </CardContent>
              </Card>
            )}

            <Card className="overflow-hidden border-border/80 shadow-none ring-1 ring-border/60">
              <div className="flex flex-col gap-0.5 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <CardTitle className="text-sm font-medium tracking-tight text-foreground">
                  Results
                </CardTitle>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {listLoading
                    ? "Loading…"
                    : `${listRes?.total ?? 0} ${listRes?.total === 1 ? "item" : "items"}`}
                </p>
              </div>
              {listLoading ? (
                <div className="space-y-3 p-4 sm:p-5">
                  <Skeleton className="h-14 w-full rounded-md" />
                  <Skeleton className="h-14 w-full rounded-md" />
                  <Skeleton className="h-14 w-full rounded-md" />
                  <Skeleton className="h-14 w-full rounded-md" />
                </div>
              ) : (
                <Table className="[&_tbody_tr]:border-border/50">
                  <TableHeader>
                    <TableRow className="border-border/60 hover:bg-transparent [&>th]:border-b-0">
                      <TableHead className={cn("min-w-[200px] text-left", thBase)}>
                        Title
                      </TableHead>
                      <TableHead className={cn("min-w-[100px] text-left", thBase)}>
                        Phase
                      </TableHead>
                      <TableHead className={cn("min-w-[120px] text-left", thBase)}>
                        Status
                      </TableHead>
                      <TableHead
                        className={cn("min-w-[140px] max-w-[220px] text-left", thBase)}
                      >
                        Doctor & specialty
                      </TableHead>
                      <TableHead className={cn("min-w-[96px] text-left", thBase)}>
                        Updated
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&_tr]:border-border/40">
                    {items.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={5}
                          className="py-14 text-center text-sm text-muted-foreground"
                        >
                          No results for these filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((row: AdminContentItem) => (
                        <ContentRow
                          key={`${row.contentType}-${row.id}`}
                          row={row}
                        />
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3 sm:px-5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    disabled={page >= totalPages}
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                  >
                    Next
                  </Button>
                </div>
              )}
            </Card>
        </div>
      </div>
    </AdminPageShell>
  )
}

function doctorSpecialtyLine(row: AdminContentItem) {
  const doc = row.doctorName?.trim()
  const spec = row.specialty?.trim()
  if (doc && spec) return `${doc} · ${spec}`
  if (doc) return doc
  if (spec) return spec
  return "—"
}

function ContentRow({ row }: { row: AdminContentItem }) {
  const router = useRouter()
  const detailHref = `/content-library/${encodeURIComponent(row.id)}?contentType=${encodeURIComponent(row.contentType)}`
  const cellPad = "px-3 py-4 first:pl-4 last:pr-4"

  function openInNewTab() {
    window.open(detailHref, "_blank", "noopener,noreferrer")
  }

  function handleClick(e: React.MouseEvent<HTMLTableRowElement>) {
    if (e.button !== 0) return
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      openInNewTab()
      return
    }
    router.push(detailHref)
  }

  function handleAuxClick(e: React.MouseEvent<HTMLTableRowElement>) {
    if (e.button === 1) {
      e.preventDefault()
      openInNewTab()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      router.push(detailHref)
    }
  }

  const titleLabel = row.title?.trim() || "Untitled"

  return (
    <TableRow
      tabIndex={0}
      role="link"
      aria-label={`Open details: ${titleLabel}`}
      className={cn(
        "group cursor-pointer border-border/50 transition-colors",
        "hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
      onClick={handleClick}
      onAuxClick={handleAuxClick}
      onKeyDown={handleKeyDown}
    >
      <TableCell className={cn("max-w-[min(28rem,55vw)] align-top", cellPad)}>
        <div className="block">
          <span className="line-clamp-2 font-medium text-foreground group-hover:text-primary">
            {row.title}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {row.contentType}
            {row.version != null ? ` · v${row.version}` : ""}
          </span>
        </div>
      </TableCell>
      <TableCell
        className={cn(
          "max-w-40 align-top text-sm leading-snug text-muted-foreground",
          cellPad
        )}
      >
        <span className="line-clamp-2">{row.phaseLabel}</span>
      </TableCell>
      <TableCell className={cn("align-top", cellPad)}>
        <WorkflowStatusBadge status={row.status} label={row.statusLabel} />
      </TableCell>
      <TableCell
        className={cn(
          "max-w-[220px] align-top text-sm leading-snug text-muted-foreground whitespace-normal",
          cellPad
        )}
      >
        <span className="line-clamp-2">{doctorSpecialtyLine(row)}</span>
      </TableCell>
      <TableCell
        className={cn(
          "align-top text-sm tabular-nums text-muted-foreground",
          cellPad
        )}
        title={formatDate(row.updatedAt)}
      >
        {formatDateShort(row.updatedAt)}
      </TableCell>
    </TableRow>
  )
}
