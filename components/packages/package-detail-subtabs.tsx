"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getPackageVideoVersions } from "@/lib/packages-api"
import {
  agencyPackageNeedsRevision,
  getLatestDisplayableRejectionForVideo,
  getLatestRejectionForVideoByTrack,
  isOverallCommentsRedundantWithItemFeedback,
  medicalPackageVideoTrackNeedsRevision,
} from "@/lib/package-list-utils"
import { packageVideosSorted, videoAssetToPackageAsset } from "@/lib/package-video-helpers"
import { formatPackageDate } from "@/lib/package-ui"
import type {
  FinalPackage,
  PackageVideo,
  PackageVideoVersionsResponse,
} from "@/types/package"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { PackageListTabNav } from "@/components/packages/package-list-tab-nav"
import { PackageItemFeedbackHumanizedList } from "@/components/packages/package-item-feedback-humanized"

type DetailTab = "overview" | "feedback" | "versions"

const DETAIL_TABS: readonly { key: DetailTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "feedback", label: "Feedback & revisions" },
  { key: "versions", label: "Version history" },
]

export function PackageDetailSubTabs({
  pkg,
  token,
  packageId: _packageId,
  children,
}: {
  pkg: FinalPackage
  token: string | null
  packageId: string
  children: React.ReactNode
}) {
  void _packageId
  const [tab, setTab] = useState<DetailTab>("overview")
  const didInitTab = useRef(false)

  useEffect(() => {
    if (didInitTab.current) return
    if (agencyPackageNeedsRevision(pkg)) {
      /* Open feedback when agency may need to act; one-time init from loaded pkg. */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTab("feedback")
      didInitTab.current = true
    }
  }, [pkg])

  return (
    <div className="space-y-6">
      <PackageListTabNav<DetailTab>
        tabs={DETAIL_TABS}
        active={tab}
        onChange={setTab}
        ariaLabel="Package detail sections"
      />

      {tab === "overview" && <div className="space-y-6">{children}</div>}

      {tab === "feedback" && (
        <PackageFeedbackAndRevisionsPanel pkg={pkg} />
      )}

      {tab === "versions" && (
        <PackageVideoVersionsMultiPanel token={token} pkg={pkg} />
      )}
    </div>
  )
}

function reviewBody(r: { overallComments?: string | null; comments?: string | null }) {
  return r.overallComments?.trim() || r.comments?.trim() || null
}

