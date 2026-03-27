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
import { buildSubmitPackageBodyFromPackage } from "@/lib/build-submit-package-body"
import {
  clearPackageSubmitDraft,
  userMessageForClearDraftFailure,
} from "@/lib/package-submit-draft-idb"
import { getPackageQueue, getPackageStats, submitPackage } from "@/lib/packages-api"
import { getScriptQueue } from "@/lib/scripts-api"
import { getVideoQueue } from "@/lib/videos-api"
import {
  isScriptEligibleForPhase6FinalPackage,
  packageVisibleInAgencyPhase6Workflow,
} from "@/lib/video-phase-gates"
import { filterScriptsBySearch } from "@/lib/script-search"
import {
  agencyPackageNeedsSubmitWizard,
  dedupePackages,
  filterPackagesBySearch,
  splitAgencyPackagesByTab,
} from "@/lib/package-list-utils"
import type { FinalPackage, PackageStatus } from "@/types/package"
import type { Script } from "@/types/script"
import type { Video } from "@/types/video"
import {
  PACKAGE_STATUS_LABELS,
  formatPackageDate,
  packageStatusBadgeClass,
} from "@/lib/package-ui"
import { getScriptDisplayInfo } from "@/lib/script-status-styles"
import { ArrowRight, Loader2, Package, Search, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const PAGE_SIZE = 10

type AgencyTab = "ready" | "active" | "revision" | "approved"

export default function AgencyPocPackagesPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<AgencyTab>("active")
  const [page, setPage] = useState(1)
  const [available, setAvailable] = useState<FinalPackage[]>([])
  const [myReviews, setMyReviews] = useState<FinalPackage[]>([])
  const [lockedScripts, setLockedScripts] = useState<Script[]>([])
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [stats, setStats] = useState<Awaited<
    ReturnType<typeof getPackageStats>
  > | null>(null)
  const [submittingDraftId, setSubmittingDraftId] = useState<string | null>(null)

  const role = user?.role as UserRole | undefined
  const isAgency = role === "AGENCY_POC" || role === "SUPER_ADMIN"

  const load = useCallback(async () => {
    if (!token || !isAgency) return
    setLoading(true)
    setError(null)
    try {
      const [pkgRes, scriptRes, videoRes] = await Promise.all([
        getPackageQueue(token),
        getScriptQueue(token),
        getVideoQueue(token),
      ])
      setAvailable(pkgRes.available ?? [])
      setMyReviews(pkgRes.myReviews ?? [])
      setVideos([
        ...(videoRes.available ?? []),
        ...(videoRes.myReviews ?? []),
      ])
      const scriptsCombined = [
        ...(scriptRes.available ?? []),
        ...(scriptRes.myReviews ?? []),
      ]
      const byId = new Map<string, Script>()
      for (const s of scriptsCombined) {
        if (!byId.has(s.id)) byId.set(s.id, s)
      }
      setLockedScripts(
        [...byId.values()].filter((s) => s.status === "LOCKED")
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load packages")
      setVideos([])
    } finally {
      setLoading(false)
    }
  }, [token, isAgency])

  const handleSubmitDraftFromList = useCallback(
    async (p: FinalPackage) => {
      if (!token) return
      const body = buildSubmitPackageBodyFromPackage(p)
      if (!body) {
        toast.error("Cannot submit from saved files", {
          description:
            "Open the package for details, or use the full wizard if videos, thumbnails, or tags are incomplete.",
        })
        return
      }
      setSubmittingDraftId(p.id)
      try {
        const res = await submitPackage(token, body)
        toast.success(res.message ?? "Package submitted", {
          description: "Medical and Brand parallel review has started.",
        })
        const clearResult = await clearPackageSubmitDraft(p.scriptId)
        if (!clearResult.ok) {
          const { title, description } = userMessageForClearDraftFailure()
          toast.info(title, {
            description,
            id: "package-draft-clear-failed-list",
          })
        }
        router.push(`/agency-poc-packages/${res.package.id}`)
        await load()
      } catch (e) {
        toast.error("Could not submit package", {
          description: e instanceof Error ? e.message : "Submit failed",
        })
      } finally {
        setSubmittingDraftId(null)
      }
    },
    [token, router, load]
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!token || !isAgency) return
    getPackageStats(token).then(setStats).catch(() => setStats(null))
  }, [token, isAgency])

  const combined = useMemo(
    () => dedupePackages([...available, ...myReviews]),
    [available, myReviews]
  )

  /** Hide DRAFT rows until Phase 5 (First Cut) is approved — same rule as POST /api/packages. */
  const combinedVisible = useMemo(
    () =>
      combined.filter((p) =>
        packageVisibleInAgencyPhase6Workflow(p, videos)
      ),
    [combined, videos]
  )

  const scriptIdsWithPackage = useMemo(
    () => new Set(combinedVisible.map((p) => p.scriptId)),
    [combinedVisible]
  )

  const eligibleForFirstSubmit = useMemo(
    () =>
      lockedScripts.filter(
        (s) =>
          !scriptIdsWithPackage.has(s.id) &&
          isScriptEligibleForPhase6FinalPackage(videos, s.id)
      ),
    [lockedScripts, scriptIdsWithPackage, videos]
  )

  const eligibleFiltered = useMemo(
    () => filterScriptsBySearch(eligibleForFirstSubmit, searchQuery),
    [eligibleForFirstSubmit, searchQuery]
  )

  const tabList = useMemo(() => {
    if (tab === "ready") return []
    return splitAgencyPackagesByTab(
      combinedVisible,
      tab as "active" | "revision" | "approved"
    )
  }, [combinedVisible, tab])

  const filtered = useMemo(
    () => filterPackagesBySearch(tabList, searchQuery),
    [tabList, searchQuery]
  )

  const tabCounts = useMemo(
    () => ({
      ready: eligibleForFirstSubmit.length,
      active: splitAgencyPackagesByTab(combinedVisible, "active").length,
      revision: splitAgencyPackagesByTab(combinedVisible, "revision").length,
      approved: splitAgencyPackagesByTab(combinedVisible, "approved").length,
    }),
    [combinedVisible, eligibleForFirstSubmit.length]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const eligibleTotalPages = Math.max(
    1,
    Math.ceil(eligibleFiltered.length / PAGE_SIZE)
  )
  const pageSlice = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])
  const eligiblePageSlice = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return eligibleFiltered.slice(start, start + PAGE_SIZE)
  }, [eligibleFiltered, page])

  if (!isAgency) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Only Agency POC (or Super Admin) can access this area.
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
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Final packages — Phase 6
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the tabs to switch between scripts ready for a first Phase 6
              submission and your in-flight or completed packages.
            </p>
          </div>
        </div>

        {stats && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ["draft", stats.draft, "Draft"],
                ["inReview", stats.inReview, "In review"],
                ["overdue", stats.overdue, "Overdue"],
                ["approved", stats.approved, "Approved"],
                ["rejected", stats.rejected, "Rejected"],
              ] as const
            ).map(([key, val, label]) => (
              <Card key={key}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold">{val}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search eligible scripts and packages by title…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <PackageListTabNav<AgencyTab>
          tabs={
            [
              {
                key: "ready",
                label:
                  tabCounts.ready > 0
                    ? `Ready to submit (${tabCounts.ready})`
                    : "Ready to submit",
              },
              {
                key: "active",
                label:
                  tabCounts.active > 0
                    ? `Active (${tabCounts.active})`
                    : "Active",
              },
              {
                key: "revision",
                label:
                  tabCounts.revision > 0
                    ? `Needs revision (${tabCounts.revision})`
                    : "Needs revision",
              },
              {
                key: "approved",
                label:
                  tabCounts.approved > 0
                    ? `Approved (${tabCounts.approved})`
                    : "Approved",
              },
            ] as const
          }
          active={tab}
          onChange={(k) => {
            setTab(k)
            setPage(1)
          }}
          ariaLabel="Agency final package tabs"
        />

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : tab === "ready" ? (
          eligibleFiltered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-10 text-center">
                <Upload className="size-10 text-muted-foreground" />
                <p className="mt-3 font-medium">Nothing ready to submit</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {eligibleForFirstSubmit.length === 0
                    ? "Phase 6 starts after Phase 5 (First Cut) is approved. Finish First Line Up and First Cut in Video production first, or open Active / Needs revision if you already submitted a package."
                    : "No scripts match your search. Try another keyword."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Only scripts whose First Cut (Phase 5) is approved can submit a
                final package. Pick one to upload Phase 6 assets.
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {eligiblePageSlice.map((s) => (
                  <li key={s.id}>
                    <Phase6EligibleScriptCard script={s} />
                  </li>
                ))}
              </ul>
              {eligibleFiltered.length > PAGE_SIZE && (
                <ScriptListPagination
                  page={page}
                  totalPages={eligibleTotalPages}
                  total={eligibleFiltered.length}
                  limit={PAGE_SIZE}
                  onPageChange={setPage}
                />
              )}
            </>
          )
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <Package className="size-10 text-muted-foreground" />
              <p className="mt-3 font-medium">
                {tab === "revision"
                  ? "No packages waiting on revision"
                  : tab === "approved"
                    ? "No approved packages yet"
                    : "No active packages"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tab === "active" &&
                  "Submit a new package from the Ready to submit tab when you have a locked script."}
                {tab === "revision" &&
                  "When reviewers reject, packages appear here with feedback."}
              </p>
              {tab === "active" && tabCounts.ready > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setTab("ready")
                    setPage(1)
                  }}
                >
                  Go to Ready to submit
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <ul className="space-y-3">
              {pageSlice.map((p) => (
                <li key={p.id}>
                  <PackageRowCard
                    pkg={p}
                    href={`/agency-poc-packages/${p.id}`}
                    draftQuickSubmit={
                      p.status === "DRAFT"
                        ? () => {
                            void handleSubmitDraftFromList(p)
                          }
                        : undefined
                    }
                    draftSubmitting={submittingDraftId === p.id}
                    submitWizardHref={
                      agencyPackageNeedsSubmitWizard(p) &&
                      p.status !== "DRAFT"
                        ? `/agency-poc-packages/new?scriptId=${encodeURIComponent(p.scriptId)}`
                        : undefined
                    }
                    emphasizeFeedback={tab === "revision"}
                  />
                </li>
              ))}
            </ul>
            {filtered.length > PAGE_SIZE && (
              <ScriptListPagination
                page={page}
                totalPages={totalPages}
                total={filtered.length}
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

function Phase6EligibleScriptCard({ script }: { script: Script }) {
  const info = getScriptDisplayInfo(script)
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("text-xs", info.className)}>
              {info.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              v{script.version} · {formatPackageDate(script.updatedAt)}
            </span>
          </div>
          <p className="mt-1 font-medium">
            {script.title || "Untitled script"}
          </p>
          {script.insight ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {script.insight}
            </p>
          ) : null}
        </div>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="mt-auto w-full gap-1 sm:w-auto sm:self-start"
        >
          <Link
            href={`/agency-poc-packages/new?scriptId=${encodeURIComponent(script.id)}`}
          >
            <Upload className="size-4" />
            Submit final package
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function PackageRowCard({
  pkg,
  href,
  draftQuickSubmit,
  draftSubmitting,
  submitWizardHref,
  emphasizeFeedback,
}: {
  pkg: FinalPackage
  href: string
  /** DRAFT: submit with existing server files (POST /api/packages) without opening the wizard. */
  draftQuickSubmit?: () => void
  draftSubmitting?: boolean
  /** Rejection paths: open full wizard. */
  submitWizardHref?: string
  emphasizeFeedback?: boolean
}) {
  const status = pkg.status as PackageStatus
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("text-xs", packageStatusBadgeClass(status))}
            >
              {PACKAGE_STATUS_LABELS[status]}
            </Badge>
            {status === "MEDICAL_REVIEW" ? (
              <span className="text-xs text-muted-foreground">
                Video {pkg.videoTrackStatus} · Metadata{" "}
                {pkg.metadataTrackStatus} · v{pkg.version}
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-medium">{pkg.title}</p>
          <p className="text-sm text-muted-foreground">
            {pkg.script?.title ?? "Script"} ·{" "}
            {status === "MEDICAL_REVIEW"
              ? formatPackageDate(pkg.updatedAt)
              : `v${pkg.version} · ${formatPackageDate(pkg.updatedAt)}`}
          </p>
          {(emphasizeFeedback || status === "REJECTED") &&
            pkg.latestRejection?.overallComments && (
              <div
                className={cn(
                  "mt-2 rounded-md border px-3 py-2 text-xs",
                  emphasizeFeedback
                    ? "border-destructive/50 bg-destructive/5 text-destructive"
                    : "border-border bg-muted/40 text-muted-foreground"
                )}
              >
                <span className="font-medium text-foreground">Feedback: </span>
                <span className="line-clamp-3">
                  {pkg.latestRejection.overallComments}
                </span>
              </div>
            )}
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          {pkg.tat && status !== "REJECTED" && status !== "APPROVED" && (
            <p
              className={cn(
                "text-xs",
                pkg.tat.isOverdue ? "text-destructive" : "text-muted-foreground"
              )}
            >
              TAT {pkg.tat.hoursElapsed}h / {pkg.tat.tatLimitHours}h
              {pkg.tat.isOverdue ? " · Overdue" : ""}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {draftQuickSubmit ? (
              <Button
                type="button"
                size="sm"
                className="shrink-0 gap-1"
                disabled={draftSubmitting}
                onClick={draftQuickSubmit}
              >
                {draftSubmitting ? (
                  <>
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    Submit package
                    <ArrowRight className="size-4 shrink-0" />
                  </>
                )}
              </Button>
            ) : submitWizardHref ? (
              <Button size="sm" asChild className="shrink-0">
                <Link href={submitWizardHref} className="gap-1">
                  Resubmit package
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild className="shrink-0">
              <Link href={href} className="gap-1">
                {status === "REJECTED"
                  ? "Review & resubmit"
                  : draftQuickSubmit || submitWizardHref
                    ? "Details"
                    : "Open"}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
