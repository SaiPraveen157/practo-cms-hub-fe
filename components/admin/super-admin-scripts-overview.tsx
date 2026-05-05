"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Film,
  Globe,
  Loader2,
  Package,
} from "lucide-react"
import { AdminSectionTitle } from "@/components/admin/admin-page-header"
import { TimelineBlock } from "@/components/admin/content-detail-view"
import { WorkflowStatusBadge } from "@/components/admin/workflow-status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminContent, getScriptTimeline } from "@/lib/admin-api"
import { getLanguagePackagesByScriptId } from "@/lib/language-packages-api"
import { getPackageByScriptId } from "@/lib/packages-api"
import { getScript } from "@/lib/scripts-api"
import { getVideoQueue } from "@/lib/videos-api"
import { useAuthStore } from "@/store"
import type { ScriptTimelineResponse } from "@/types/admin"
import type { AdminContentItem } from "@/types/admin"
import type { LanguagePackage, LanguageVideo } from "@/types/language-package"
import type { FinalPackage, PackageVideo, PackageVideoAsset } from "@/types/package"
import type { Script } from "@/types/script"
import type { Video } from "@/types/video"
import { cn } from "@/lib/utils"

const shellCard =
  "overflow-hidden border-border/80 shadow-none ring-1 ring-border/60"
const shellHead =
  "border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-5"
const shellTitle = "text-sm font-medium tracking-tight text-foreground"

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

function collectVideosByScriptId(queue: {
  available?: Video[]
  myReviews?: Video[]
  pendingUpload?: Video[]
}): Map<string, Video[]> {
  const raw = [
    ...(queue.available ?? []),
    ...(queue.myReviews ?? []),
    ...(queue.pendingUpload ?? []),
  ]
  const map = new Map<string, Video[]>()
  const seen = new Map<string, Set<string>>()
  for (const v of raw) {
    const sid = v.scriptId
    if (!sid) continue
    const ids = seen.get(sid) ?? new Set<string>()
    if (ids.has(v.id)) continue
    ids.add(v.id)
    seen.set(sid, ids)
    const arr = map.get(sid) ?? []
    arr.push(v)
    map.set(sid, arr)
  }
  return map
}

