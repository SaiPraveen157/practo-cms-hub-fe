"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  LayoutList,
  Loader2,
  Package,
  Video as VideoIcon,
  Globe,
  FileText,
} from "lucide-react"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { WorkflowStatusBadge } from "@/components/admin/workflow-status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getScriptTimeline } from "@/lib/admin-api"
import { getLanguagePackagesByScriptId } from "@/lib/language-packages-api"
import { getPackageByScriptId } from "@/lib/packages-api"
import { getScript } from "@/lib/scripts-api"
import { getVideo, getVideoQueue } from "@/lib/videos-api"
import { getPackageVideo } from "@/lib/packages-api"
import { getLanguagePackageVideo } from "@/lib/language-packages-api"
import { useAuthStore } from "@/store"
import type { ScriptTimelineResponse, ScriptTimelineEntry } from "@/types/admin"
import type { Script } from "@/types/script"
import type { Video } from "@/types/video"
import type { FinalPackage, PackageVideo } from "@/types/package"
import type { LanguagePackage, LanguageVideo } from "@/types/language-package"
import { cn } from "@/lib/utils"

/** Shared detail-page card shell (matches content library / timeline). */
const shellCard =
  "overflow-hidden border-border/80 shadow-none ring-1 ring-border/60"
const shellHead =
  "border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-5"
const shellTitle = "text-sm font-medium tracking-tight text-foreground"

function phaseVideoLabel(phase: string) {
  const p = phase.toUpperCase()
  if (p === "FIRST_LINE_UP") return "First line up"
  if (p === "FIRST_CUT") return "First cut"
  return phase.replace(/_/g, " ")
}

/** Dedupe by video id — queue merges available, myReviews, pendingUpload. */
function videosForScriptFromQueue(
  queue: {
    available?: Video[]
    myReviews?: Video[]
    pendingUpload?: Video[]
  },
  scriptId: string
): Video[] {
  const raw = [
    ...(queue.available ?? []),
    ...(queue.myReviews ?? []),
    ...(queue.pendingUpload ?? []),
  ]
  const seen = new Set<string>()
  const out: Video[] = []
  for (const v of raw) {
    if (v.scriptId !== scriptId) continue
    if (seen.has(v.id)) continue
    seen.add(v.id)
    out.push(v)
  }
  return out
}

/** FLU before FC; newer version first within same phase. */
function sortFluFcVideos(videos: Video[]): Video[] {
  const rank = (phase: string) => {
    const p = phase.toUpperCase()
    if (p === "FIRST_LINE_UP") return 0
    if (p === "FIRST_CUT") return 1
    return 2
  }
  return [...videos].sort((a, b) => {
    const dr = rank(a.phase) - rank(b.phase)
    if (dr !== 0) return dr
    return b.version - a.version
  })
}

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

function formatTimelineDate(iso: string) {
  try {
    const d = new Date(iso)
    return {
      date: d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      time: d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }),
    }
  } catch {
    return { date: iso, time: "" }
  }
}

