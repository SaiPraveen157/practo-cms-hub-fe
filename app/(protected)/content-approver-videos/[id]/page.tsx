"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
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
import { useAuthStore } from "@/store"
import VideoPlayerTimeline from "@/components/VideoPlayerTimeline"
import { getVideo, getVideoComments, addVideoComment } from "@/lib/videos-api"
import type { Video, VideoPhase, VideoStatus, VideoComment } from "@/types/video"
import { ArrowLeft, CheckCircle, Loader2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const LIST_PATH = "/content-approver-videos"

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

export default function ContentApproverVideoDetailPage() {
  const params = useParams()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [video, setVideo] = useState<Video | null>(null)
  const [comments, setComments] = useState<VideoComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isContentApprover = user?.role === "CONTENT_APPROVER"

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
    if (video) fetchComments()
  }, [video?.id, fetchComments])

  if (!isContentApprover) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">Only Content Approver can access this page.</p>
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
                  <> · {video.uploadedBy.firstName} {video.uploadedBy.lastName}</>
                )}
              </span>
            </div>
            {video.tat && (
              <p className="mt-1 text-sm text-muted-foreground">
                TAT {video.tat.limitHours}h · Due {formatDate(video.tat.dueAt)}
              </p>
            )}
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
              {hasFile
                ? `${video.fileName ?? "File"} (${video.fileType ?? ""})`
                : "Awaiting upload."}
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
                comments={comments}
                onAddComment={async ({ content, timestampSeconds }) => {
                  if (!token || !id) return
                  await addVideoComment(token, id, {
                    content,
                    timestampSeconds,
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
              <CardDescription>Decisions and comments from reviewers</CardDescription>
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
                    <p className="mt-2 text-sm text-muted-foreground">{r.comments}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
