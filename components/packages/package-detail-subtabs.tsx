"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getPackageVersions } from "@/lib/packages-api"
import { formatPackageDate } from "@/lib/package-ui"
import { agencyPackageNeedsRevision } from "@/lib/package-list-utils"
import type { FinalPackage, PackageVersionsResponse } from "@/types/package"
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
  packageId,
  children,
}: {
  pkg: FinalPackage
  token: string | null
  packageId: string
  children: React.ReactNode
}) {
  const [tab, setTab] = useState<DetailTab>("overview")
  const didInitTab = useRef(false)

  useEffect(() => {
    if (didInitTab.current) return
    if (agencyPackageNeedsRevision(pkg)) {
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
        <PackageVersionHistoryPanel token={token} packageId={packageId} />
      )}
    </div>
  )
}

function reviewBody(r: { overallComments?: string | null; comments?: string | null }) {
  return r.overallComments?.trim() || r.comments?.trim() || null
}

export function PackageFeedbackAndRevisionsPanel({ pkg }: { pkg: FinalPackage }) {
  const rejectFromReviews = (pkg.reviews ?? []).filter(
    (r) =>
      r.decision === "REJECTED" &&
      (!pkg.latestRejection?.id || r.id !== pkg.latestRejection.id)
  )
  const approveReviews = (pkg.reviews ?? []).filter(
    (r) => r.decision === "APPROVED"
  )

  return (
    <div className="space-y-6">
      {agencyPackageNeedsRevision(pkg) && (
        <Card className="border-amber-500/40 bg-amber-500/5 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="text-base">Revision required</CardTitle>
            <CardDescription>
              A reviewer rejected part of this package (video track, metadata
              track, or the whole package). Use the feedback below, then
              resubmit using <strong>Submit package</strong> for this script or
              the resubmit APIs when available.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {pkg.latestRejection && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Latest rejection
            </CardTitle>
            <CardDescription>
              {pkg.latestRejection.reviewer
                ? `${pkg.latestRejection.reviewer.firstName} ${pkg.latestRejection.reviewer.lastName} · ${pkg.latestRejection.reviewerType}`
                : pkg.latestRejection.reviewerType}{" "}
              · {pkg.latestRejection.trackReviewed ?? "—"} ·{" "}
              {pkg.latestRejection.stageAtReview ?? "—"} ·{" "}
              {formatPackageDate(pkg.latestRejection.reviewedAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-medium text-foreground">
              {pkg.latestRejection.overallComments}
            </p>
            {pkg.latestRejection.assetFeedback &&
              pkg.latestRejection.assetFeedback.length > 0 && (
                <ul className="space-y-2 border-t border-border pt-3">
                  {pkg.latestRejection.assetFeedback.map((a, i) => (
                    <li
                      key={a.id ?? i}
                      className="rounded-md bg-muted/50 px-3 py-2"
                    >
                      <span className="font-medium">{a.assetType}</span>
                      {a.hasIssue ? (
                        <span className="text-destructive"> · Issue</span>
                      ) : (
                        <span className="text-muted-foreground"> · OK</span>
                      )}
                      {a.comments && (
                        <p className="mt-1 text-muted-foreground">
                          {a.comments}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            {pkg.latestRejection.itemFeedback &&
              pkg.latestRejection.itemFeedback.length > 0 && (
                <PackageItemFeedbackHumanizedList
                  pkg={pkg}
                  items={pkg.latestRejection.itemFeedback}
                />
              )}
          </CardContent>
        </Card>
      )}

      {!pkg.latestRejection && rejectFromReviews.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No rejection feedback on this version. Approve/reject events appear
            here after reviewers act.
          </CardContent>
        </Card>
      )}

      {rejectFromReviews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Earlier rejections (log)</CardTitle>
            <CardDescription>
              Rejection events recorded on this package (may include prior
              versions if returned by the API).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {rejectFromReviews.map((r) => (
              <div
                key={r.id}
                className="border-b border-border pb-4 last:border-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="destructive">Rejected</Badge>
                  <span className="text-xs text-muted-foreground">
                    {r.reviewerType} · {r.stageAtReview ?? "—"} ·{" "}
                    {r.trackReviewed ?? "—"} · {formatPackageDate(r.reviewedAt)}
                  </span>
                </div>
                {reviewBody(r) && (
                  <p className="mt-2 text-sm">{reviewBody(r)}</p>
                )}
                {r.assetFeedback && r.assetFeedback.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {r.assetFeedback.map((a, i) => (
                      <li key={a.id ?? i}>
                        <span className="font-medium text-foreground">
                          {a.assetType}
                        </span>
                        : {a.comments}
                      </li>
                    ))}
                  </ul>
                )}
                {r.itemFeedback && r.itemFeedback.length > 0 && (
                  <PackageItemFeedbackHumanizedList
                    pkg={pkg}
                    items={r.itemFeedback}
                    className="mt-2 border-t-0 pt-0"
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {approveReviews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Approval history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {approveReviews.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-1 border-b border-border pb-3 last:border-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border-green-600/50 text-green-700 dark:text-green-400"
                  >
                    Approved
                  </Badge>
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

export function PackageVersionHistoryPanel({
  token,
  packageId,
}: {
  token: string | null
  packageId: string
}) {
  const [data, setData] = useState<PackageVersionsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setErr(null)
    try {
      const res = await getPackageVersions(token, packageId)
      setData(res)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load versions")
    } finally {
      setLoading(false)
    }
  }, [token, packageId])

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

  const versions = data?.versions ?? []

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Current version on server:{" "}
        <span className="font-medium text-foreground">
          {data?.currentVersion ?? "—"}
        </span>
      </p>
      {versions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No prior versions recorded yet.
          </CardContent>
        </Card>
      ) : (
        versions.map((v) => (
          <Card key={v.version}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Version {v.version}
                {v.version === data?.currentVersion && (
                  <Badge variant="secondary" className="ml-2">
                    Current
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {v.assets.map((a, idx) => (
                <div
                  key={a.id ?? `${v.version}-${idx}`}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2",
                    a.isSelected && "border-primary/50 bg-primary/5"
                  )}
                >
                  <div>
                    <span className="font-medium">{a.type}</span>
                    {a.isSelected && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        Selected thumb
                      </Badge>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {a.fileName}
                    </p>
                  </div>
                  <a
                    href={a.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline-offset-4 hover:underline"
                  >
                    Open
                  </a>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