function currentPvAsset(pv: PackageVideo): PackageVideoAsset | undefined {
  const ver = pv.currentVersion
  return pv.assets?.find((a) => a.version === ver) ?? pv.assets?.[0]
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

type LoadedBundle = {
  timeline: ScriptTimelineResponse | null
  script: Script | null
  finalPackage: FinalPackage | null
  languagePackages: LanguagePackage[]
  error: string | null
}

export function SuperAdminScriptsOverview() {
  const token = useAuthStore((s) => s.token)
  const [page, setPage] = useState(1)
  const limit = 12
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [items, setItems] = useState<AdminContentItem[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const [videoByScript, setVideoByScript] = useState<Map<string, Video[]>>(
    () => new Map()
  )
  const [queueLoaded, setQueueLoaded] = useState(false)

  const [openId, setOpenId] = useState<string | null>(null)
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null)
  const [cache, setCache] = useState<Record<string, LoadedBundle>>({})
  const cacheRef = useRef(cache)
  cacheRef.current = cache
  const detailInflight = useRef(new Set<string>())

  const loadList = useCallback(async () => {
    if (!token) return
    setListLoading(true)
    setListError(null)
    try {
      const res = await getAdminContent(token, {
        phase: "SCRIPT",
        page,
        limit,
        sort: "newest",
      })
      const rows = res.items ?? []
      setItems(rows.filter((it) => it.contentType === "script"))
      setTotalPages(Math.max(1, res.totalPages ?? 1))
      setTotal(res.total ?? 0)
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load scripts")
      setItems([])
    } finally {
      setListLoading(false)
    }
  }, [token, page, limit])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const q = await getVideoQueue(token)
        if (cancelled) return
        setVideoByScript(collectVideosByScriptId(q))
        setQueueLoaded(true)
      } catch {
        if (!cancelled) {
          setVideoByScript(new Map())
          setQueueLoaded(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const loadDetail = useCallback(async (scriptId: string) => {
    if (!token) return
    if (cacheRef.current[scriptId]) return
    if (detailInflight.current.has(scriptId)) return
    detailInflight.current.add(scriptId)
    setLoadingDetail(scriptId)
    try {
      const [tl, sc, pkg, langs] = await Promise.all([
        getScriptTimeline(token, scriptId).catch(() => null),
        getScript(token, scriptId)
          .then((r) => r.script)
          .catch(() => null),
        getPackageByScriptId(token, scriptId).catch(() => null),
        getLanguagePackagesByScriptId(token, scriptId).catch(() => ({
          data: [] as LanguagePackage[],
        })),
      ])
      setCache((prev) => ({
        ...prev,
        [scriptId]: {
          timeline: tl,
          script: sc,
          finalPackage: pkg?.package ?? null,
          languagePackages: langs?.data ?? [],
          error: null,
        },
      }))
    } catch (e) {
      setCache((prev) => ({
        ...prev,
        [scriptId]: {
          timeline: null,
          script: null,
          finalPackage: null,
          languagePackages: [],
          error: e instanceof Error ? e.message : "Failed to load details",
        },
      }))
    } finally {
      detailInflight.current.delete(scriptId)
      setLoadingDetail(null)
    }
  }, [token])

  const handleToggle = useCallback(
    (id: string) => {
      if (openId === id) {
        setOpenId(null)
        return
      }
      setOpenId(id)
      void loadDetail(id)
    },
    [openId, loadDetail]
  )

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <AdminSectionTitle>Every script — Phases 1–7</AdminSectionTitle>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            One row per script. Expand to load script copy, admin audit timeline,
            first-line-up / first-cut videos, final English package, and language
            packages (whatever exists on the server).
          </p>
        </div>
        {!listLoading && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {total} script{total === 1 ? "" : "s"} · page {page} / {totalPages}
          </p>
        )}
      </div>

      {listError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col gap-2 py-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{listError}</span>
            <Button variant="outline" size="sm" onClick={() => void loadList()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {listLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/10 py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading scripts…</span>
        </div>
      ) : items.length === 0 ? (
        <Card className={shellCard}>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No scripts found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((row) => {
            const sid = row.id
            const expanded = openId === sid
            const bundle = cache[sid]
            const fluFc = videoByScript.get(sid) ?? []

            return (
              <Card key={`${row.contentType}-${sid}`} className={shellCard}>
                <button
                  type="button"
                  onClick={() => handleToggle(sid)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 sm:px-5 sm:py-4"
                >
                  <span className="mt-0.5 text-muted-foreground" aria-hidden>
                    {expanded ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium text-foreground">
                        {row.title || "Untitled"}
                      </span>
                      <WorkflowStatusBadge status={row.status} />
                      <Badge variant="outline" className="text-[10px] font-normal">
                        v{row.version ?? "—"}
                      </Badge>
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {sid}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Updated {formatWhen(row.updatedAt)}
                      {queueLoaded && fluFc.length > 0
                        ? ` · ${fluFc.length} FLU/FC video${fluFc.length === 1 ? "" : "s"}`
                        : null}
                    </p>
                  </div>
                </button>

                {expanded && (
                  <CardContent className="space-y-6 border-t border-border/60 px-4 pb-6 pt-4 sm:px-5">
                    {loadingDetail === sid && !bundle && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Loading full pipeline…
                      </div>
                    )}

                    {bundle?.error && (
                      <p className="text-sm text-destructive">{bundle.error}</p>
                    )}

                    {bundle && (
                      <>
                        {/* Phase 1–3 — script record */}
                        {bundle.script && (
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className="font-normal">Phases 1–3</Badge>
                              <WorkflowStatusBadge
                                status={bundle.script.status}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                              <SummaryTile
                                label="Version"
                                value={String(bundle.script.version)}
                              />
                              <SummaryTile
                                label="First line up"
                                value={bundle.script.fluStatus ?? "—"}
                              />
                              <SummaryTile
                                label="Created"
                                value={formatWhen(bundle.script.createdAt)}
                              />
                              <SummaryTile
                                label="Updated"
                                value={formatWhen(bundle.script.updatedAt)}
                              />
                            </div>
                            {bundle.script.insight ? (
                              <Card className={shellCard}>
                                <CardHeader className={shellHead}>
                                  <CardTitle className={shellTitle}>
                                    Insight
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="px-4 pb-5 pt-0 text-sm leading-relaxed text-muted-foreground sm:px-5">
                                  {bundle.script.insight}
                                </CardContent>
                              </Card>
                            ) : null}
                            <Card className={shellCard}>
                              <CardHeader className={shellHead}>
                                <CardTitle className={shellTitle}>
                                  Script body
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="px-4 pb-5 pt-0 sm:px-5">
                                {bundle.script.content?.trim() ? (
                                  <div
                                    className="script-admin-html max-w-none rounded-lg border border-border/60 bg-background/50 p-4 text-sm leading-relaxed [&_a]:text-primary [&_p]:my-2"
                                    dangerouslySetInnerHTML={{
                                      __html: bundle.script.content,
                                    }}
                                  />
                                ) : (
                                  <p className="py-6 text-center text-sm text-muted-foreground">
                                    No script body.
                                  </p>
                                )}
                              </CardContent>
                            </Card>
                            {bundle.script.latestRejection && (
                              <Card
                                className={cn(
                                  shellCard,
                                  "border-amber-500/25 bg-amber-500/4 ring-amber-500/15"
                                )}
                              >
                                <CardHeader
                                  className={cn(
                                    shellHead,
                                    "border-amber-500/20 bg-amber-500/10"
                                  )}
                                >
                                  <CardTitle className={shellTitle}>
                                    Latest rejection (script)
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 px-4 pb-5 pt-0 text-sm sm:px-5">
                                  <p className="text-xs text-muted-foreground">
                                    {bundle.script.latestRejection.rejectedBy} ·{" "}
                                    {bundle.script.latestRejection.stageAtReview}{" "}
                                    ·{" "}
                                    {formatWhen(
                                      bundle.script.latestRejection.reviewedAt
                                    )}
                                  </p>
                                  <p className="leading-relaxed text-foreground">
                                    {bundle.script.latestRejection.comments}
                                  </p>
                                </CardContent>
                              </Card>
                            )}
                          </div>
                        )}

                        {/* Phases 4–5 — FLU / FC */}
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Film className="size-4 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              Phases 4–5 — First line up &amp; first cut
                            </span>
                          </div>
                          {fluFc.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No FLU/FC video rows in the video queue for this
                              script.
                            </p>
                          ) : (
                            <div className="space-y-4">
                              {fluFc.map((v) => (
                                <Card key={v.id} className={shellCard}>
                                  <CardHeader className={shellHead}>
                                    <CardTitle className={shellTitle}>
                                      {v.phase.replace(/_/g, " ")} ·{" "}
                                      {v.status.replace(/_/g, " ")}
                                    </CardTitle>
                                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                                      {v.id} · v{v.version}
                                    </p>
                                  </CardHeader>
                                  <CardContent className="space-y-3 px-4 pb-5 pt-0 sm:px-5">
                                    {v.fileUrl ? (
                                      <video
                                        className="aspect-video w-full max-w-3xl overflow-hidden rounded-lg border border-border/60 bg-black"
                                        controls
                                        src={v.fileUrl}
                                        preload="metadata"
                                      />
                                    ) : (
                                      <p className="text-sm text-muted-foreground">
                                        No file URL on this row.
                                      </p>
                                    )}
                                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                      <span>{v.fileName ?? "—"}</span>
                                      <span>·</span>
                                      <span>{v.fileType ?? "—"}</span>
                                    </div>
                                    {v.reviews && v.reviews.length > 0 && (
                                      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
                                        <p className="text-xs font-medium text-foreground">
                                          Reviews
                                        </p>
                                        {v.reviews.map((r) => (
                                          <div
                                            key={r.id}
                                            className="text-sm text-muted-foreground"
                                          >
                                            <span className="font-medium text-foreground">
                                              {r.decision}
                                            </span>{" "}
                                            · {r.reviewerType} ·{" "}
                                            {formatWhen(r.reviewedAt)}
                                            {r.comments ? (
                                              <p className="mt-1">{r.comments}</p>
                                            ) : null}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    <Button variant="outline" size="sm" asChild>
                                      <Link
                                        href={`/content-library/${encodeURIComponent(v.id)}?contentType=video`}
                                      >
                                        Full detail page
                                      </Link>
                                    </Button>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Phase 6 */}
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Package className="size-4 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              Phase 6 — Final package (English)
                            </span>
                          </div>
                          {!bundle.finalPackage ? (
                            <p className="text-sm text-muted-foreground">
                              No final package for this script yet.
                            </p>
                          ) : (
                            <div className="space-y-4">
                              <Card className={cn(shellCard, "bg-muted/5")}>
                                <CardHeader className={shellHead}>
                                  <CardTitle className={shellTitle}>
                                    {bundle.finalPackage.name ??
                                      bundle.finalPackage.title ??
                                      "Package"}
                                  </CardTitle>
                                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                                    {bundle.finalPackage.id}
                                  </p>
                                </CardHeader>
                                <CardContent className="space-y-4 px-4 pb-5 sm:px-5">
                                  <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                                    <span>
                                      Created{" "}
                                      {formatWhen(bundle.finalPackage.createdAt)}
                                    </span>
                                    <span>
                                      Updated{" "}
                                      {formatWhen(bundle.finalPackage.updatedAt)}
                                    </span>
                                  </div>
                                  {(bundle.finalPackage.videos ?? []).map(
                                    (pv) => (
                                      <Phase6VideoCard
                                        key={pv.id}
                                        pv={pv}
                                      />
                                    )
                                  )}
                                </CardContent>
                              </Card>
                            </div>
                          )}
                        </div>

                        {/* Phase 7 */}
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Globe className="size-4 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              Phase 7 — Language packages
                            </span>
                          </div>
                          {bundle.languagePackages.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No language packages for this script.
                            </p>
                          ) : (
                            <div className="space-y-4">
                              {bundle.languagePackages.map((lp) => (
                                <Card key={lp.id} className={shellCard}>
                                  <CardHeader className={shellHead}>
                                    <CardTitle className={shellTitle}>
                                      {lp.name}{" "}
                                      <Badge variant="secondary" className="ml-2 font-normal">
                                        {String(lp.language)}
                                      </Badge>
                                    </CardTitle>
                                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                                      {lp.id}
                                    </p>
                                  </CardHeader>
                                  <CardContent className="space-y-4 px-4 pb-5 sm:px-5">
                                    {(lp.videos ?? []).map((lv) => (
                                      <Phase7VideoCard key={lv.id} lv={lv} />
                                    ))}
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Admin timeline (audit) */}
                        {bundle.timeline && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              Admin audit timeline
                            </p>
                            <TimelineBlock
                              data={bundle.timeline}
                              hideRelatedSummaries
                            />
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {!listLoading && items.length > 0 && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() =>
              setPage((p) => (p < totalPages ? p + 1 : p))
            }
          >
            Next
          </Button>
        </div>
      )}
    </section>
  )
}

function Phase6VideoCard({ pv }: { pv: PackageVideo }) {
  const asset = currentPvAsset(pv)
  const thumbs = asset?.thumbnails ?? []
  return (
    <Card className="border-border/60 bg-background/50 shadow-none">
      <CardHeader className="space-y-1 border-b border-border/60 py-3">
        <CardTitle className="text-sm font-medium">
          {pv.type.replace(/_/g, " ")} deliverable
        </CardTitle>
        <p className="font-mono text-[11px] text-muted-foreground">{pv.id}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <WorkflowStatusBadge status={pv.status} />
          <span className="text-xs text-muted-foreground">
            Video track: {pv.videoTrackStatus} · Metadata:{" "}
            {pv.metadataTrackStatus}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 py-4">
        {asset?.fileUrl ? (
          <video
            className="aspect-video w-full max-w-3xl overflow-hidden rounded-lg border border-border/60 bg-black"
            controls
            src={asset.fileUrl}
            preload="metadata"
          />
        ) : null}
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">
              Title
            </p>
            <p className="font-medium">{asset?.title ?? "—"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-[11px] font-medium text-muted-foreground">
              Description
            </p>
            <p className="leading-relaxed text-muted-foreground">
              {asset?.description ?? "—"}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-[11px] font-medium text-muted-foreground">
              Tags
            </p>
            <p className="text-muted-foreground">
              {asset?.tags?.length
                ? asset.tags.join(", ")
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">
              Doctor
            </p>
            <p>{asset?.doctorName ?? "—"}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">
              Specialty
            </p>
            <p>{asset?.specialty ?? "—"}</p>
          </div>
        </div>
        {thumbs.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">
              Thumbnails ({thumbs.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {thumbs.map((t) => (
                <div
                  key={t.id}
                  className="relative w-24 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.fileUrl}
                    alt={t.fileName}
                    className="aspect-video h-auto w-full object-cover"
                  />
                  <span className="absolute bottom-0 left-0 right-0 bg-background/90 px-1 py-0.5 text-[9px] text-muted-foreground">
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {pv.reviews && pv.reviews.length > 0 && (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
            <p className="text-xs font-medium">Package video reviews</p>
            {pv.reviews.map((r) => (
              <div key={r.id} className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {r.decision}
                </span>{" "}
                · {r.reviewerType} · {r.trackReviewed ?? "—"} ·{" "}
                {formatWhen(r.reviewedAt)}
                {r.overallComments ? (
                  <p className="mt-1">{r.overallComments}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link
            href={`/content-library/${encodeURIComponent(pv.id)}?contentType=packagevideo`}
          >
            Full detail page
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function Phase7VideoCard({ lv }: { lv: LanguageVideo }) {
  const asset =
    lv.assets?.find((a) => a.version === lv.currentVersion) ?? lv.assets?.[0]
  const thumbs = asset?.thumbnails ?? []
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <WorkflowStatusBadge status={lv.status} />
        <span className="font-mono text-[11px] text-muted-foreground">
          {lv.id} · v{lv.currentVersion}
        </span>
      </div>
      {asset?.fileUrl ? (
        <video
          className="mt-3 aspect-video w-full max-w-3xl overflow-hidden rounded-lg border border-border/60 bg-black"
          controls
          src={asset.fileUrl}
          preload="metadata"
        />
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No video file.</p>
      )}
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <p className="text-[11px] text-muted-foreground">Title</p>
          <p>{asset?.title ?? "—"}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-[11px] text-muted-foreground">Description</p>
          <p className="text-muted-foreground">{asset?.description ?? "—"}</p>
        </div>
      </div>
      {thumbs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {thumbs.map((t) => (
            <div
              key={t.id}
              className="relative w-20 shrink-0 overflow-hidden rounded border border-border/60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.fileUrl}
                alt={t.fileName}
                className="aspect-video h-auto w-full object-cover"
              />
              <span className="absolute bottom-0 left-0 right-0 bg-background/90 px-0.5 text-[8px]">
                {t.status}
              </span>
            </div>
          ))}
        </div>
      )}
      {lv.reviews && lv.reviews.length > 0 && (
        <div className="mt-3 space-y-1 text-sm text-muted-foreground">
          {lv.reviews.map((r) => (
            <p key={r.id}>
              <span className="font-medium text-foreground">{r.decision}</span>{" "}
              · {formatWhen(r.reviewedAt)}
              {r.overallComments ? ` — ${r.overallComments}` : ""}
            </p>
          ))}
        </div>
      )}
      <Button variant="outline" size="sm" className="mt-3" asChild>
        <Link
          href={`/content-library/${encodeURIComponent(lv.id)}?contentType=languagevideo`}
        >
          Full detail page
        </Link>
      </Button>
    </div>
  )
}
