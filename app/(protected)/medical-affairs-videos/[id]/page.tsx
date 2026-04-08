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
  getVideoStats,
  approveVideo,
  rejectVideo,
  getVideoComments,
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
import type { UserRole } from "@/types/auth"
import { ArrowLeft, CheckCircle, Loader2, XCircle } from "lucide-react"
import VideoPlayerTimeline from "@/components/VideoPlayerTimeline"
import {
  VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION,
  filterVideoCommentsForAssetVersion,
  videoThreadBlocksApprove,
} from "@/lib/video-comment"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

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

export default function VideoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [video, setVideo] = useState<Video | null>(null)
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

  const role = (user?.role ?? null) as UserRole | null
  const isMedical = role === "MEDICAL_AFFAIRS"
  const isContentBrand = role === "CONTENT_BRAND"
  const isAgency = role === "AGENCY_POC"
  const canAccess =
    isAgency || isMedical || isContentBrand || role === "SUPER_ADMIN"

  const canMedicalReview = isMedical && video?.status === "MEDICAL_REVIEW"
  const canContentBrandApprove =
    isContentBrand && video?.status === "CONTENT_BRAND_REVIEW"
  const showApprove = canMedicalReview || canContentBrandApprove
  const showReject = canMedicalReview

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
    fetchVideo()
  }, [fetchVideo])

  useEffect(() => {
    if (!token) return
    getVideoStats(token)
      .then(setVideoStats)
      .catch(() => setVideoStats(null))
  }, [token])

  useEffect(() => {
    if (video) fetchComments()
  }, [video?.id, video?.version, fetchComments])

  const versionScopedComments = useMemo(
    () =>
      video
        ? filterVideoCommentsForAssetVersion(comments, video.version)
        : [],
    [comments, video?.version]
  )

  const threadBlocksApprove =
    video != null && videoThreadBlocksApprove(comments, video.version)

  async function handleApprove() {
    if (!token || !id) return
    if (video && videoThreadBlocksApprove(comments, video.version)) {
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
      const flu = video?.phase === "FIRST_LINE_UP"
      toast.success(flu ? "First Line Up approved" : "First Cut approved", {
        description: flu
          ? "Content/Brand reviews the rough cut (Phase 4)."
          : "Content/Brand final review — they may approve or request changes (Phase 5).",
      })
      router.push("/medical-affairs-videos")
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
    const commentsTrim = rejectComments.trim()
    if (!commentsTrim) {
      toast.error("Comments required", {
        description: "Please provide feedback when requesting changes.",
      })
      return
    }
    setError(null)
    setRejecting(true)
    try {
      const phaseAtReject = video?.phase
      const res = await rejectVideo(token, id, { comments: commentsTrim })
      setRejectDialogOpen(false)
      setRejectComments("")
      if (res.newVersion) {
        toast.warning("Changes requested", {
          description:
            phaseAtReject === "FIRST_CUT"
              ? `New version v${res.newVersion.version} — Agency re-uploads First Cut; you review (Step D) before Content/Brand (Step E).`
              : `New version v${res.newVersion.version} — Agency re-uploads First Line Up for your review.`,
        })
      } else {
        toast.warning("Changes requested", {
          description:
            phaseAtReject === "FIRST_CUT"
              ? "Agency re-uploads First Cut; you review again before Content/Brand."
              : "Agency will re-upload First Line Up.",
        })
      }
      router.push("/medical-affairs-videos")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reject"
      setError(msg)
      toast.error("Could not request changes", { description: msg })
    } finally {
      setRejecting(false)
    }
  }

  if (!canAccess) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">
          You do not have access to this video.
        </p>
        <Button variant="link" asChild className="mt-2 pl-0">
          <Link href="/medical-affairs-videos">Back to videos</Link>
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

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link href="/medical-affairs-videos">
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
              {video.phase === "FIRST_LINE_UP"
                ? hasFile
                  ? `Phase 4 — First Line Up. ${video.fileName ?? "File"} (${video.fileType ?? ""})`
                  : "Phase 4 — Awaiting First Line Up from Agency."
                : hasFile
                  ? `Phase 5 — First Cut (full draft). ${video.fileName ?? "File"} (${video.fileType ?? ""})`
                  : "Phase 5 — Awaiting First Cut from Agency."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasFile ? (
              <p className="rounded-lg bg-muted/50 p-6 text-center text-sm text-muted-foreground">
                No file uploaded yet
              </p>
            ) : fileCategory === "video" ? (
              <VideoPlayerTimeline
                src={video.fileUrl!}
                mediaKey={video.id}
                comments={versionScopedComments}
                onAddComment={async ({ content, timestampSeconds }) => {
                  if (!token || !id) return
                  await addVideoComment(token, id, {
                    content,
                    timestampSeconds,
                    assetVersion: video.version,
                  })
                  await fetchComments()
                  toast.success("Comment added")
                }}
              />
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
                    ) : (
                      <XCircle className="size-4 text-amber-600" />
                    )}
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

        {showApprove && threadBlocksApprove ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
            <p className="font-medium">Approve disabled</p>
            <p className="mt-1 text-muted-foreground dark:text-amber-100/90">
              {VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION}
            </p>
          </div>
        ) : null}

        {(showApprove || showReject) && (
          <div className="flex flex-wrap gap-2 border-t pt-6">
            {showApprove && (
              <Button
                className="gap-1.5 bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
                onClick={() => setApproveDialogOpen(true)}
                disabled={threadBlocksApprove}
              >
                <CheckCircle className="size-4" />
                Approve
              </Button>
            )}
            {showReject && (
              <Button
                variant="destructive"
                className="gap-1.5"
                onClick={() => setRejectDialogOpen(true)}
              >
                <XCircle className="size-4" />
                Request changes
              </Button>
            )}
          </div>
        )}
      </div>

      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="gap-6 p-6 sm:max-w-lg sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle>
              {video.phase === "FIRST_LINE_UP"
                ? "Approve First Line Up"
                : "Approve First Cut (medical)"}
            </DialogTitle>
            <DialogDescription>
              {video.phase === "FIRST_LINE_UP"
                ? "Sends rough cut to Content/Brand (Phase 4). Comments optional."
                : "Sends full draft to Content/Brand for final brand decision (Phase 5). Comments optional."}
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
              placeholder="e.g. Medically accurate. Looks good."
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
              Request changes —{" "}
              {video.phase === "FIRST_LINE_UP" ? "First Line Up" : "First Cut"}
            </DialogTitle>
            <DialogDescription>
              {video.phase === "FIRST_LINE_UP"
                ? "Agency re-uploads the rough cut. Comments required. TAT 24 hours."
                : "Agency re-uploads First Cut; you will review again before Content/Brand. Comments required. TAT 24 hours."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-comments">Comments (required)</Label>
            <Textarea
              id="reject-comments"
              value={rejectComments}
              onChange={(e) => setRejectComments(e.target.value)}
              placeholder="e.g. Audio sync issue at 00:45 — please fix and re-upload."
              rows={3}
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
              disabled={!rejectComments.trim() || rejecting}
            >
              {rejecting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Request changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
