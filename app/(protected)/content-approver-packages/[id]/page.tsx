"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
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
import {
  approvePackageVideo,
  getPackage,
  getPackageSpecialties,
  getPackageVideoComments,
  rejectPackageVideo,
} from "@/lib/packages-api"
import { labelForSpecialtyValue } from "@/lib/package-specialty-label"
import {
  deliverableLabelsByVideoId,
  displayThumbnailStatus,
  getCurrentVideoAsset,
  mergeVideoIntoPackage,
  packageReadyForContentApproverFullView,
  packageVideosSorted,
  thumbnailsOnAsset,
  videoAssetToPackageAsset,
} from "@/lib/package-video-helpers"
import type {
  FinalPackage,
  PackageItemFeedbackEntry,
  PackageSpecialtyOption,
  PackageThumbnailRecord,
  PackageVideo,
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
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  filterVideoCommentsForAssetVersion,
  VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION,
  videoThreadBlocksApprove,
} from "@/lib/video-comment"
import { usePackageVideoThreadBlockMap } from "@/hooks/use-package-video-thread-block-map"
import { toast } from "sonner"
import {
  emptyApproverP6RejectDraft,
  PackageVideoApproverRejectDialogBody,
  type ApproverP6FieldState,
  type ApproverP6RejectDraft,
} from "@/components/packages/package-video-approver-reject-dialog-body"
import type { VideoComment } from "@/types/video"

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
  const [specialtyOptions, setSpecialtyOptions] = useState<
    PackageSpecialtyOption[]
  >([])
  const [approveOpen, setApproveOpen] = useState(false)
  const [approveComments, setApproveComments] = useState("")
  const [busy, setBusy] = useState(false)

  const [rejectTargetVideo, setRejectTargetVideo] = useState<PackageVideo | null>(
    null
  )
  const [rejectDraft, setRejectDraft] = useState<ApproverP6RejectDraft>(() =>
    emptyApproverP6RejectDraft()
  )
  const [rejectTimelineComments, setRejectTimelineComments] = useState<
    VideoComment[]
  >([])
  const [rejectTimelineLoading, setRejectTimelineLoading] = useState(false)
  const [rejectBusy, setRejectBusy] = useState(false)

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

  useEffect(() => {
    if (!token) return
    let cancelled = false
    void (async () => {
      try {
        const list = await getPackageSpecialties(token)
        if (!cancelled) setSpecialtyOptions(list)
      } catch {
        if (!cancelled) setSpecialtyOptions([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

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

  const { threadBlockByVideoId, recheckThreadBlocks } =
    usePackageVideoThreadBlockMap(token, awaitingVideos)

  const anyAwaitingThreadBlocked = useMemo(
    () => awaitingVideos.some((v) => threadBlockByVideoId[v.id]),
    [awaitingVideos, threadBlockByVideoId]
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

  useEffect(() => {
    if (!rejectTargetVideo || !token) return
    let cancelled = false
    setRejectTimelineLoading(true)
    void getPackageVideoComments(token, rejectTargetVideo.id)
      .then((list) => {
        if (cancelled) return
        const scoped = filterVideoCommentsForAssetVersion(
          list,
          rejectTargetVideo.currentVersion
        )
        const sorted = [...scoped].sort(
          (a, b) => (a.timestampSeconds ?? 0) - (b.timestampSeconds ?? 0)
        )
        setRejectTimelineComments(sorted)
      })
      .catch(() => {
        if (!cancelled) setRejectTimelineComments([])
      })
      .finally(() => {
        if (!cancelled) setRejectTimelineLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [rejectTargetVideo, token])

  function openRejectDialog(video: PackageVideo) {
    if (video.status !== "AWAITING_APPROVER") return
    setRejectTargetVideo(video)
    setRejectDraft(emptyApproverP6RejectDraft(video))
  }

  async function submitApproverP6Reject() {
    if (!token || !rejectTargetVideo) return
    const asset = getCurrentVideoAsset(rejectTargetVideo)
    if (!asset?.id) return

    const d = rejectDraft
    const itemFeedback: PackageItemFeedbackEntry[] = []

    if (d.video.flag) {
      if (!d.video.comment.trim()) {
        toast.error("Add a comment for the video file.")
        return
      }
      itemFeedback.push({
        videoAssetId: asset.id,
        field: "VIDEO",
        hasIssue: true,
        comment: d.video.comment.trim(),
      })
    }

    const pushField = (
      field: "TITLE" | "DESCRIPTION" | "TAGS",
      state: ApproverP6FieldState
    ) => {
      if (!state.flag) return
      if (!state.comment.trim()) {
        throw new Error(
          field === "TITLE"
            ? "Add a comment for the title."
            : field === "DESCRIPTION"
              ? "Add a comment for the description."
              : "Add a comment for the tags."
        )
      }
      itemFeedback.push({
        videoAssetId: asset.id,
        field,
        hasIssue: true,
        comment: state.comment.trim(),
      })
    }

    try {
      pushField("TITLE", d.title)
      pushField("DESCRIPTION", d.description)
      pushField("TAGS", d.tags)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid feedback")
      return
    }

    for (const t of thumbnailsOnAsset(asset)) {
      const row = d.thumbs[t.id]
      if (!row?.reject) continue
      if (!row.comment.trim()) {
        toast.error(
          `Add a rejection comment for thumbnail${t.fileName ? ` “${t.fileName}”` : ""}.`
        )
        return
      }
      itemFeedback.push({
        videoAssetId: asset.id,
        thumbnailId: t.id,
        field: "THUMBNAIL",
        hasIssue: true,
        comment: row.comment.trim(),
      })
    }

    if (itemFeedback.length === 0) {
      const timelineForVersion = filterVideoCommentsForAssetVersion(
        await getPackageVideoComments(token, rejectTargetVideo.id),
        rejectTargetVideo.currentVersion
      )
      const summary = d.overallComments.trim()
      const videoOnlyComment =
        summary ||
        (timelineForVersion.length > 0
          ? "Video feedback — see timestamp comments on the video."
          : "")
      if (!videoOnlyComment) {
        toast.error(
          "Add timestamp comments on the video, write an overall summary, or flag video, title, description, tags, or thumbnails — each flagged item needs a comment."
        )
        return
      }
      itemFeedback.push({
        videoAssetId: asset.id,
        field: "VIDEO",
        hasIssue: true,
        comment: videoOnlyComment,
      })
    }

    const overall =
      d.overallComments.trim() ||
      "Final package video rejected — see itemized feedback below."

    setRejectBusy(true)
    try {
      const res = await rejectPackageVideo(token, rejectTargetVideo.id, {
        overallComments: overall,
        itemFeedback,
      })
      setPkg((p) => (p ? mergeVideoIntoPackage(p, res.video) : p))
      toast.warning(res.message ?? "Video rejected — sent back for review")
      setRejectTargetVideo(null)
      setRejectDraft(emptyApproverP6RejectDraft())
      await load()
      void recheckThreadBlocks()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed")
    } finally {
      setRejectBusy(false)
    }
  }

  async function handleApprovePackage() {
    if (!token || awaitingVideos.length === 0) return
    setBusy(true)
    const comment =
      approveComments.trim() || "Final approval for English final package."
    try {
      for (const video of awaitingVideos) {
        const list = await getPackageVideoComments(token, video.id)
        if (videoThreadBlocksApprove(list, video.currentVersion)) {
          toast.error("Cannot approve yet", {
            description: `${deliverableLabels.get(video.id) ?? "A deliverable"}: ${VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION}`,
          })
          setBusy(false)
          return
        }
      }
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

  const canRejectAwaitingDeliverable = (video: PackageVideo) =>
    video.status === "AWAITING_APPROVER" && canAccess

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
                hidden until{" "}
                <strong className="font-medium text-foreground">every</strong>{" "}
                deliverable has finished Medical and Content/Brand review. Below
                is a status summary only. Super Admin can always open the full
                package.
              </>
            ) : (
              <>
                Review every deliverable below. Add optional timestamp comments
                on each video while it awaits final approval. Use{" "}
                <strong className="font-medium text-foreground">
                  Final approve package
                </strong>{" "}
                to approve all deliverables still awaiting sign-off, or reject
                an individual deliverable to send it back through Medical and
                Brand review.
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
                video quality review, so full video players stay hidden. If any
                deliverable is already{" "}
                <span className="font-medium text-foreground">
                  Awaiting final approval
                </span>
                , you can still <strong className="font-medium">reject</strong>{" "}
                it from the list below to send it back — other deliverables can
                keep moving independently. When every deliverable has left Medical
                / Brand stages (or is approved/withdrawn), the full package
                opens here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Deliverable status (summary only)
              </p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {sortedVideos.map((video) => {
                  const label = deliverableLabels.get(video.id) ?? "Deliverable"
                  return (
                    <li
                      key={video.id}
                      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <span className="font-medium text-foreground">
                          {label}
                        </span>
                        <PackageVideoTatInline video={video} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <Badge
                          variant="outline"
                          className={cn(
                            "w-fit shrink-0 font-normal",
                            videoStatusBadgeClass(video.status)
                          )}
                        >
                          {VIDEO_STATUS_LABELS[video.status]}
                        </Badge>
                        {canRejectAwaitingDeliverable(video) ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                            onClick={() => openRejectDialog(video)}
                          >
                            <XCircle className="size-3.5" />
                            Reject deliverable
                          </Button>
                        ) : null}
                      </div>
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
                <CardContent className="py-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
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
                          sign-off. Approve all at once, or reject a specific
                          deliverable to send it back through review.
                        </p>
                        {anyAwaitingThreadBlocked ? (
                          <p className="text-sm text-amber-700 dark:text-amber-400">
                            {VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 sm:justify-end lg:pt-0">
                      <Button
                        className="gap-2 bg-green-600 text-white hover:bg-green-700"
                        disabled={anyAwaitingThreadBlocked}
                        onClick={() => setApproveOpen(true)}
                      >
                        <CheckCircle2 className="size-4" />
                        Final approve package
                      </Button>
                      {awaitingVideos.map((v) => (
                        <Button
                          key={v.id}
                          type="button"
                          variant="outline"
                          className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={() => openRejectDialog(v)}
                        >
                          <XCircle className="size-4" />
                          Reject:{" "}
                          {deliverableLabels.get(v.id) ?? v.id.slice(0, 8)}
                        </Button>
                      ))}
                    </div>
                  </div>
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
                    const label =
                      deliverableLabels.get(video.id) ?? "Deliverable"
                    return (
                      <div
                        key={video.id}
                        className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                      >
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="font-medium text-foreground">{label}</p>
                          <p className="text-xs text-muted-foreground">
                            {video.type === "LONG_FORM"
                              ? "Long-form"
                              : "Short-form"}
                            {" · "}
                            {video.id.slice(0, 8)}…
                          </p>
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

            <section
              aria-label="Deliverable details"
              className="space-y-10 pt-4"
            >
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
                            <CardTitle className="text-lg font-semibold">
                              {label}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {VIDEO_STATUS_LABELS[video.status]} · Video{" "}
                              <span className="font-mono text-xs">
                                {video.id}
                              </span>
                            </CardDescription>
                          </div>
                          <div className="flex flex-col items-stretch gap-2 sm:items-end">
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                variant="outline"
                                className={videoStatusBadgeClass(video.status)}
                              >
                                {VIDEO_STATUS_LABELS[video.status]}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className="text-xs font-normal"
                              >
                                Video track:{" "}
                                {TRACK_STATUS_LABELS[video.videoTrackStatus]}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className="text-xs font-normal"
                              >
                                Metadata:{" "}
                                {TRACK_STATUS_LABELS[video.metadataTrackStatus]}
                              </Badge>
                            </div>
                            {packageUnlocked &&
                            canRejectAwaitingDeliverable(video) ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                                onClick={() => openRejectDialog(video)}
                              >
                                <XCircle className="size-4" />
                                Reject deliverable
                              </Button>
                            ) : null}
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
                          specialtyOptions={specialtyOptions}
                          packageVideo={
                            packageUnlocked &&
                            canRejectAwaitingDeliverable(video)
                              ? video
                              : null
                          }
                          onPackageVideoCommentsUpdated={() => {
                            void recheckThreadBlocks()
                          }}
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
                          doctorName={asset.doctorName}
                          specialtyLabel={labelForSpecialtyValue(
                            asset.specialty,
                            specialtyOptions
                          )}
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
                            {thumbs.map((t) => {
                              const thumbUiStatus = displayThumbnailStatus(
                                video,
                                t.status
                              )
                              return (
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
                                      className={thumbBadgeClass(thumbUiStatus)}
                                      variant="secondary"
                                    >
                                      {thumbUiStatus}
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
                              )
                            })}
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
              You are about to record final approval for every deliverable
              listed below. You can add one optional note; it is applied to each
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
              <Label htmlFor="approver-note">
                Note (optional, applied to all)
              </Label>
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
              disabled={
                busy || awaitingVideos.length === 0 || anyAwaitingThreadBlocked
              }
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

      <Dialog
        open={rejectTargetVideo != null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTargetVideo(null)
            setRejectDraft(emptyApproverP6RejectDraft())
            setRejectTimelineComments([])
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="flex max-h-[min(90vh,44rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        >
          {rejectTargetVideo ? (
            <PackageVideoApproverRejectDialogBody
              video={rejectTargetVideo}
              deliverableLabel={
                deliverableLabels.get(rejectTargetVideo.id) ?? "Deliverable"
              }
              draft={rejectDraft}
              setDraft={setRejectDraft}
              timelineComments={rejectTimelineComments}
              timelineLoading={rejectTimelineLoading}
              onCancel={() => {
                setRejectTargetVideo(null)
                setRejectDraft(emptyApproverP6RejectDraft())
                setRejectTimelineComments([])
              }}
              onSubmit={() => void submitApproverP6Reject()}
              isPending={rejectBusy}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
