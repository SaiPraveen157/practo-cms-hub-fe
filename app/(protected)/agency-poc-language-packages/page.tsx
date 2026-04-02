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
import { getPackageByScriptId } from "@/lib/packages-api"
import {
  getLanguagePackageQueue,
  getLanguagePackageStats,
  getLanguagePackagesByScriptId,
} from "@/lib/language-packages-api"
import { getScriptQueue } from "@/lib/scripts-api"
import {
  englishFinalPackageHasApprovedVideo,
  isScriptEligibleForPhase7LanguageSubmit,
} from "@/lib/language-phase-gates"
import { filterScriptsBySearch } from "@/lib/script-search"
import {
  dedupeLanguagePackages,
  filterLanguagePackagesBySearch,
  splitAgencyLanguagePackagesByTab,
  aggregateLanguagePackageRowStatus,
  groupLanguageQueueVideosIntoPackages,
} from "@/lib/language-list-utils"
import type { FinalPackage } from "@/types/package"
import type { LanguagePackage } from "@/types/language-package"
import type { Script } from "@/types/script"
import {
  formatLanguageLabel,
  languageVideoStatusBadgeClass,
  LANGUAGE_VIDEO_STATUS_LABELS,
  PHASE_7_CREATE_LANGUAGES,
} from "@/lib/language-package-ui"
import { formatPackageDate } from "@/lib/package-ui"
import { getScriptDisplayInfo } from "@/lib/script-status-styles"
import { ArrowRight, Loader2, Languages, Search, Upload } from "lucide-react"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10

type AgencyTab = "ready" | "active" | "revision" | "approved"

export default function AgencyPocLanguagePackagesPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<AgencyTab>("active")
  const [page, setPage] = useState(1)
  const [packages, setPackages] = useState<LanguagePackage[]>([])
  const [lockedScripts, setLockedScripts] = useState<Script[]>([])
  const [englishByScript, setEnglishByScript] = useState<
    Map<string, FinalPackage | null>
  >(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [stats, setStats] = useState<Record<string, number> | null>(null)

  const role = user?.role as UserRole | undefined
  const isAgency = role === "AGENCY_POC" || role === "SUPER_ADMIN"

  const load = useCallback(async () => {
    if (!token || !isAgency) return
    setLoading(true)
    setError(null)
    try {
      const [scriptRes, queueRes] = await Promise.all([
        getScriptQueue(token),
        getLanguagePackageQueue(token),
      ])
      const scriptsCombined = [
        ...(scriptRes.available ?? []),
        ...(scriptRes.myReviews ?? []),
      ]
      const byId = new Map<string, Script>()
      for (const s of scriptsCombined) {
        if (!byId.has(s.id)) byId.set(s.id, s)
      }
      const locked = [...byId.values()].filter((s) => s.status === "LOCKED")

      const englishResults = await Promise.allSettled(
        locked.map((s) => getPackageByScriptId(token, s.id))
      )
      const englishMap = new Map<string, FinalPackage | null>()
      locked.forEach((s, i) => {
        const r = englishResults[i]
        if (r.status === "fulfilled") {
          englishMap.set(s.id, r.value.package)
        } else {
          englishMap.set(s.id, null)
        }
      })

      const langResults = await Promise.allSettled(
        locked.map((s) => getLanguagePackagesByScriptId(token, s.id))
      )
      const fromScripts: LanguagePackage[] = []
      langResults.forEach((r, i) => {
        if (r.status !== "fulfilled") return
        const script = locked[i]
        for (const p of r.value.data ?? []) {
          fromScripts.push({
            ...p,
            script: p.script ?? {
              id: script.id,
              title: script.title ?? "",
              status: script.status,
              version: script.version,
            },
          })
        }
      })

      const fromQueue = groupLanguageQueueVideosIntoPackages(
        queueRes.videos ?? []
      )
      const merged = dedupeLanguagePackages([...fromQueue, ...fromScripts])

      setPackages(merged)
      setEnglishByScript(englishMap)
      setLockedScripts(locked)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
      setPackages([])
    } finally {
      setLoading(false)
    }
  }, [token, isAgency])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!token || !isAgency) return
    getLanguagePackageStats(token)
      .then((r) => {
        const d = r.data ?? (r as { stats?: Record<string, number> }).stats
        setStats(d && typeof d === "object" ? d : null)
      })
      .catch(() => setStats(null))
  }, [token, isAgency])

  const eligibleForFirstSubmit = useMemo(() => {
    return lockedScripts.filter((s) => {
      const eng = englishByScript.get(s.id) ?? null
      return isScriptEligibleForPhase7LanguageSubmit(s.status, eng)
    })
  }, [lockedScripts, englishByScript])

  const tabList = useMemo(() => {
    if (tab === "ready") return []
    return splitAgencyLanguagePackagesByTab(
      packages,
      tab as "active" | "revision" | "approved"
    )
  }, [packages, tab])

  const filtered = useMemo(
    () => filterLanguagePackagesBySearch(tabList, searchQuery),
    [tabList, searchQuery]
  )

  const tabCounts = useMemo(
    () => ({
      ready: eligibleForFirstSubmit.length,
      active: splitAgencyLanguagePackagesByTab(packages, "active").length,
      revision: splitAgencyLanguagePackagesByTab(packages, "revision").length,
      approved: splitAgencyLanguagePackagesByTab(packages, "approved").length,
    }),
    [packages, eligibleForFirstSubmit.length]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const eligibleFiltered = useMemo(
    () => filterScriptsBySearch(eligibleForFirstSubmit, searchQuery),
    [eligibleForFirstSubmit, searchQuery]
  )
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

  function existingLangsForScript(scriptId: string): string[] {
    const set = new Set<string>()
    for (const p of packages) {
      if (p.scriptId === scriptId && p.language) {
        set.add(String(p.language).toUpperCase())
      }
    }
    return [...set]
  }

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
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Language packages — Phase 7
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload localized videos per script after the English final package
            has an approved deliverable. Each language is its own package.
          </p>
        </div>

        {stats && Object.keys(stats).length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["BRAND_REVIEW", "Content/Brand review"],
                ["AWAITING_APPROVER", "Final approval"],
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

        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by package name, language, or script…"
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
          ariaLabel="Agency language package tabs"
        />

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : tab === "ready" ? (
          eligibleFiltered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-10 text-center">
                <Languages className="size-10 text-muted-foreground" />
                <p className="mt-3 font-medium">Nothing ready to submit</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {eligibleForFirstSubmit.length === 0
                    ? "Phase 7 opens when the script is locked and at least one English final-package video is approved. Complete Phase 6 first."
                    : "No scripts match your search."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Target languages:{" "}
                {PHASE_7_CREATE_LANGUAGES.map((l) => formatLanguageLabel(l)).join(
                  ", "
                )}
                . You can add one package per language per script (avoid
                duplicates).
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {eligiblePageSlice.map((s) => (
                  <li key={s.id}>
                    <Phase7EligibleScriptCard
                      script={s}
                      existingLangs={existingLangsForScript(s.id)}
                      englishOk={englishFinalPackageHasApprovedVideo(
                        englishByScript.get(s.id) ?? null
                      )}
                    />
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
              <Languages className="size-10 text-muted-foreground" />
              <p className="mt-3 font-medium">
                {tab === "revision"
                  ? "No packages waiting on revision"
                  : tab === "approved"
                    ? "No completed language packages yet"
                    : "No active language packages"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tab === "active" &&
                  "Create a localized package from Ready to submit when eligible."}
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
              {pageSlice.map((p) => {
                const rowStatus = aggregateLanguagePackageRowStatus(p)
                return (
                  <li key={p.id}>
                    <Card>
                      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
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
                              {formatLanguageLabel(String(p.language))}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {p.videos?.length ?? 0} video
                              {(p.videos?.length ?? 0) === 1 ? "" : "s"} · Updated{" "}
                              {formatPackageDate(p.updatedAt)}
                            </span>
                          </div>
                          <p className="mt-1 font-medium">{p.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {p.script?.title ?? "Script"}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" asChild>
                          <Link
                            href={`/agency-poc-language-packages/${p.id}`}
                            className="gap-1"
                          >
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

function Phase7EligibleScriptCard({
  script,
  existingLangs,
  englishOk,
}: {
  script: Script
  existingLangs: string[]
  englishOk: boolean
}) {
  const info = getScriptDisplayInfo(script)
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("text-xs", info.className)}>
              {info.label}
            </Badge>
            {englishOk ? (
              <Badge
                variant="outline"
                className="border-green-500/50 bg-green-500/10 text-xs text-green-800 dark:text-green-200"
              >
                English approved
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 font-medium">
            {script.title || "Untitled script"}
          </p>
          {existingLangs.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Already added:{" "}
              {existingLangs.map((l) => formatLanguageLabel(l)).join(", ")}
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
            href={`/agency-poc-language-packages/new?scriptId=${encodeURIComponent(script.id)}`}
          >
            <Upload className="size-4" />
            New language package
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
