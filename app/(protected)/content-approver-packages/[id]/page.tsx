"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuthStore } from "@/store"
import { approvePackageVideo, getPackage } from "@/lib/packages-api"
import {
  deliverableLabelsByVideoId,
  getCurrentVideoAsset,
  mergeVideoIntoPackage,
  packageReadyForContentApproverFullView,
  packageVideosSorted,
  thumbnailsOnAsset,
  videoAssetToPackageAsset,
} from "@/lib/package-video-helpers"
import type {
  FinalPackage,
  PackageThumbnailRecord,
} from "@/types/package"
import type { UserRole } from "@/types/auth"
import {
  TRACK_STATUS_LABELS,
  VIDEO_STATUS_LABELS,
  formatPackageDate,
  videoStatusBadgeClass,
} from "@/lib/package-ui"
import { PackageVideoTatInline } from "@/components/packages/package-video-tat-inline"
import { PackageInlineVideoCard } from "@/components/packages/package-inline-video-card"
import { PackageVideoMetadataProminent } from "@/components/packages/package-video-metadata-prominent"
import {
  ArrowLeft,
  CheckCircle2,
  Clapperboard,
  ExternalLink,
  Loader2,
  Package,
  Smartphone,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

function thumbBadgeClass(s: PackageThumbnailRecord["status"]) {
  switch (s) {
    case "APPROVED":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
    case "REJECTED":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
    default:
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
  }
}

export default function ContentApproverPackageDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params.id as string
  const focusVideoId = (searchParams.get("video") ?? "").trim()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const role = user?.role as UserRole | undefined
  const isApprover = role === "CONTENT_APPROVER"
  const isSuper = role === "SUPER_ADMIN"
  const canAccess = isApprover || isSuper

  const [pkg, setPkg] = useState<FinalPackage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)
  const [approveComments, setApproveComments] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!token || !id) return
    setLoading(true)
    setError(null)
    try {
      const res = await getPackage(token, id)
      setPkg(res.package)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [token, id])

  useEffect(() => {
    load()
  }, [load])

  const sortedVideos = useMemo(
    () => (pkg ? packageVideosSorted(pkg) : []),
    [pkg]
  )

  const deliverableLabels = useMemo(
    () => deliverableLabelsByVideoId(sortedVideos),
    [sortedVideos]
  )

  const awaitingVideos = useMemo(
    () => sortedVideos.filter((v) => v.status === "AWAITING_APPROVER"),
    [sortedVideos]
  )

  useEffect(() => {
    if (!focusVideoId || loading) return
    const t = window.setTimeout(() => {
      document
        .getElementById(`video-${focusVideoId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 100)
    return () => window.clearTimeout(t)
  }, [focusVideoId, loading])

  async function handleApprovePackage() {
    if (!token || awaitingVideos.length === 0) return
    setBusy(true)
    const comment =
      approveComments.trim() || "Final approval for English final package."
    try {
      let updated = pkg
      for (const video of awaitingVideos) {
        const res = await approvePackageVideo(token, video.id, {
          comments: comment,
        })
        updated = updated ? mergeVideoIntoPackage(updated, res.video) : updated
        setPkg(updated)
      }
      setApproveOpen(false)
      setApproveComments("")
      toast.success(
        awaitingVideos.length === 1
          ? "Package final approval recorded."
          : `Package final approval recorded for all ${awaitingVideos.length} deliverables.`
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed")
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!canAccess) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">Access denied.</p>
        <Button variant="link" asChild className="pl-0">
          <Link href="/content-approver-packages">Back</Link>
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading package…</p>
      </div>
    )
  }

  if (error || !pkg) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-destructive">{error ?? "Not found"}</p>
        <Button variant="link" asChild className="pl-0">
          <Link href="/content-approver-packages">Back</Link>
        </Button>
      </div>
    )
  }

  const packageUnlocked =
    isSuper || packageReadyForContentApproverFullView(sortedVideos)
  const lockedForApprover = isApprover && !packageUnlocked

  const showPackageApprove =
    packageUnlocked && awaitingVideos.length > 0 && canAccess

  return (
    <div className="min-h-full bg-background pb-16">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6 md:py-8">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link href="/content-approver-packages">
            <ArrowLeft className="mr-1 size-4" />
            Final packages
          </Link>
        </Button>

        <header className="space-y-3 border-b border-border pb-8">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Phase 6 · Final package · Content approver
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {pkg.name ?? pkg.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                Script:{" "}
                <span className="font-medium text-foreground">
                  {pkg.script?.title ?? "—"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Updated {formatPackageDate(pkg.updatedAt)}
              </p>
            </div>
            <Badge variant="secondary" className="w-fit shrink-0 font-normal">
              {sortedVideos.length} deliverable
              {sortedVideos.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {lockedForApprover ? (
              <>
                Full package contents (video files, metadata, thumbnails) stay
                hidden until <strong className="font-medium text-foreground">every</strong>{" "}
                deliverable has finished Medical and Content/Brand review. Below
                is a status summary only. Super Admin can always open the full
                package.
              </>
            ) : (
              <>
                Review every deliverable below, then use{" "}
                <strong className="font-medium text-foreground">
                  Final approve package
                </strong>{" "}
                when you are ready to sign off on the whole package. You cannot
                reject at this stage — escalate offline or use Super Admin
                withdraw if needed.
              </>
            )}
          </p>
        </header>

        {lockedForApprover ? (
          <Card className="border-amber-200/80 bg-amber-50/50 shadow-none dark:border-amber-900/50 dark:bg-amber-950/20">
            <CardHeader>
              <CardTitle className="text-base">
                Package not ready for full Content Approver review
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                At least one deliverable is still in Medical review or Brand
                video quality review. When all deliverables are in{" "}
                <span className="font-medium text-foreground">
                  Awaiting final approval
                </span>
                , are already approved, or withdrawn, this page will show the
                full contents and final sign-off actions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Deliverable status (summary only)
              </p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {sortedVideos.map((video) => {
                  const label =
                    deliverableLabels.get(video.id) ?? "Deliverable"
                  return (
                    <li
                      key={video.id}
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <span className="font-medium text-foreground">
                          {label}
                        </span>
                        <PackageVideoTatInline video={video} />
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "w-fit shrink-0 font-normal",
                          videoStatusBadgeClass(video.status)
                        )}
                      >
                        {VIDEO_STATUS_LABELS[video.status]}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        ) : (
          <>
        {showPackageApprove && (
          <Card className="border-primary/35 bg-primary/5 shadow-sm dark:bg-primary/10">
            <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Package className="size-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-foreground">
                    Final approval
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">
                      {awaitingVideos.length}
                    </strong>{" "}
                    deliverable
                    {awaitingVideos.length === 1 ? "" : "s"} awaiting your
                    sign-off. One action records final approval for the whole
                    package (same optional note for each deliverable).
                  </p>
                </div>
              </div>
              <Button
                className="shrink-0 gap-2 bg-green-600 text-white hover:bg-green-700"
                onClick={() => setApproveOpen(true)}
              >
                <CheckCircle2 className="size-4" />
                Final approve package
              </Button>
            </CardContent>
          </Card>
        )}

        {!showPackageApprove && sortedVideos.length > 0 && (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Nothing is in <strong>Awaiting final approval</strong> on this
            package right now. Other deliverables may still be with Medical,
            Content/Brand, or Agency — they advance independently.
          </p>
        )}

        <section aria-label="Package deliverables" className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
            Contents overview
          </h2>
          <Card className="overflow-hidden border-border shadow-sm">
            <div className="divide-y divide-border">
              {sortedVideos.map((video) => {
                const label = deliverableLabels.get(video.id) ?? "Deliverable"
                return (
                  <div
                    key={video.id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {video.type === "LONG_FORM" ? "Long-form" : "Short-form"}
                        {" · "}
                        {video.id.slice(0, 8)}…
                      </p>
                      <PackageVideoTatInline video={video} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-normal",
                          videoStatusBadgeClass(video.status)
                        )}
                      >
                        {VIDEO_STATUS_LABELS[video.status]}
                      </Badge>
                      <Button variant="outline" size="sm" asChild>
                        <a href={`#video-${video.id}`}>
                          Jump to detail
                          <ExternalLink className="ml-1 size-3.5 opacity-70" />
                        </a>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </section>

        <section aria-label="Deliverable details" className="space-y-10 pt-4">
          <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
            Deliverable details
          </h2>
          {sortedVideos.map((video) => {
            const asset = getCurrentVideoAsset(video)
            if (!asset) return null
            const pa = videoAssetToPackageAsset(asset)
            const label = deliverableLabels.get(video.id) ?? "Deliverable"
            const icon: ReactNode =
              video.type === "LONG_FORM" ? (
                <Clapperboard className="size-5" />
              ) : (
                <Smartphone className="size-5" />
              )
            const thumbs = thumbnailsOnAsset(asset)
            const isFocused = focusVideoId === video.id

            return (
              <Card
                key={video.id}
                id={`video-${video.id}`}
                className={cn(
                  "scroll-mt-24 overflow-hidden border-border shadow-sm",
                  isFocused &&
                    "ring-2 ring-primary ring-offset-2 ring-offset-background"
                )}
              >
                <CardHeader className="border-b border-border bg-muted/20 py-5 sm:py-6">
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle className="text-lg font-semibold">{label}</CardTitle>
                        <CardDescription className="mt-1">
                          {VIDEO_STATUS_LABELS[video.status]} · Video{" "}
                          <span className="font-mono text-xs">{video.id}</span>
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className={videoStatusBadgeClass(video.status)}
                        >
                          {VIDEO_STATUS_LABELS[video.status]}
                        </Badge>
                        <Badge variant="secondary" className="text-xs font-normal">
                          Video track: {TRACK_STATUS_LABELS[video.videoTrackStatus]}
                        </Badge>
                        <Badge variant="secondary" className="text-xs font-normal">
                          Metadata: {TRACK_STATUS_LABELS[video.metadataTrackStatus]}
                        </Badge>
                      </div>
                    </div>
                    <PackageVideoTatInline
                      video={video}
                      className="border-t border-border/60 pt-4"
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-8 px-4 py-6 sm:px-6">
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Video file
                    </h3>
                    <PackageInlineVideoCard
                      asset={pa}
                      label={label}
                      icon={icon}
                      videoOnly
                    />
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Metadata
                    </h3>
                    <PackageVideoMetadataProminent
                      variant="embedded"
                      deliverableLabel={label}
                      title={asset.title}
                      description={asset.description}
                      tags={asset.tags ?? undefined}
                    />
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Thumbnails
                    </h3>
                    {thumbs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">—</p>
                    ) : (
                      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {thumbs.map((t) => (
                          <li
                            key={t.id}
                            className="overflow-hidden rounded-lg border border-border bg-card"
                          >
                            <a
                              href={t.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block aspect-video bg-muted"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={t.fileUrl}
                                alt={t.fileName ?? "Thumbnail"}
                                className="size-full object-cover"
                              />
                            </a>
                            <div className="space-y-1 p-3">
                              <Badge
                                className={thumbBadgeClass(t.status)}
                                variant="secondary"
                              >
                                {t.status}
                              </Badge>
                              <p className="truncate text-xs text-muted-foreground">
                                {t.fileName}
                              </p>
                              {t.status === "REJECTED" && t.comment && (
                                <p className="text-xs text-destructive">
                                  {t.comment}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                </CardContent>
              </Card>
            )
          })}
        </section>
          </>
        )}
      </div>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Final approve package</DialogTitle>
            <DialogDescription>
              You are about to record final approval for every deliverable listed
              below. You can add one optional note; it is applied to each
              deliverable in the approval record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                Included in this approval
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm text-foreground">
                {awaitingVideos.map((v) => (
                  <li key={v.id}>
                    {deliverableLabels.get(v.id) ?? v.id}
                    <span className="text-muted-foreground">
                      {" "}
                      ({VIDEO_STATUS_LABELS[v.status]})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <Label htmlFor="approver-note">Note (optional, applied to all)</Label>
              <Textarea
                id="approver-note"
                value={approveComments}
                onChange={(e) => setApproveComments(e.target.value)}
                rows={3}
                placeholder="Optional comment for the approval record…"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 text-white hover:bg-green-700"
              onClick={() => void handleApprovePackage()}
              disabled={busy || awaitingVideos.length === 0}
            >
              {busy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 size-4" />
              )}
              Final approve package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
