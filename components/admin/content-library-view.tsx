"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  AlertCircle,
  BarChart3,
  ChevronRight,
  ExternalLink,
  GitBranch,
  LayoutGrid,
  LineChart,
  Loader2,
  Play,
  Search,
  Filter,
  Users,
} from "lucide-react"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import {
  AdminPageHeader,
  AdminSectionTitle,
} from "@/components/admin/admin-page-header"
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
import {
  getAdminContent,
  getPipelineMetrics,
  getRejectionReport,
  getTeamPerformance,
  type AdminContentQuery,
} from "@/lib/admin-api"
import { getAdminContentHref } from "@/lib/admin-content-href"
import { useAuthStore } from "@/store"
import type {
  AdminContentItem,
  AdminContentResponse,
  TeamPerformancePeriod,
  PipelinePeriod,
  TeamPerformanceResponse,
  PipelineResponse,
  RejectionReportPeriod,
  RejectionReportResponse,
} from "@/types/admin"
import { cn } from "@/lib/utils"

const thBase =
  "py-3.5 px-3 text-xs font-medium text-muted-foreground first:pl-4 last:pr-4"

const segmentBtn =
  "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-4"

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
  const [mainTab, setMainTab] = useState<"library" | "analytics">("library")
  const [analyticsSubTab, setAnalyticsSubTab] = useState<
    "doctors" | "specialty" | "rejections"
  >("doctors")
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [phaseFilter, setPhaseFilter] = useState("")
  const [specialtyFilter, setSpecialtyFilter] = useState("")
  const [languageFilter, setLanguageFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [sort, setSort] = useState<AdminContentQuery["sort"]>("newest")
  const [page, setPage] = useState(1)
  const limit = 20

  const [listRes, setListRes] = useState<AdminContentResponse | null>(null)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [teamPeriod, setTeamPeriod] =
    useState<TeamPerformancePeriod>("week")
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [teamData, setTeamData] = useState<TeamPerformanceResponse | null>(
    null
  )

  const [pipePeriod, setPipePeriod] = useState<PipelinePeriod>("month")
  const [pipeLoading, setPipeLoading] = useState(false)
  const [pipeError, setPipeError] = useState<string | null>(null)
  const [pipeData, setPipeData] = useState<PipelineResponse | null>(null)

  const [rejectPeriod, setRejectPeriod] =
    useState<RejectionReportPeriod>("month")
  const [rejectLoading, setRejectLoading] = useState(false)
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [rejectData, setRejectData] = useState<RejectionReportResponse | null>(
    null
  )

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
    specialtyFilter,
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
        specialty: specialtyFilter || undefined,
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
    specialtyFilter,
    languageFilter,
    typeFilter,
    page,
    limit,
    sort,
  ])

  useEffect(() => {
    if (mainTab !== "library") return
    void loadList()
  }, [mainTab, loadList])

  useEffect(() => {
    if (!token || mainTab !== "analytics") return
    let cancelled = false
    setTeamLoading(true)
    setTeamError(null)
    getTeamPerformance(token, teamPeriod)
      .then((d) => {
        if (!cancelled) setTeamData(d)
      })
      .catch((e) => {
        if (!cancelled)
          setTeamError(
            e instanceof Error ? e.message : "Failed to load team stats"
          )
      })
      .finally(() => {
        if (!cancelled) setTeamLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, mainTab, teamPeriod])

  useEffect(() => {
    if (!token || mainTab !== "analytics") return
    let cancelled = false
    setPipeLoading(true)
    setPipeError(null)
    getPipelineMetrics(token, pipePeriod)
      .then((d) => {
        if (!cancelled) setPipeData(d)
      })
      .catch((e) => {
        if (!cancelled)
          setPipeError(
            e instanceof Error ? e.message : "Failed to load pipeline"
          )
      })
      .finally(() => {
        if (!cancelled) setPipeLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, mainTab, pipePeriod])

  useEffect(() => {
    if (!token || mainTab !== "analytics" || analyticsSubTab !== "rejections")
      return
    let cancelled = false
    setRejectLoading(true)
    setRejectError(null)
    getRejectionReport(token, rejectPeriod)
      .then((d) => {
        if (!cancelled) setRejectData(d)
      })
      .catch((e) => {
        if (!cancelled)
          setRejectError(
            e instanceof Error ? e.message : "Failed to load rejection report"
          )
      })
      .finally(() => {
        if (!cancelled) setRejectLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, mainTab, analyticsSubTab, rejectPeriod])

  const filterOptions = listRes?.filterOptions
  const items = listRes?.items ?? []
  const totalPages = listRes?.totalPages ?? 1

  return (
    <AdminPageShell maxWidth="7xl">
      <div className="space-y-8">
        <div className="space-y-5">
          <AdminPageHeader
            title="Content Library"
            description="Browse, filter, and review content — or open analytics when data is connected."
          />
          <div
            className="flex w-full rounded-xl bg-muted/80 p-1 ring-1 ring-border/60 dark:bg-muted/50"
            role="tablist"
            aria-label="Content library view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "library"}
              onClick={() => setMainTab("library")}
              className={cn(
                segmentBtn,
                mainTab === "library"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="size-4 shrink-0 opacity-80" aria-hidden />
              <span className="hidden sm:inline">All content</span>
              <span className="sm:hidden">Browse</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "analytics"}
              onClick={() => setMainTab("analytics")}
              className={cn(
                segmentBtn,
                mainTab === "analytics"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <BarChart3 className="size-4 shrink-0 opacity-80" aria-hidden />
              Analytics
            </button>
          </div>
        </div>

        {mainTab === "library" && (
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
                      value={phaseFilter || "all"}
                      onValueChange={(v) =>
                        setPhaseFilter(v == null || v === "all" ? "" : v)
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder="All phases" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All phases</SelectItem>
                        {(filterOptions?.phases ?? []).map((p) => (
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
                      Specialty
                    </Label>
                    <Select
                      value={specialtyFilter || "all"}
                      onValueChange={(v) =>
                        setSpecialtyFilter(v == null || v === "all" ? "" : v)
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All specialties</SelectItem>
                        {(filterOptions?.specialties ?? []).map((s) => (
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
                      <TableHead
                        className={cn("w-[1%] min-w-[112px] text-right", thBase)}
                      >
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&_tr]:border-border/40">
                    {items.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={6}
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
        )}

        {mainTab === "analytics" && (
          <div className="space-y-8">
            <p className="text-sm text-muted-foreground">
              Team throughput and pipeline conversion (from admin APIs).
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs text-muted-foreground">Team period</Label>
                <Select
                  value={teamPeriod}
                  onValueChange={(v) =>
                    setTeamPeriod((v ?? "week") as TeamPerformancePeriod)
                  }
                >
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs text-muted-foreground">
                  Pipeline period
                </Label>
                <Select
                  value={pipePeriod}
                  onValueChange={(v) =>
                    setPipePeriod((v ?? "month") as PipelinePeriod)
                  }
                >
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="all">All time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mb-4 flex w-full max-w-2xl flex-wrap rounded-xl bg-muted/80 p-1 ring-1 ring-border/60 dark:bg-muted/50">
              <button
                type="button"
                role="tab"
                aria-selected={analyticsSubTab === "doctors"}
                onClick={() => setAnalyticsSubTab("doctors")}
                className={cn(
                  segmentBtn,
                  analyticsSubTab === "doctors"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Users className="size-4 shrink-0 opacity-80" />
                Team performance
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={analyticsSubTab === "specialty"}
                onClick={() => setAnalyticsSubTab("specialty")}
                className={cn(
                  segmentBtn,
                  analyticsSubTab === "specialty"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LineChart className="size-4 shrink-0 opacity-80" />
                Pipeline
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={analyticsSubTab === "rejections"}
                onClick={() => setAnalyticsSubTab("rejections")}
                className={cn(
                  segmentBtn,
                  analyticsSubTab === "rejections"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <AlertCircle className="size-4 shrink-0 opacity-80" />
                Rejections
              </button>
            </div>

            {analyticsSubTab === "doctors" && (
              <div className="space-y-3">
                <AdminSectionTitle>Team performance</AdminSectionTitle>
                {teamError && (
                  <p className="text-sm text-destructive">{teamError}</p>
                )}
                <Card className="overflow-hidden shadow-none">
                  <CardContent className="px-0 pt-0">
                    {teamLoading ? (
                      <div className="p-6">
                        <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="px-4">User</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead className="text-right">Reviews</TableHead>
                            <TableHead className="text-right">Approve</TableHead>
                            <TableHead className="text-right">Reject</TableHead>
                            <TableHead className="text-right">Reject %</TableHead>
                            <TableHead className="text-right">Avg response (h)</TableHead>
                            <TableHead className="px-4 text-right">Pending</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(teamData?.users ?? []).map((u) => (
                            <TableRow key={u.id}>
                              <TableCell className="px-4 font-medium">
                                {u.name}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {u.role}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {u.totalReviews}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {u.approvals}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {u.rejections}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {u.rejectionRate}%
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {u.avgResponseHours != null
                                  ? u.avgResponseHours.toFixed(1)
                                  : "—"}
                              </TableCell>
                              <TableCell className="px-4 text-right tabular-nums">
                                {u.pendingNow}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {analyticsSubTab === "specialty" && (
              <div className="space-y-3">
                <AdminSectionTitle>Pipeline funnel</AdminSectionTitle>
                {pipeError && (
                  <p className="text-sm text-destructive">{pipeError}</p>
                )}
                <Card className="shadow-none">
                  <CardContent className="p-6">
                    {pipeLoading ? (
                      <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
                    ) : pipeData?.funnel ? (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(pipeData.funnel).map(([k, v]) => (
                          <div
                            key={k}
                            className="rounded-lg border border-border bg-muted/30 px-3 py-2"
                          >
                            <p className="text-xs text-muted-foreground">
                              {k}
                            </p>
                            <p className="text-lg font-semibold tabular-nums">
                              {v}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {pipeData?.conversionRates && (
                      <div className="mt-6 space-y-2">
                        <p className="text-sm font-medium">Conversion rates</p>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                          {Object.entries(pipeData.conversionRates).map(
                            ([k, v]) => (
                              <li key={k}>
                                <span className="font-medium text-foreground">
                                  {k}
                                </span>
                                : {v}%
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {analyticsSubTab === "rejections" && (
              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <AdminSectionTitle>Rejection report</AdminSectionTitle>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">
                      Period
                    </Label>
                    <Select
                      value={rejectPeriod}
                      onValueChange={(v) =>
                        setRejectPeriod(
                          (v ?? "month") as RejectionReportPeriod
                        )
                      }
                    >
                      <SelectTrigger className="h-9 w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="week">Week</SelectItem>
                        <SelectItem value="month">Month</SelectItem>
                        <SelectItem value="all">All time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {rejectError && (
                  <p className="text-sm text-destructive">{rejectError}</p>
                )}
                {rejectLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="size-8 animate-spin text-muted-foreground" />
                  </div>
                ) : rejectData?.summary ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          Total rejections
                        </p>
                        <p className="text-lg font-semibold tabular-nums">
                          {rejectData.summary.totalRejections}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          Unique scripts
                        </p>
                        <p className="text-lg font-semibold tabular-nums">
                          {rejectData.summary.uniqueScriptsRejected}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          Avg per script
                        </p>
                        <p className="text-lg font-semibold tabular-nums">
                          {rejectData.summary.avgRejectionsPerScript}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                        <p className="text-xs text-muted-foreground">Period</p>
                        <p className="text-lg font-semibold capitalize">
                          {rejectData.period}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Card className="shadow-none">
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm">By role</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-sm">
                          <ul className="space-y-1">
                            {Object.entries(
                              rejectData.summary.byRole ?? {}
                            ).map(([k, v]) => (
                              <li
                                key={k}
                                className="flex justify-between gap-2 tabular-nums"
                              >
                                <span className="text-muted-foreground">
                                  {k}
                                </span>
                                <span>{v}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                      <Card className="shadow-none">
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm">By stage</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-sm">
                          <ul className="space-y-1">
                            {Object.entries(
                              rejectData.summary.byStage ?? {}
                            ).map(([k, v]) => (
                              <li
                                key={k}
                                className="flex justify-between gap-2 tabular-nums"
                              >
                                <span className="text-muted-foreground">
                                  {k}
                                </span>
                                <span>{v}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    </div>
                    <Card className="overflow-hidden shadow-none">
                      <CardHeader className="border-b border-border bg-muted/30 py-3">
                        <CardTitle className="text-sm">
                          Scripts with most rejections
                        </CardTitle>
                      </CardHeader>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="px-4">Title</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">
                                Rejections
                              </TableHead>
                              <TableHead className="px-4">Last reason</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(rejectData.scripts ?? []).map((s) => (
                              <TableRow key={s.scriptId}>
                                <TableCell className="max-w-72 px-4 font-medium">
                                  {s.title}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {s.currentStatus}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {s.rejections}
                                </TableCell>
                                <TableCell className="max-w-xs truncate px-4 text-xs text-muted-foreground">
                                  {s.lastRejectionReason ?? "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </Card>
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}
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
  const workflowHref = getAdminContentHref(row)
  const detailHref = `/content-library/${encodeURIComponent(row.id)}?contentType=${encodeURIComponent(row.contentType)}`
  const cellPad = "px-3 py-4 first:pl-4 last:pr-4"
  return (
    <TableRow className="border-border/50 transition-colors hover:bg-muted/30">
      <TableCell className={cn("max-w-[min(28rem,55vw)] align-top", cellPad)}>
        <Link
          href={detailHref}
          className="group block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="line-clamp-2 font-medium text-foreground group-hover:text-primary">
            {row.title}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {row.contentType}
            {row.version != null ? ` · v${row.version}` : ""}
          </span>
        </Link>
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
      <TableCell className={cn("align-top", cellPad)}>
        <div className="flex flex-nowrap items-center justify-end gap-0.5">
          {row.contentType === "script" && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              asChild
            >
              <Link
                href={`${detailHref}#admin-timeline`}
                title="Timeline"
                aria-label="Open workflow timeline"
              >
                <GitBranch className="size-4" />
              </Link>
            </Button>
          )}
          {row.fileUrl ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              asChild
            >
              <a
                href={row.fileUrl}
                target="_blank"
                rel="noreferrer"
                title="Preview file"
                aria-label="Preview file in new tab"
              >
                <Play className="size-4" />
              </a>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground opacity-40"
              disabled
              title="No preview"
              aria-label="No preview available"
            >
              <Play className="size-4" />
            </Button>
          )}
          {workflowHref ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              asChild
            >
              <Link
                href={workflowHref}
                title="Open in workflow"
                aria-label="Open in workflow"
              >
                <ExternalLink className="size-4" />
              </Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" className="size-8 shrink-0" asChild>
            <Link
              href={detailHref}
              title="Open details"
              aria-label="Open full details"
            >
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
