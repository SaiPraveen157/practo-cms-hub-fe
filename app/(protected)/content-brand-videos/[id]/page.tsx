"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
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
  getVideo,
  getVideoComments,
  getVideoStats,
  approveVideo,
  rejectVideo,
  addVideoComment,
} from "@/lib/videos-api"
import type {
  Video,
  VideoPhase,
  VideoStatus,
  VideoComment,
  VideoStatsResponse,
} from "@/types/video"
import { VideoTatBar, resolveVideoTat } from "@/components/video-tat-bar"
import { ArrowLeft, CheckCircle, Loader2, XCircle } from "lucide-react"
import VideoPlayerTimeline from "@/components/VideoPlayerTimeline"
import { VideoVersionHistoryToolbar } from "@/components/video-version-history-toolbar"
import { useVideoTimestampVersionView } from "@/hooks/use-video-timestamp-version-view"
import {
  VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION,
  filterVideoCommentsForAssetVersion,
  videoThreadBlocksApprove,
} from "@/lib/video-comment"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const LIST_PATH = "/content-brand-videos"

const PHASE_LABELS: Record<VideoPhase, string> = {
  FIRST_LINE_UP: "First Line Up",
  FIRST_CUT: "First Cut",
}

const STATUS_LABELS: Record<VideoStatus, string> = {
  AGENCY_UPLOAD_PENDING: "Awaiting upload",
  MEDICAL_REVIEW: "Medical Review",
  CONTENT_BRAND_REVIEW: "Content/Brand Review",
  APPROVED: "Approved",
}

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return s
  }
}