export function PackageFeedbackAndRevisionsPanel({
  pkg,
  trackFilter,
}: {
  pkg: FinalPackage
  /** When set, only show rejections for this track (e.g. Medical UI = video file only). */
  trackFilter?: "VIDEO_TRACK" | "METADATA_TRACK"
}) {
  const videos = packageVideosSorted(pkg)

  const needsRevision =
    trackFilter === "VIDEO_TRACK"
      ? medicalPackageVideoTrackNeedsRevision(pkg)
      : trackFilter === "METADATA_TRACK"
        ? videos.some(
            (v) =>
              v.status === "MEDICAL_REVIEW" &&
              v.metadataTrackStatus === "REJECTED"
          )
        : agencyPackageNeedsRevision(pkg)

  const getDisplay = (v: PackageVideo) =>
    trackFilter
      ? getLatestRejectionForVideoByTrack(v, trackFilter)
      : getLatestDisplayableRejectionForVideo(v)

  return (
    <div className="space-y-8">
      {needsRevision && (
        <Card className="border-amber-500/40 bg-amber-500/5 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="text-base">Revision required</CardTitle>
            <CardDescription>
              {trackFilter === "VIDEO_TRACK" ? (
                <>
                  At least one deliverable needs a new{" "}
                  <strong>video file</strong>. Agency uses the Videos tab to
                  resubmit; metadata is handled by Content/Brand separately.
                </>
              ) : trackFilter === "METADATA_TRACK" ? (
                <>
                  At least one deliverable needs{" "}
                  <strong>metadata / thumbnail</strong> changes from Agency.
                </>
              ) : (
                <>
                  At least one deliverable needs changes. Use the feedback
                  below, then resubmit the <strong>video file</strong> and/or{" "}
                  <strong>metadata</strong> from the package overview for each
                  affected video.
                </>
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {videos.map((v) => {
        const display = getDisplay(v)
        if (!display) {
          if (trackFilter) {
            return null
          }
          return (
            <Card key={v.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {v.type.replace("_", " ")} · v{v.currentVersion}
                </CardTitle>
                <CardDescription>
                  No rejection feedback recorded on this deliverable for the
                  current view.
                </CardDescription>
              </CardHeader>
            </Card>
          )
        }
        return (
          <Card key={v.id} className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-base text-destructive">
                {v.type.replace("_", " ")} — reviewer feedback
              </CardTitle>
              <CardDescription>
                {display.reviewerLine} · {display.trackLine} ·{" "}
                {display.reviewedAtLabel}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(() => {
                const raw = display.itemFeedback ?? []
                const items =
                  trackFilter === "VIDEO_TRACK"
                    ? raw.filter((f) => f.field === "VIDEO")
                    : trackFilter === "METADATA_TRACK"
                      ? raw.filter((f) =>
                          ["TITLE", "DESCRIPTION", "TAGS", "THUMBNAIL"].includes(
                            f.field
                          )
                        )
                      : raw
                const oc = display.overallComments?.trim() ?? ""
                const showOverall =
                  Boolean(oc) &&
                  !isOverallCommentsRedundantWithItemFeedback(oc, items)
                return (
                  <>
                    {showOverall ? (
                      <div className="space-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Overall note
                        </p>
                        <p className="whitespace-pre-wrap font-medium leading-relaxed text-foreground">
                          {oc}
                        </p>
                      </div>
                    ) : oc && items.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Overall line matches the detailed items below — see each
                        entry.
                      </p>
                    ) : null}
                    {items.length > 0 ? (
                      <PackageItemFeedbackHumanizedList
                        pkg={pkg}
                        items={items}
                        className="border-t-0 pt-0"
                      />
                    ) : null}
                  </>
                )
              })()}
            </CardContent>
          </Card>
        )
      })}

      {videos.every((v) => !getDisplay(v)) && !needsRevision && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {trackFilter === "VIDEO_TRACK"
              ? "No video-track rejection feedback on these deliverables."
              : trackFilter === "METADATA_TRACK"
                ? "No metadata-track rejection feedback on these deliverables."
                : "No rejection feedback on these deliverables yet."}
          </CardContent>
        </Card>
      )}

      {!trackFilter && pkg.reviews && pkg.reviews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Package-level review log (legacy)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {pkg.reviews.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-1 border-b border-border pb-3 last:border-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{r.decision}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {r.reviewerType} · {formatPackageDate(r.reviewedAt)}
                  </span>
                </div>
                {reviewBody(r) && (
                  <p className="text-muted-foreground">{reviewBody(r)}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function PackageVideoVersionsMultiPanel({
  token,
  pkg,
}: {
  token: string | null
  pkg: FinalPackage
}) {
  const videos = packageVideosSorted(pkg)
  return (
    <div className="space-y-10">
      {videos.map((v) => (
        <div key={v.id} className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            {v.type.replace("_", " ")} — version history
          </h3>
          <PackageVideoVersionHistoryPanel token={token} videoId={v.id} />
        </div>
      ))}
    </div>
  )
}

function PackageVideoVersionHistoryPanel({
  token,
  videoId,
}: {
  token: string | null
  videoId: string
}) {
  const [data, setData] = useState<PackageVideoVersionsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setErr(null)
    try {
      const res = await getPackageVideoVersions(token, videoId)
      setData(res)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load versions")
    } finally {
      setLoading(false)
    }
  }, [token, videoId])

  useEffect(() => {
    load()
  }, [load])

  if (!token) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Sign in to load version history.
        </CardContent>
      </Card>
    )
  }

  if (loading && !data) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (err) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex flex-col gap-3 py-6">
          <p className="text-sm text-destructive">{err}</p>
          <Button variant="outline" size="sm" className="w-fit" onClick={load}>
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const rows = data?.versions ?? []

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Current version:{" "}
        <span className="font-medium text-foreground">
          {data?.currentVersion ?? "—"}
        </span>
      </p>
      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No prior versions recorded.
          </CardContent>
        </Card>
      ) : (
        rows.map((row) => {
          const asset = row.asset ? videoAssetToPackageAsset(row.asset) : null
          return (
            <Card key={row.version}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Version {row.version}
                  {row.version === data?.currentVersion && (
                    <Badge variant="secondary" className="ml-2">
                      Current
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {asset ? (
                  <div
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                    )}
                  >
                    <div>
                      <span className="font-medium">{asset.type}</span>
                      <p className="text-xs text-muted-foreground">
                        {asset.fileName}
                      </p>
                    </div>
                    <a
                      href={asset.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary underline-offset-4 hover:underline"
                    >
                      Open
                    </a>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