export function TimelineBlock({
  data,
  hideRelatedSummaries = false,
  compactHeader = false,
  defaultExpanded = true,
}: {
  data: ScriptTimelineResponse
  /** When true, only the audit timeline is shown (no duplicate FLU/FC / package summaries). */
  hideRelatedSummaries?: boolean
  /** Smaller heading — use on script hub page where the title is already in the hero. */
  compactHeader?: boolean
  /** When false, the timeline body starts collapsed (header + expand control still visible). */
  defaultExpanded?: boolean
}) {
  const steps = data.timeline
  return (
    <div id="admin-timeline" className="scroll-mt-24 space-y-3">
      <Collapsible defaultOpen={defaultExpanded}>
        <CollapsibleTrigger
          className={cn(
            "group flex w-full items-start gap-3 rounded-lg border border-border/80 bg-muted/10 px-4 py-3 text-left sm:px-5",
            "transition-colors hover:bg-muted/20",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            !compactHeader && "sm:items-end"
          )}
        >
          <ChevronDown
            className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-panel-open:rotate-180 sm:mt-0"
            aria-hidden
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p
              className={cn(
                "font-medium text-muted-foreground",
                compactHeader
                  ? "text-[11px] font-semibold uppercase tracking-wide"
                  : "text-xs"
              )}
            >
              Workflow timeline
            </p>
            {!compactHeader ? (
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {data.title}
              </h2>
            ) : (
              <p className="text-sm text-muted-foreground">
                Who did what — approvals, rejections, and status changes (read
                bottom-up for latest).
              </p>
            )}
          </div>
          <WorkflowStatusBadge
            status={data.currentStatus}
            className="shrink-0 self-center sm:self-auto"
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-3 data-ending-style:mt-0">
      <Card className={shellCard}>
        <CardHeader className={shellHead}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2">
              <p className="text-[11px] font-medium text-muted-foreground">
                Version
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {data.currentVersion}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2">
              <p className="text-[11px] font-medium text-muted-foreground">
                Steps
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {data.totalSteps}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2">
              <p className="text-[11px] font-medium text-muted-foreground">
                Span
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {data.totalDays}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  days
                </span>
              </p>
            </div>
            <div className="col-span-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2 sm:col-span-1">
              <p className="text-[11px] font-medium text-muted-foreground">
                Created by
              </p>
              <p className="mt-0.5 truncate text-sm font-medium">
                {data.createdBy}
              </p>
            </div>
          </div>
          {data.lockedBy != null && data.lockedAt != null && (
            <p className="mt-3 text-xs text-muted-foreground">
              Locked by{" "}
              <span className="font-medium text-foreground">{data.lockedBy}</span>{" "}
              · {formatWhen(data.lockedAt)}
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-6 p-4 sm:p-5">
          {!hideRelatedSummaries && data.videos.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <VideoIcon className="size-4 text-muted-foreground" aria-hidden />
                <CardTitle className="text-sm font-medium">
                  Related videos
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-normal">
                  Phases 4–5
                </Badge>
              </div>
              <ul className="divide-y divide-border/60 rounded-lg border border-border/60 bg-muted/10">
                {data.videos.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm first:rounded-t-lg last:rounded-b-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">
                        {v.phase} · {v.status}
                      </p>
                      <p
                        className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
                        title={v.id}
                      >
                        {v.id} · v{v.version}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="shrink-0" asChild>
                      <Link
                        href={`/content-library/${v.id}?contentType=video`}
                        className="gap-1"
                      >
                        View
                        <ArrowRight className="size-3.5 opacity-70" />
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!hideRelatedSummaries && data.packages.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Package className="size-4 text-muted-foreground" aria-hidden />
                <CardTitle className="text-sm font-medium">
                  Final packages
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-normal">
                  Phase 6
                </Badge>
              </div>
              <ul className="space-y-2">
                {data.packages.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5"
                  >
                    <p className="font-medium text-foreground">{p.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.videoCount} video{p.videoCount === 1 ? "" : "s"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.videoStatuses.map((s, idx) => (
                        <Badge
                          key={`${p.id}-${idx}-${s}`}
                          variant="secondary"
                          className="text-[10px] font-normal"
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-3">
            <CardTitle className="text-sm font-medium">Activity</CardTitle>
            {steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No timeline steps yet.</p>
            ) : (
              <ol className="relative space-y-0">
                {steps.map((step: ScriptTimelineEntry, i: number) => {
                  const isLast = i === steps.length - 1
                  const { date, time } = formatTimelineDate(step.at)
                  return (
                    <li
                      key={`${step.at}-${i}`}
                      className="relative flex gap-3 pb-6 last:pb-0"
                    >
                      {!isLast && (
                        <span
                          className="absolute top-9 bottom-0 left-[15px] w-px bg-border/80"
                          aria-hidden
                        />
                      )}
                      <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted shadow-sm ring-1 ring-border/60">
                        <span className="size-2 rounded-full bg-primary" />
                      </div>
                      <div className="min-w-0 flex-1 rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="font-medium leading-snug text-foreground">
                            {step.action}
                          </p>
                          <time
                            className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground"
                            dateTime={step.at}
                          >
                            {date}
                            {time ? (
                              <>
                                <br />
                                {time}
                              </>
                            ) : null}
                          </time>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {step.by}
                          <span className="text-muted-foreground/80">
                            {" "}
                            · {step.role}
                          </span>
                        </p>
                        {step.durationHours != null && (
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            +{step.durationHours.toFixed(1)}h after previous step
                          </p>
                        )}
                        {step.oldStatus != null && step.newStatus != null && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {step.oldStatus}
                            </Badge>
                            <ArrowRight
                              className="size-3 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {step.newStatus}
                            </Badge>
                          </div>
                        )}
                        {step.comments != null && step.comments !== "" && (
                          <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-muted-foreground">
                            {step.comments}
                          </blockquote>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        </CardContent>
      </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function currentPackageAsset(pv: PackageVideo) {
  const v = pv.currentVersion
  return pv.assets?.find((a) => a.version === v) ?? pv.assets?.[0]
}

const hubRowLinkClass = cn(
  "group flex items-center gap-3 rounded-md border border-border/40 bg-muted/10 px-3 py-2.5 transition-colors",
  "hover:border-border/70 hover:bg-muted/25",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
)

function HubAssetRow({
  href,
  title,
  meta,
  hintTitle,
}: {
  href: string
  title: string
  meta: string
  hintTitle?: string
}) {
  return (
    <Link
      href={href}
      title={hintTitle}
      aria-label={`View details: ${title}. ${meta}`}
      className={hubRowLinkClass}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="text-sm font-medium leading-snug text-foreground">{title}</div>
        <div className="text-[11px] leading-snug text-muted-foreground">{meta}</div>
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground/45 transition group-hover:text-muted-foreground"
        aria-hidden
      />
    </Link>
  )
}

function ScriptDetailVideoHub({
  fluFc,
  finalPackage,
  languagePackages,
}: {
  fluFc: Video[]
  finalPackage: FinalPackage | null
  languagePackages: LanguagePackage[]
}) {
  const pkgName =
    finalPackage?.name ?? finalPackage?.title ?? ""
  const fluSorted = sortFluFcVideos(fluFc)
  const finalCount = finalPackage?.videos?.length ?? 0
  const langClipTotal = languagePackages.reduce(
    (n, lp) => n + (lp.videos?.length ?? 0),
    0
  )

  return (
    <div className="divide-y divide-border/50">
      <section id="script-phase-flu-fc" className="scroll-mt-28 space-y-3 pb-8">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 gap-2">
            <VideoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge variant="outline" className="text-[10px] font-normal">
                  Phases 4–5
                </Badge>
                <span className="text-sm font-semibold tracking-tight">
                  First line up &amp; first cut
                </span>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Rough cuts (storyboard / draft video). Click a row for reviews and file.
              </p>
            </div>
          </div>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
            {fluSorted.length} clip{fluSorted.length === 1 ? "" : "s"}
          </span>
        </header>
        {fluSorted.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-muted/5 px-3 py-6 text-center text-xs text-muted-foreground">
            No FLU or FC videos for this script yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {fluSorted.map((v) => (
              <li key={v.id}>
                <HubAssetRow
                  href={`/content-library/${encodeURIComponent(v.id)}?contentType=video`}
                  hintTitle={`Video ID: ${v.id}`}
                  title={phaseVideoLabel(v.phase)}
                  meta={`${v.status.replace(/_/g, " ")} · v${v.version}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="script-phase-final-package" className="scroll-mt-28 space-y-3 py-8">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 gap-2">
            <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge variant="outline" className="text-[10px] font-normal">
                  Phase 6
                </Badge>
                <span className="text-sm font-semibold tracking-tight">
                  Final package (English)
                </span>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {pkgName ? (
                  <>
                    Package{" "}
                    <span className="font-medium text-foreground">{pkgName}</span>
                    {" · "}
                  </>
                ) : null}
                Medical + brand tracks per video.
              </p>
            </div>
          </div>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
            {finalCount} video{finalCount === 1 ? "" : "s"}
          </span>
        </header>
        {!finalPackage || finalCount === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-muted/5 px-3 py-6 text-center text-xs text-muted-foreground">
            No final English package yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {(finalPackage.videos ?? []).map((pv) => {
              const asset = currentPackageAsset(pv)
              const primaryLabel = `${pv.type.replace(/_/g, " ")}${
                asset?.title ? ` · ${asset.title}` : ""
              }`
              const meta = `${pv.status.replace(/_/g, " ")} · Video ${pv.videoTrackStatus} · Metadata ${pv.metadataTrackStatus} · v${pv.currentVersion}`
              return (
                <li key={pv.id}>
                  <HubAssetRow
                    href={`/content-library/${encodeURIComponent(pv.id)}?contentType=packagevideo`}
                    hintTitle={`Package video ID: ${pv.id}`}
                    title={primaryLabel}
                    meta={meta}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section id="script-phase-language" className="scroll-mt-28 space-y-3 pt-2 pb-1">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 gap-2">
            <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge variant="outline" className="text-[10px] font-normal">
                  Phase 7
                </Badge>
                <span className="text-sm font-semibold tracking-tight">
                  Language packages
                </span>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                One block per language · localized deliverables.
              </p>
            </div>
          </div>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
            {langClipTotal} clip{langClipTotal === 1 ? "" : "s"}
          </span>
        </header>
        {languagePackages.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-muted/5 px-3 py-6 text-center text-xs text-muted-foreground">
            No language packages yet.
          </p>
        ) : (
          <ul className="space-y-5">
            {languagePackages.map((lp) => (
              <li key={lp.id} className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-2 text-xs">
                  <span className="font-medium text-foreground">{lp.name}</span>
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {String(lp.language)}
                  </Badge>
                </div>
                <ul className="space-y-1.5">
                  {(lp.videos ?? []).map((lv) => (
                    <li key={lv.id}>
                      <HubAssetRow
                        href={`/content-library/${encodeURIComponent(lv.id)}?contentType=languagevideo`}
                        hintTitle={`Language video ID: ${lv.id}`}
                        title={`${String(lp.language)} · localized video`}
                        meta={`${lv.status.replace(/_/g, " ")} · v${lv.currentVersion}`}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ScriptDetailQuickNav({
  hasInsight,
  hasRejection,
}: {
  hasInsight: boolean
  hasRejection: boolean
}) {
  const items: { href: string; label: string }[] = [
    { href: "#script-overview", label: "Overview" },
    { href: "#script-at-a-glance", label: "At a glance" },
    { href: "#script-all-video-assets", label: "All video rows" },
    { href: "#script-phase-flu-fc", label: "Phases 4–5" },
    { href: "#script-phase-final-package", label: "Phase 6" },
    { href: "#script-phase-language", label: "Phase 7" },
    ...(hasInsight ? [{ href: "#script-insight", label: "Insight" }] : []),
    { href: "#script-full-text", label: "Script text" },
    ...(hasRejection ? [{ href: "#script-rejection", label: "Rejection" }] : []),
    { href: "#admin-timeline", label: "Timeline" },
  ]
  return (
    <nav
      aria-label="Jump to section"
      className="rounded-xl border border-border/60 bg-muted/15 px-4 py-3 sm:px-5"
    >
      <div className="flex flex-wrap items-center gap-2 gap-y-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <LayoutList className="size-3.5 shrink-0" aria-hidden />
          Jump to
        </span>
        <ul className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <li key={it.href}>
              <a
                href={it.href}
                className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-none transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                {it.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}

export function ContentDetailView() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = typeof params.id === "string" ? params.id : ""
  const contentType =
    searchParams.get("contentType")?.trim().toLowerCase() ?? "script"
  const token = useAuthStore((s) => s.token)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [timeline, setTimeline] = useState<ScriptTimelineResponse | null>(null)
  const [script, setScript] = useState<Script | null>(null)
  const [scriptFluFcVideos, setScriptFluFcVideos] = useState<Video[]>([])
  const [scriptFinalPackage, setScriptFinalPackage] =
    useState<FinalPackage | null>(null)
  const [scriptLanguagePackages, setScriptLanguagePackages] = useState<
    LanguagePackage[]
  >([])
  const [video, setVideo] = useState<Video | null>(null)
  const [packageVideo, setPackageVideo] = useState<PackageVideo | null>(null)
  const [languageVideo, setLanguageVideo] = useState<LanguageVideo | null>(null)
  const [scriptContentOpen, setScriptContentOpen] = useState(false)

  useEffect(() => {
    if (!token || !id) {
      setLoading(false)
      return
    }
    const authToken = token
    let cancelled = false
    setLoading(true)
    setScriptContentOpen(false)
    setError(null)
    setTimeline(null)
    setScript(null)
    setScriptFluFcVideos([])
    setScriptFinalPackage(null)
    setScriptLanguagePackages([])
    setVideo(null)
    setPackageVideo(null)
    setLanguageVideo(null)

    async function run() {
      try {
        if (contentType === "script") {
          const [tl, sc, queueRes, pkgRes, langRes] = await Promise.all([
            getScriptTimeline(authToken, id),
            getScript(authToken, id).then((r) => r.script).catch(() => null),
            getVideoQueue(authToken).catch(() => null),
            getPackageByScriptId(authToken, id).catch(() => null),
            getLanguagePackagesByScriptId(authToken, id).catch(() => ({
              data: [] as LanguagePackage[],
            })),
          ])
          if (cancelled) return
          setTimeline(tl)
          setScript(sc)
          if (queueRes) {
            setScriptFluFcVideos(videosForScriptFromQueue(queueRes, id))
          } else {
            setScriptFluFcVideos([])
          }
          setScriptFinalPackage(pkgRes?.package ?? null)
          setScriptLanguagePackages(langRes?.data ?? [])
          return
        }

        if (contentType === "video") {
          const { video: v } = await getVideo(authToken, id)
          if (cancelled) return
          setVideo(v)
          const tl = await getScriptTimeline(authToken, v.scriptId).catch(() => null)
          if (cancelled) return
          setTimeline(tl)
          return
        }

        if (contentType === "packagevideo") {
          const { video: pv } = await getPackageVideo(authToken, id)
          if (cancelled) return
          setPackageVideo(pv)
          const sid =
            pv.scriptId ?? pv.package?.scriptId ?? pv.script?.id
          if (sid) {
            const tl = await getScriptTimeline(authToken, sid).catch(() => null)
            if (!cancelled) setTimeline(tl)
          }
          return
        }

        if (contentType === "languagevideo") {
          const { data: lv } = await getLanguagePackageVideo(authToken, id)
          if (cancelled) return
          setLanguageVideo(lv)
          const sid = lv.scriptId ?? lv.package?.scriptId
          if (sid) {
            const tl = await getScriptTimeline(authToken, sid).catch(() => null)
            if (!cancelled) setTimeline(tl)
          }
          return
        }

        setError(`Unknown content type: ${contentType}`)
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load content")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [token, id, contentType])

  const title =
    script?.title ??
    video?.script?.title ??
    packageVideo?.package?.name ??
    languageVideo?.package?.name ??
    timeline?.title ??
    "Content"

  return (
    <AdminPageShell maxWidth="7xl">
      <div className="space-y-5 sm:space-y-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link href="/content-library">
            <ArrowLeft className="size-4 shrink-0" />
            Content library
          </Link>
        </Button>

        {loading && (
          <div
            className="flex min-h-48 items-center justify-center rounded-xl border border-border/60 bg-muted/10 ring-1 ring-border/60"
            aria-busy
            aria-label="Loading"
          >
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <Card
            className={cn(
              shellCard,
              "border-destructive/40 bg-destructive/5 ring-destructive/20"
            )}
          >
            <CardHeader className={shellHead}>
              <CardTitle className={shellTitle}>Couldn’t load content</CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-4 text-sm text-destructive sm:px-5">
              {error}
            </CardContent>
          </Card>
        )}

        {!loading && !error && (
          <>
            <div
              id={contentType === "script" ? "script-overview" : undefined}
              className={cn(shellCard, "rounded-xl bg-muted/10 p-4 sm:p-5")}
            >
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-normal capitalize">
                    {contentType}
                  </Badge>
                  {script && (
                    <WorkflowStatusBadge status={script.status} />
                  )}
                  {video && <WorkflowStatusBadge status={video.status} />}
                  {packageVideo && (
                    <WorkflowStatusBadge status={packageVideo.status} />
                  )}
                  {languageVideo && (
                    <WorkflowStatusBadge status={languageVideo.status} />
                  )}
                </div>
                <div className="flex flex-wrap items-start gap-3">
                  {contentType === "script" && (
                    <FileText
                      className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  {contentType === "video" && (
                    <VideoIcon
                      className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  {contentType === "packagevideo" && (
                    <Package
                      className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  {contentType === "languagevideo" && (
                    <Globe
                      className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  <h1 className="min-w-0 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    {title}
                  </h1>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {script && (
                <>
                  <SummaryTile
                    label="Version"
                    value={String(script.version)}
                  />
                  <SummaryTile
                    label="Updated"
                    value={formatWhen(script.updatedAt)}
                  />
                  <SummaryTile
                    label="Created"
                    value={formatWhen(script.createdAt)}
                  />
                  <SummaryTile
                    label="First line up"
                    value={script.fluStatus ?? "—"}
                  />
                </>
              )}
              {video && (
                <>
                  <SummaryTile label="Phase" value={video.phase} />
                  <SummaryTile label="Status" value={video.status} />
                  <SummaryTile
                    label="Version"
                    value={String(video.version)}
                  />
                  <SummaryTile
                    label="Updated"
                    value={formatWhen(video.updatedAt)}
                  />
                </>
              )}
              {packageVideo && (
                <>
                  <SummaryTile
                    label="Video track"
                    value={packageVideo.videoTrackStatus}
                  />
                  <SummaryTile
                    label="Metadata track"
                    value={packageVideo.metadataTrackStatus}
                  />
                  <SummaryTile
                    label="Version"
                    value={String(packageVideo.currentVersion)}
                  />
                  <SummaryTile label="Type" value={packageVideo.type} />
                </>
              )}
              {languageVideo && (
                <>
                  <SummaryTile
                    label="Language"
                    value={languageVideo.package?.language ?? "—"}
                  />
                  <SummaryTile
                    label="Version"
                    value={String(languageVideo.currentVersion)}
                  />
                  <SummaryTile label="Status" value={languageVideo.status} />
                </>
              )}
            </div>

            {script && (
              <>
                <Card className={shellCard}>
                  <CardHeader className={shellHead}>
                    <CardTitle className={shellTitle}>
                      How to use this page
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 px-4 pb-5 pt-0 text-sm leading-relaxed text-muted-foreground sm:px-5">
                    <ul className="list-inside list-disc space-y-1.5 pl-0.5">
                      <li>
                        <strong className="text-foreground">At a glance</strong>{" "}
                        shows counts only — scroll down for real rows.
                      </li>
                      <li>
                        Each <strong className="text-foreground">video row</strong>{" "}
                        opens that asset&apos;s own detail page (player, reviews,
                        thumbnails). This page is the map, not the editor.
                      </li>
                      <li>
                        <strong className="text-foreground">Script text</strong> opens
                        in a dialog so long HTML doesn&apos;t overwhelm the screen.
                      </li>
                      <li>
                        <strong className="text-foreground">Timeline</strong> at the
                        bottom is the audit trail (who acted when).
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <ScriptDetailQuickNav
                  hasInsight={Boolean(script.insight?.trim())}
                  hasRejection={Boolean(script.latestRejection)}
                />

                <Card
                  id="script-at-a-glance"
                  className={cn(shellCard, "scroll-mt-28")}
                >
                  <CardHeader className={shellHead}>
                    <CardTitle className={shellTitle}>At a glance</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Quick inventory for this script (phase coverage below).
                    </p>
                  </CardHeader>
                  <CardContent className="px-4 pb-5 pt-0 sm:px-5">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <SummaryTile
                        label="FLU & FC clips"
                        value={String(scriptFluFcVideos.length)}
                      />
                      <SummaryTile
                        label="English package videos"
                        value={String(scriptFinalPackage?.videos?.length ?? 0)}
                      />
                      <SummaryTile
                        label="Language videos"
                        value={String(
                          scriptLanguagePackages.reduce(
                            (n, lp) => n + (lp.videos?.length ?? 0),
                            0
                          )
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card
                  id="script-all-video-assets"
                  className={cn(shellCard, "scroll-mt-28")}
                >
                  <CardHeader className={shellHead}>
                    <CardTitle className={shellTitle}>
                      Videos &amp; packages for this script
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Click any row to open that asset in the library (full player,
                      reviews, and metadata).
                    </p>
                  </CardHeader>
                  <CardContent className="px-4 pb-5 pt-0 sm:px-5">
                    <ScriptDetailVideoHub
                      fluFc={scriptFluFcVideos}
                      finalPackage={scriptFinalPackage}
                      languagePackages={scriptLanguagePackages}
                    />
                  </CardContent>
                </Card>

                {script.insight ? (
                  <Card id="script-insight" className={cn(shellCard, "scroll-mt-28")}>
                    <CardHeader className={shellHead}>
                      <CardTitle className={shellTitle}>Insight</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-5 pt-0 text-sm leading-relaxed text-muted-foreground sm:px-5">
                      {script.insight}
                    </CardContent>
                  </Card>
                ) : null}

                <Card id="script-full-text" className={cn(shellCard, "scroll-mt-28")}>
                  <CardHeader className={shellHead}>
                    <CardTitle className={shellTitle}>Script text</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Open the full approved script HTML when you need to read or
                      compare wording.
                    </p>
                  </CardHeader>
                  <CardContent className="px-4 pb-5 pt-0 sm:px-5">
                    {script.content?.trim() ? (
                      <Dialog
                        open={scriptContentOpen}
                        onOpenChange={setScriptContentOpen}
                      >
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setScriptContentOpen(true)}
                        >
                          <FileText className="size-4" aria-hidden />
                          View script content
                        </Button>
                        <DialogContent
                          showCloseButton
                          className="flex max-h-[85vh] max-w-4xl flex-col gap-0 overflow-hidden border-border/80 p-0 sm:max-w-4xl"
                        >
                          <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4">
                            <DialogTitle>Script content</DialogTitle>
                            <DialogDescription className="font-mono text-[11px]">
                              {script.title ?? "Script"} · v{script.version}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                            <div
                              className="script-admin-html max-w-none rounded-lg border border-border/60 bg-muted/10 p-4 text-sm leading-relaxed [&_a]:text-primary [&_p]:my-2"
                              dangerouslySetInnerHTML={{
                                __html: script.content,
                              }}
                            />
                          </div>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <p className="py-2 text-sm text-muted-foreground">
                        No script body for this version.
                      </p>
                    )}
                  </CardContent>
                </Card>
                {script.latestRejection && (
                  <Card
                    id="script-rejection"
                    className={cn(
                      shellCard,
                      "scroll-mt-28 border-amber-500/25 bg-amber-500/4 ring-amber-500/15"
                    )}
                  >
                    <CardHeader
                      className={cn(
                        shellHead,
                        "border-amber-500/20 bg-amber-500/10"
                      )}
                    >
                      <CardTitle className={shellTitle}>
                        Latest rejection
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 px-4 pb-5 pt-0 text-sm sm:px-5">
                      <p className="text-xs text-muted-foreground">
                        {script.latestRejection.rejectedBy} ·{" "}
                        {script.latestRejection.stageAtReview} ·{" "}
                        {formatWhen(script.latestRejection.reviewedAt)}
                      </p>
                      <p className="leading-relaxed text-foreground">
                        {script.latestRejection.comments}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {video?.fileUrl && (
              <Card className={shellCard}>
                <CardHeader className={shellHead}>
                  <CardTitle className={shellTitle}>Video file</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 px-4 pb-5 pt-0 sm:px-5">
                  <video
                    className="aspect-video w-full min-w-0 overflow-hidden rounded-lg border border-border/60 bg-black"
                    controls
                    src={video.fileUrl}
                    preload="metadata"
                  />
                  <p className="text-xs text-muted-foreground">
                    {video.fileName ?? "—"} · {video.fileType ?? "—"}
                  </p>
                </CardContent>
              </Card>
            )}

            {video && video.reviews && video.reviews.length > 0 && (
              <Card className={shellCard}>
                <CardHeader className={shellHead}>
                  <CardTitle className={shellTitle}>Video reviews</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 px-4 pb-5 pt-0 sm:px-5">
                  {video.reviews.map((r: (typeof video.reviews)[number]) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5 text-sm"
                    >
                      <p className="font-medium text-foreground">
                        {r.decision} · {r.reviewerType}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatWhen(r.reviewedAt)} · {r.stageAtReview}
                      </p>
                      {r.comments ? (
                        <p className="mt-1.5 text-muted-foreground">
                          {r.comments}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {packageVideo && (
              <PackageVideoSection pv={packageVideo} />
            )}

            {languageVideo && (
              <LanguageVideoSection lv={languageVideo} />
            )}

            {timeline && (
              <TimelineBlock
                data={timeline}
                hideRelatedSummaries={contentType === "script"}
                compactHeader={contentType === "script"}
                defaultExpanded={contentType !== "script"}
              />
            )}
            {!timeline &&
              !loading &&
              contentType === "script" &&
              !error && (
                <div
                  className={cn(
                    shellCard,
                    "rounded-lg px-4 py-8 text-center text-sm text-muted-foreground"
                  )}
                >
                  No workflow timeline returned for this script.
                </div>
              )}
          </>
        )}
      </div>
    </AdminPageShell>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium wrap-break-word text-foreground">
        {value}
      </p>
    </div>
  )
}

function PackageVideoSection({ pv }: { pv: PackageVideo }) {
  const asset = currentPackageAsset(pv)
  const url = asset?.fileUrl
  return (
    <Card className={shellCard}>
      <CardHeader className={shellHead}>
        <CardTitle className={shellTitle}>Package video</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          {pv.type} · {pv.package?.name ?? pv.packageId}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-5 pt-0 sm:px-5">
        {url ? (
          <video
            className="aspect-video w-full min-w-0 overflow-hidden rounded-lg border border-border/60 bg-black"
            controls
            src={url}
            preload="metadata"
          />
        ) : null}
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
            <p className="text-[11px] font-medium text-muted-foreground">
              Title
            </p>
            <p className="mt-0.5 font-medium text-foreground">
              {asset?.title ?? "—"}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 sm:col-span-2">
            <p className="text-[11px] font-medium text-muted-foreground">
              Description
            </p>
            <p className="mt-0.5 leading-relaxed text-muted-foreground">
              {asset?.description ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WorkflowStatusBadge status={pv.status} />
          <span className="text-xs text-muted-foreground">
            Tracks: {pv.videoTrackStatus} / {pv.metadataTrackStatus}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function LanguageVideoSection({ lv }: { lv: LanguageVideo }) {
  const asset = lv.assets?.find((a) => a.version === lv.currentVersion) ?? lv.assets?.[0]
  const url = asset?.fileUrl
  return (
    <Card className={shellCard}>
      <CardHeader className={shellHead}>
        <CardTitle className={shellTitle}>Language package video</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          {lv.package?.language ?? "—"} · {lv.package?.name ?? lv.packageId}
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-5 pt-0 sm:px-5">
        {url ? (
          <video
            className="aspect-video w-full min-w-0 overflow-hidden rounded-lg border border-border/60 bg-black"
            controls
            src={url}
            preload="metadata"
          />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No video file on this version.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