export default function ContentBrandVideoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [video, setVideo] = useState<Video | null>(null)
  /** Timestamp thread — Phase 4 (First Line Up) and Phase 5 (First Cut), same as Medical Affairs video detail. */
  const [comments, setComments] = useState<VideoComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [approveComments, setApproveComments] = useState("")
  const [rejectComments, setRejectComments] = useState("")
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [videoStats, setVideoStats] = useState<VideoStatsResponse | null>(null)

  const isContentBrand = user?.role === "CONTENT_BRAND"

  const fetchVideo = useCallback(async () => {
    if (!token || !id) return
    setLoading(true)
    setError(null)
    try {
      const res = await getVideo(token, id)
      setVideo(res.video)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Video not found")
    } finally {
      setLoading(false)
    }
  }, [token, id])

  useEffect(() => {
    fetchVideo()
  }, [fetchVideo])

  useEffect(() => {
    if (!token) return
    getVideoStats(token)
      .then(setVideoStats)
      .catch(() => setVideoStats(null))
  }, [token])

  const fetchComments = useCallback(async () => {
    if (!token || !id) return
    try {
      const list = await getVideoComments(token, id)
      setComments(list)
    } catch {
      setComments([])
    }
  }, [token, id])

  useEffect(() => {
    if (
      !video ||
      (video.phase !== "FIRST_CUT" && video.phase !== "FIRST_LINE_UP")
    ) {
      setComments([])
      return
    }
    void fetchComments()
  }, [video?.id, video?.version, video?.phase, fetchComments])

  const versionScopedComments = useMemo(
    () =>
      video &&
      (video.phase === "FIRST_CUT" || video.phase === "FIRST_LINE_UP")
        ? filterVideoCommentsForAssetVersion(comments, video.version)
        : [],
    [comments, video?.version, video?.phase]
  )

  const versionHistoryEnabled = Boolean(
    video?.fileUrl &&
      (video.fileCategory === "video" ||
        (video.fileType ?? "").startsWith("video/")) &&
      (video.phase === "FIRST_CUT" || video.phase === "FIRST_LINE_UP")
  )

  const versionHistory = useVideoTimestampVersionView({
    token,
    currentVideoId: id,
    liveVideoVersion: video?.version ?? 1,
    enabled: versionHistoryEnabled,
    refreshKey: `${id}-${video?.version ?? 0}`,
  })

  const timelinePlayerComments = useMemo(() => {
    if (
      versionHistory.isViewingArchived &&
      versionHistory.archivedDetail?.comments
    ) {
      return versionHistory.archivedDetail.comments
    }
    return versionScopedComments
  }, [
    versionHistory.isViewingArchived,
    versionHistory.archivedDetail,
    versionScopedComments,
  ])

  const timelinePlayerSrc =
    versionHistory.isViewingArchived &&
    versionHistory.archivedDetail?.fileUrl
      ? versionHistory.archivedDetail.fileUrl
      : video?.fileUrl ?? null

  const timelineMediaKey =
    versionHistory.isViewingArchived && versionHistory.archivedDetail
      ? `${versionHistory.archivedDetail.id}-v${versionHistory.archivedDetail.version}`
      : (video?.id ?? id)

  const threadBlocksApprove =
    video != null &&
    !versionHistory.isViewingArchived &&
    (video.phase === "FIRST_CUT" || video.phase === "FIRST_LINE_UP") &&
    videoThreadBlocksApprove(comments, video.version)

  async function handleApprove() {
    if (!token || !id) return
    if (
      video &&
      !versionHistory.isViewingArchived &&
      (video.phase === "FIRST_CUT" || video.phase === "FIRST_LINE_UP") &&
      videoThreadBlocksApprove(comments, video.version)
    ) {
      toast.error("Cannot approve yet", {
        description: VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION,
      })
      return
    }
    setError(null)
    setApproving(true)
    try {
      await approveVideo(token, id, {
        comments: approveComments.trim() || undefined,
      })
      setApproveDialogOpen(false)
      setApproveComments("")
      const isFlu = video?.phase === "FIRST_LINE_UP"
      toast.success(isFlu ? "First Line Up approved" : "First Cut approved", {
        description: isFlu
          ? "Agency can upload First Cut (Phase 5). This video is complete for Phase 4."
          : "Video workflow is complete for this script.",
      })
      router.push(LIST_PATH)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to approve"
      setError(msg)
      toast.error("Could not approve", { description: msg })
    } finally {
      setApproving(false)
    }
  }

  async function handleReject() {
    if (!token || !id) return
    const c = rejectComments.trim()
    if (!c) {
      toast.error("Feedback required", {
        description: "Please tell Agency what to change before they re-upload.",
      })
      return
    }
    setError(null)
    setRejecting(true)
    try {
      const phaseAtReject = video?.phase
      const res = await rejectVideo(token, id, { comments: c })
      setRejectDialogOpen(false)
      setRejectComments("")
      if (phaseAtReject === "FIRST_LINE_UP" && res.newVersion) {
        toast.warning("First Line Up — sent back to Agency", {
          description: `Version v${res.newVersion.version} awaits Agency re-upload of the rough cut, then Medical Affairs review before you see it again. TAT 24h per stage.`,
        })
      } else if (phaseAtReject === "FIRST_CUT" && res.newVersion) {
        toast.warning("First Cut — sent back to Agency", {
          description: `Version v${res.newVersion.version} awaits Agency upload. Then Medical reviews, then you again. TAT 24h per stage.`,
        })
      } else {
        toast.warning("Changes requested", {
          description: res.newVersion
            ? `Version v${res.newVersion.version} is with Agency for re-upload.`
            : "Agency will re-upload; Medical reviews again before Content/Brand.",
        })
      }
      router.push(LIST_PATH)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reject"
      setError(msg)
      toast.error("Could not request changes", { description: msg })
    } finally {
      setRejecting(false)
    }
  }

  if (!isContentBrand) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">
          Only Content/Brand can access this page.
        </p>
        <Button variant="link" asChild className="mt-2 pl-0">
          <Link href={LIST_PATH}>Back to videos</Link>
        </Button>
      </div>
    )
  }

  if (loading || !video) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const fileCategory = video.fileCategory ?? "other"
  const hasFile = !!video.fileUrl
  const canApprove = video.status === "CONTENT_BRAND_REVIEW"
  /** Same POST /api/videos/:id/reject as Medical — Brand can request changes in Phase 4 or 5. */
  const canRejectContentBrand =
    canApprove &&
    (video.phase === "FIRST_LINE_UP" || video.phase === "FIRST_CUT")
  const isFirstLineUp = video.phase === "FIRST_LINE_UP"

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link href={LIST_PATH}>
              <ArrowLeft className="mr-1 size-4" />
              Back to videos
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {video.script?.title ?? "Untitled script"}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{PHASE_LABELS[video.phase]}</Badge>
              <Badge variant="outline">{STATUS_LABELS[video.status]}</Badge>
              <span className="text-xs text-muted-foreground">
                Version {video.version}
                {video.uploadedBy && (
                  <>
                    {" "}
                    · {video.uploadedBy.firstName} {video.uploadedBy.lastName}
                  </>
                )}
              </span>
            </div>
            <VideoTatBar
              className="mt-3 w-full min-w-0"
              tat={resolveVideoTat(
                video,
                videoStats?.tatConfig?.limitHours ?? 24
              )}
              repeatCycleHours={videoStats?.tatConfig?.repeatCycleHours ?? 6}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Video / File</CardTitle>
            <CardDescription>
              {isFirstLineUp
                ? hasFile
                  ? `Phase 4 — First Line Up (rough cut). ${video.fileName ?? "File"} (${video.fileType ?? ""}). Use the scrubber to add timestamp comments during Content/Brand review.`
                  : "Phase 4 — Awaiting First Line Up from Agency."
                : hasFile
                  ? `Phase 5 — First Cut (full draft). ${video.fileName ?? "File"} (${video.fileType ?? ""}). Use the scrubber to add timestamp comments during Content/Brand review.`
                  : "Phase 5 — Awaiting First Cut from Agency."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasFile ? (
              <p className="rounded-lg bg-muted/50 p-6 text-center text-sm text-muted-foreground">
                No file uploaded yet
              </p>
            ) : fileCategory === "video" ? (
              <div className="space-y-4">
                {versionHistory.listError ? (
                  <p className="text-xs text-muted-foreground">
                    {versionHistory.listError}
                  </p>
                ) : null}
                {versionHistory.detailError ? (
                  <p className="text-xs text-destructive">
                    {versionHistory.detailError}
                  </p>
                ) : null}
                <VideoVersionHistoryToolbar
                  showToolbar={versionHistory.showToolbar}
                  listLoading={versionHistory.listLoading}
                  selectValue={versionHistory.selectValue}
                  onSelectValueChange={versionHistory.onSelectValueChange}
                  versionOptions={versionHistory.versionOptions}
                  isViewingArchived={versionHistory.isViewingArchived}
                  detailLoading={versionHistory.detailLoading}
                  id="content-brand-video-version"
                />
                {timelinePlayerSrc ? (
                  <VideoPlayerTimeline
                    src={timelinePlayerSrc}
                    mediaKey={timelineMediaKey}
                    comments={timelinePlayerComments}
                    commentFormDisabled={
                      versionHistory.isViewingArchived || !canApprove
                    }
                    onAddComment={
                      versionHistory.isViewingArchived || !canApprove
                        ? undefined
                        : async ({ content, timestampSeconds }) => {
                            if (!token || !id || !video) return
                            await addVideoComment(token, id, {
                              content,
                              timestampSeconds,
                              assetVersion: video.version,
                            })
                            await fetchComments()
                            toast.success("Comment added")
                          }
                    }
                  />
                ) : versionHistory.isViewingArchived &&
                  versionHistory.detailLoading ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading file for this version…
                  </p>
                ) : versionHistory.isViewingArchived ? (
                  <p className="text-sm text-muted-foreground">
                    No video file for this version.
                  </p>
                ) : null}
              </div>
            ) : fileCategory === "image" ? (
              <img
                src={video.fileUrl!}
                alt={video.fileName ?? "Attachment"}
                className="max-h-[60vh] w-full rounded-lg border object-contain"
              />
            ) : fileCategory === "pdf" ? (
              <iframe
                src={video.fileUrl!}
                title={video.fileName ?? "PDF"}
                className="h-[60vh] w-full rounded-lg border"
              />
            ) : (
              <a
                href={video.fileUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Download {video.fileName ?? "file"}
              </a>
            )}
          </CardContent>
        </Card>

        {video.reviews && video.reviews.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Review history</CardTitle>
              <CardDescription>
                Decisions and comments from reviewers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {video.reviews.map((r) => (
                <div
                  key={r.id}
                  className={cn(
                    "rounded-lg border p-3",
                    r.decision === "APPROVED"
                      ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
                      : "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {r.decision === "APPROVED" ? (
                      <CheckCircle className="size-4 text-green-600" />
                    ) : null}
                    <span className="font-medium">{r.decision}</span>
                    <span className="text-xs text-muted-foreground">
                      at {r.stageAtReview} · {formatDate(r.reviewedAt)}
                    </span>
                    {r.reviewer && (
                      <span className="text-xs text-muted-foreground">
                        · {r.reviewer.firstName} {r.reviewer.lastName}
                      </span>
                    )}
                  </div>
                  {r.comments && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {r.comments}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {canApprove && threadBlocksApprove && !versionHistory.isViewingArchived ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
            <p className="font-medium">Approve disabled</p>
            <p className="mt-1 text-muted-foreground dark:text-amber-100/90">
              {VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION}
            </p>
          </div>
        ) : null}

        {canApprove && !versionHistory.isViewingArchived && (
          <div className="flex flex-wrap gap-2 border-t pt-6">
            {canRejectContentBrand && (
              <Button
                variant="destructive"
                className="gap-1.5"
                onClick={() => setRejectDialogOpen(true)}
              >
                <XCircle className="size-4" />
                {isFirstLineUp
                  ? "Request changes (First Line Up)"
                  : "Request changes (First Cut)"}
              </Button>
            )}
            <Button
              className="gap-1.5 bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
              onClick={() => setApproveDialogOpen(true)}
              disabled={threadBlocksApprove}
            >
              <CheckCircle className="size-4" />
              {isFirstLineUp ? "Approve First Line Up" : "Approve First Cut"}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="gap-6 p-6 sm:max-w-lg sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle>
              {isFirstLineUp
                ? "Approve First Line Up"
                : "Approve First Cut (final)"}
            </DialogTitle>
            <DialogDescription>
              {isFirstLineUp
                ? "Approves the rough cut. Agency can then upload First Cut (Phase 5). Resolve open timestamp threads before approving. Overall comments optional."
                : "Final brand approval — completes the video for this script. Resolve open timestamp threads before approving. Overall comments optional."}
            </DialogDescription>
          </DialogHeader>
          {threadBlocksApprove ? (
            <p className="text-sm text-muted-foreground">
              {VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="approve-comments">Comments (optional)</Label>
            <Textarea
              id="approve-comments"
              value={approveComments}
              onChange={(e) => setApproveComments(e.target.value)}
              placeholder={
                isFirstLineUp
                  ? "e.g. On-brand for the rough cut."
                  : "e.g. Final cut approved for release."
              }
              rows={3}
              className="resize-y"
            />
          </div>
          <DialogFooter className="-mx-6 -mb-6 gap-3 px-6 pb-6 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setApproveDialogOpen(false)}
              disabled={approving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approving || threadBlocksApprove}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {approving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="gap-6 p-6 sm:max-w-lg sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle>
              {isFirstLineUp
                ? "Request changes (First Line Up)"
                : "Request changes (First Cut)"}
            </DialogTitle>
            <DialogDescription>
              {isFirstLineUp
                ? "Sends the rough cut back to Agency for re-upload (same reject flow as Medical Affairs on video cuts). After re-upload, Medical Affairs reviews again before you see the next version. Feedback is required. TAT 24 hours per stage."
                : "Sends the video back to Agency. After re-upload, Medical Affairs reviews again, then Content/Brand. Feedback is required. TAT 24 hours."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-comments">Feedback (required)</Label>
            <Textarea
              id="reject-comments"
              value={rejectComments}
              onChange={(e) => setRejectComments(e.target.value)}
              placeholder={
                isFirstLineUp
                  ? "e.g. Rough cut pacing and supers need revision before First Cut."
                  : "e.g. Adjust end card branding and re-upload."
              }
              rows={4}
              className="resize-y"
            />
          </div>
          <DialogFooter className="-mx-6 -mb-6 gap-3 px-6 pb-6 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={rejecting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejecting || !rejectComments.trim()}
            >
              {rejecting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Reject & send feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
