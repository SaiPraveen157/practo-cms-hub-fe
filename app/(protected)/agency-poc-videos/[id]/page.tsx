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
import { Textarea } from "@/components/ui/textarea"
import { useAuthStore } from "@/store"
import { getVideo, getVideoComments, addVideoComment } from "@/lib/videos-api"
import type { Video, VideoPhase, VideoStatus, VideoComment } from "@/types/video"
import { ArrowLeft, CheckCircle, Loader2, MessageSquare, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const LIST_PATH = "/agency-poc-videos"

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

export default function AgencyPocVideoDetailPage() {
  const params = useParams()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [video, setVideo] = useState<Video | null>(null)
  const [comments, setComments] = useState<VideoComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newComment, setNewComment] = useState("")
  const [addingComment, setAddingComment] = useState(false)

  const isAgency = user?.role === "AGENCY_POC"

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

  async function handleAddComment() {
    if (!token || !id || !newComment.trim()) return
    setAddingComment(true)
    try {
      await addVideoComment(token, id, newComment.trim())
      setNewComment("")
      fetchComments()
      toast.success("Comment added")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add comment")
    } finally {
      setAddingComment(false)
    }
  }

  if (!isAgency) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">Only Agency POC can access this page.</p>
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
              <video
                src={video.fileUrl!}
                controls
                className="w-full rounded-lg border bg-black"
              >
                Your browser does not support the video tag.
              </video>
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="size-5" />
              Comments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Textarea
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={2}
                className="min-h-[80px] resize-y"
                disabled={addingComment}
              />
              <Button
                onClick={handleAddComment}
                disabled={!newComment.trim() || addingComment}
                className="shrink-0 border-0 bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-white hover:opacity-90"
              >
                {addingComment ? <Loader2 className="size-4 animate-spin" /> : "Post"}
              </Button>
            </div>
            <ul className="space-y-2">
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              ) : (
                comments.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm"
                  >
                    <p className="font-medium">
                      {c.author ? `${c.author.firstName} ${c.author.lastName}` : "Unknown"}
                    </p>
                    <p className="mt-1 text-muted-foreground">{c.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
