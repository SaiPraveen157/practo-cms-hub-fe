"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Image from "next/image"
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
import { VideoVersionHistoryToolbar } from "@/components/video-version-history-toolbar"
import { useVideoTimestampVersionView } from "@/hooks/use-video-timestamp-version-view"
import {
  coerceVideoFileCategory,
  getUploadUrl,
  getVideo,
  getVideoComments,
  submitVideo,
  uploadFileToPresignedUrl,
} from "@/lib/videos-api"
import {
  assertDeliverableVideoFileIfVideo,
  FIRST_LINE_UP_MIXED_INPUT_ACCEPT,
} from "@/lib/video-file-validation"
import {
  findPriorVideoVersionInQueue,
  isAgencyRejectedReturn,
} from "@/lib/agency-video-resubmit"
import type {
  Video,
  VideoPhase,
  VideoStatus,
  VideoComment,
} from "@/types/video"
import { ArrowLeft, CheckCircle, Loader2, XCircle } from "lucide-react"
import {
  filterVideoCommentsForAssetVersion,
  filterVideoCommentsWithTimestamp,
  getVideoCommentAssetVersion,
  getVideoCommentTimestampSeconds,
  normalizeVideoComment,
} from "@/lib/video-comment"
import { cn } from "@/lib/utils"
import type { UserRole } from "@/types/auth"
import { toast } from "sonner"

const LIST_PATH = "/agency-poc-videos"

function stagedUploadStorageKey(videoId: string) {
  return `practo-agency-video-staged:${videoId}`
}

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

function stagedFileCategory(
  fileType: string
): "video" | "image" | "pdf" | "other" {
  if (fileType.startsWith("video/")) return "video"
  if (fileType.startsWith("image/")) return "image"
  if (fileType === "application/pdf") return "pdf"
  return "other"
}

export default function AgencyPocVideoDetailPage() {
  const params = useParams()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const role = user?.role as UserRole | undefined
  const [video, setVideo] = useState<Video | null>(null)
  const [priorVideo, setPriorVideo] = useState<Video | null>(null)
  const [priorLoading, setPriorLoading] = useState(false)
  const [comments, setComments] = useState<VideoComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** After auto-upload to S3 — preview before POST /api/videos. */
  const [pendingRegistration, setPendingRegistration] = useState<{
    fileUrl: string
    fileName: string
    fileType: string
    fileSize: number
  } | null>(null)
  const [uploadingToStorage, setUploadingToStorage] = useState(false)
  const [submittingReview, setSubmittingReview] = useState(false)
  const canAccess = role === "AGENCY_POC" || role === "SUPER_ADMIN"

  const fetchVideo = useCallback(async () => {
    if (!id) {
      setLoading(false)
      setError("Missing video ID.")
      return
    }
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await getVideo(token, id)
      setVideo(res.video)
    } catch (e) {
      setVideo(null)
      setError(e instanceof Error ? e.message : "Video not found")
    } finally {
      setLoading(false)
    }
  }, [token, id])

  const refetchVideoQuiet = useCallback(async () => {
    if (!id || !token) return
    try {
      const res = await getVideo(token, id)
      setVideo(res.video)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Video not found")
    }
  }, [token, id])

  useEffect(() => {
    if (!id || !token || !canAccess) return
    void fetchVideo()
  }, [id, token, canAccess, fetchVideo])

  /** Any AGENCY_UPLOAD_PENDING row needs upload + POST /api/videos to send to Medical Affairs. */
  const needsUpload = useMemo(() => {
    if (!video) return false
    return video.status === "AGENCY_UPLOAD_PENDING"
  }, [video])

  useEffect(() => {
    if (!needsUpload) {
      setPendingRegistration(null)
      try {
        sessionStorage.removeItem(stagedUploadStorageKey(id))
      } catch {
        /* ignore */
      }
    }
  }, [needsUpload, id])

  /** Restore staged S3 upload after refresh/remount (e.g. React Strict Mode) so Submit stays available. */
  useEffect(() => {
    if (!video || video.status !== "AGENCY_UPLOAD_PENDING") return
    try {
      const raw = sessionStorage.getItem(stagedUploadStorageKey(id))
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<{
        fileUrl: string
        fileName: string
        fileType: string
        fileSize: number
      }>
      if (
        typeof parsed.fileUrl === "string" &&
        typeof parsed.fileName === "string" &&
        typeof parsed.fileType === "string"
      ) {
        setPendingRegistration({
          fileUrl: parsed.fileUrl,
          fileName: parsed.fileName,
          fileType: parsed.fileType,
          fileSize: typeof parsed.fileSize === "number" ? parsed.fileSize : 0,
        })
      }
    } catch {
      /* ignore */
    }
  }, [id, video?.id, video?.status])

  useEffect(() => {
    if (!token || !video) {
      setPriorVideo(null)
      setPriorLoading(false)
      return
    }
    let cancelled = false

    if (video.previousVideoId) {
      setPriorLoading(true)
      void getVideo(token, video.previousVideoId)
        .then((res) => {
          if (!cancelled) setPriorVideo(res.video)
        })
        .catch(() => {
          if (!cancelled) setPriorVideo(null)
        })
        .finally(() => {
          if (!cancelled) setPriorLoading(false)
        })
      return () => {
        cancelled = true
      }
    }

    if (video.version <= 1) {
      setPriorVideo(null)
      setPriorLoading(false)
      return
    }

    setPriorLoading(true)
    void findPriorVideoVersionInQueue(token, video)
      .then((p) => {
        if (!cancelled) setPriorVideo(p)
      })
      .catch(() => {
        if (!cancelled) setPriorVideo(null)
      })
      .finally(() => {
        if (!cancelled) setPriorLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    token,
    video?.id,
    video?.previousVideoId,
    video?.scriptId,
    video?.phase,
    video?.version,
  ])

  useEffect(() => {
    if (!video || !token || !id) return
    let cancelled = false

    /** Backend embeds rejected-cut timestamp comments on GET /api/videos/:id — prefer that. */
    if (video.previousVideoComments != null) {
      const normalized = video.previousVideoComments.map((raw) =>
        normalizeVideoComment(raw as unknown as Record<string, unknown>)
      )
      if (!cancelled) {
        setComments(filterVideoCommentsWithTimestamp(normalized))
      }
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      try {
        const primary = await getVideoComments(token, id)
        const extra =
          priorVideo && priorVideo.id !== id
            ? await getVideoComments(token, priorVideo.id)
            : []
        const byId = new Map<string, VideoComment>()
        for (const c of [...primary, ...extra]) {
          byId.set(c.id, c)
        }
        if (!cancelled) setComments([...byId.values()])
      } catch {
        if (!cancelled) setComments([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    video?.id,
    video?.version,
    video?.previousVideoId,
    video?.previousVideoComments,
    token,
    id,
    priorVideo?.id,
  ])

  /**
   * Agency needs every timestamp note on this video row (e.g. v1 reviewer marks
   * while the row is already v2 awaiting re-upload — version-scoped filter would hide them).
   */
  const displayComments = useMemo(() => {
    const list = filterVideoCommentsWithTimestamp(comments)
    return [...list].sort((a, b) => {
      const va = getVideoCommentAssetVersion(a) ?? 0
      const vb = getVideoCommentAssetVersion(b) ?? 0
      if (va !== vb) return va - vb
      const ta = getVideoCommentTimestampSeconds(a) ?? 0
      const tb = getVideoCommentTimestampSeconds(b) ?? 0
      return ta - tb
    })
  }, [comments])

  const agencyVersionHistoryEnabled = Boolean(
    video?.fileUrl &&
      (video.phase === "FIRST_LINE_UP" || video.phase === "FIRST_CUT") &&
      (video.fileCategory === "video" ||
        (video.fileType ?? "").startsWith("video/"))
  )

  const versionHistory = useVideoTimestampVersionView({
    token,
    currentVideoId: id,
    liveVideoVersion: video?.version ?? 1,
    enabled: agencyVersionHistoryEnabled,
    refreshKey: `${id}-${video?.version ?? 0}`,
  })

  const agencyMainTimelineComments = useMemo(() => {
    if (
      versionHistory.isViewingArchived &&
      versionHistory.archivedDetail?.comments
    ) {
      return versionHistory.archivedDetail.comments
    }
    return displayComments
  }, [
    versionHistory.isViewingArchived,
    versionHistory.archivedDetail,
    displayComments,
  ])

  const agencyMainTimelineSrc =
    versionHistory.isViewingArchived &&
    versionHistory.archivedDetail?.fileUrl
      ? versionHistory.archivedDetail.fileUrl
      : (video?.fileUrl ?? null)

  const agencyMainTimelineMediaKey =
    versionHistory.isViewingArchived && versionHistory.archivedDetail
      ? `${versionHistory.archivedDetail.id}-v${versionHistory.archivedDetail.version}`
      : (video?.id ?? id)

  const priorTimelineComments = useMemo(() => {
    if (!priorVideo) return []
    return filterVideoCommentsForAssetVersion(
      displayComments,
      priorVideo.version
    )
  }, [displayComments, priorVideo?.version])

  const priorFileCategory = useMemo(() => {
    if (!priorVideo) return "other" as const
    const v = coerceVideoFileCategory(priorVideo)
    const ft = v.fileType ?? ""
    if (v.fileCategory === "video") return "video" as const
    if (v.fileCategory === "image") return "image" as const
    if (v.fileCategory === "pdf") return "pdf" as const
    if (v.fileUrl && ft.startsWith("video/")) return "video" as const
    if (v.fileUrl && ft.startsWith("image/")) return "image" as const
    if (v.fileUrl && ft === "application/pdf") return "pdf" as const
    return (v.fileCategory ?? "other") as "video" | "image" | "pdf" | "other"
  }, [priorVideo])

  const effectiveFileCategory = useMemo(() => {
    if (!video) return "other" as const
    const ft = video.fileType ?? ""
    if (video.fileCategory === "video") return "video" as const
    if (video.fileCategory === "image") return "image" as const
    if (video.fileCategory === "pdf") return "pdf" as const
    if (video.fileCategory === "other") return "other" as const
    if (video.fileUrl && ft.startsWith("video/")) return "video" as const
    if (video.fileUrl && ft.startsWith("image/")) return "image" as const
    if (video.fileUrl && ft === "application/pdf") return "pdf" as const
    return (video.fileCategory ?? "other") as
      | "video"
      | "image"
      | "pdf"
      | "other"
  }, [video])

  const isResubmitFlow = useMemo(
    () => !!(video && isAgencyRejectedReturn(video)),
    [video]
  )

  const clearStagedFile = useCallback(() => {
    setPendingRegistration(null)
    try {
      sessionStorage.removeItem(stagedUploadStorageKey(id))
    } catch {
      /* ignore */
    }
  }, [id])

  /** PUT file to storage — called automatically when user selects a file. */
  const uploadSelectedFileToStorage = useCallback(
    async (file: File) => {
      if (!token || !video) return
      try {
        assertDeliverableVideoFileIfVideo(file)
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Invalid file"
        toast.error("Invalid file", { description: msg })
        return
      }
      setUploadingToStorage(true)
      try {
        const fileName = file.name
        const fileType = file.type || "application/octet-stream"
        const fileSize = file.size
        const { uploadUrl, fileUrl } = await getUploadUrl(token, {
          fileName,
          fileType,
          fileSize,
        })
        await uploadFileToPresignedUrl(uploadUrl, file)
        const reg = { fileUrl, fileName, fileType, fileSize }
        setPendingRegistration(reg)
        try {
          sessionStorage.setItem(
            stagedUploadStorageKey(id),
            JSON.stringify(reg)
          )
        } catch {
          /* ignore */
        }
        toast.success("Upload complete", {
          description:
            video.phase === "FIRST_CUT"
              ? "Use Submit to Medical Affairs below to send this First Cut for review."
              : "Use Submit to Medical Affairs below to send for review.",
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed"
        toast.error("Could not upload file", { description: msg })
        setPendingRegistration(null)
      } finally {
        setUploadingToStorage(false)
      }
    },
    [token, video, id]
  )

  /** POST /api/videos — register version and send to Medical Affairs queue. */
  const handleSubmitToMedicalAffairs = async () => {
    if (!token || !video || !pendingRegistration) return
    setSubmittingReview(true)
    try {
      await submitVideo(token, {
        scriptId: video.scriptId,
        phase: video.phase,
        fileUrl: pendingRegistration.fileUrl,
        fileName: pendingRegistration.fileName,
        fileType: pendingRegistration.fileType,
        fileSize: pendingRegistration.fileSize,
        ...(isResubmitFlow ? { videoId: video.id } : {}),
      })
      toast.success(
        `${video.phase === "FIRST_CUT" ? "First Cut" : "First Line Up"} sent to Medical Affairs`,
        {
          description:
            "Medical Affairs review, then Content/Brand. TAT 24 hours.",
        }
      )
      clearStagedFile()
      await refetchVideoQuiet()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Submit failed"
      toast.error("Could not submit", { description: msg })
    } finally {
      setSubmittingReview(false)
    }
  }

  if (!canAccess) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">
          Only Agency POC (or Super Admin) can access this page.
        </p>
        <Button variant="link" asChild className="mt-2 pl-0">
          <Link href={LIST_PATH}>Back to videos</Link>
        </Button>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">Sign in to view this video.</p>
        <Button variant="link" asChild className="mt-2 pl-0">
          <Link href={LIST_PATH}>Back to videos</Link>
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !video) {
    return (
      <div className="p-6 md:p-8">
        <div className="mx-auto max-w-lg space-y-4">
          <p className="text-destructive">
            {error ?? "Could not load this video."}
          </p>
          <p className="text-sm text-muted-foreground">
            If the API nests the payload under{" "}
            <code className="text-xs">data</code>, it is now supported. You may
            also lack permission for this ID.
          </p>
          <Button variant="outline" asChild>
            <Link href={LIST_PATH}>Back to videos</Link>
          </Button>
        </div>
      </div>
    )
  }

  const fileCategory = effectiveFileCategory
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
                  <>
                    {" "}
                    · {video.uploadedBy.firstName} {video.uploadedBy.lastName}
                  </>
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

        {/* {video.rejectionComment ? (
          <Card className="border-destructive/45 bg-destructive/5 dark:bg-destructive/10">
            <CardHeader>
              <CardTitle className="text-base">Rejection feedback</CardTitle>
              <CardDescription>
                {video.rejectionComment.reviewerName} ·{" "}
                {video.rejectionComment.reviewerRole} ·{" "}
                {formatDate(video.rejectionComment.reviewedAt)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap text-foreground">
                {video.rejectionComment.comment}
              </p>
            </CardContent>
          </Card>
        ) : null} */}

        {priorLoading &&
        (video.version > 1 || video.previousVideoId) &&
        !versionHistory.showToolbar ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading previous version…
          </p>
        ) : null}

        {priorVideo && !versionHistory.showToolbar ? (
          <Card>
            <CardHeader>
              <CardTitle>Previous version (v{priorVideo.version})</CardTitle>
              <CardDescription>
                File reviewers saw when leaving timestamp feedback.{" "}
                {priorVideo.fileName
                  ? `${priorVideo.fileName} (${priorVideo.fileType ?? ""})`
                  : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {priorFileCategory === "video" ? (
                <VideoPlayerTimeline
                  src={priorVideo.fileUrl!}
                  mediaKey={`${priorVideo.id}-v${priorVideo.version}`}
                  comments={priorTimelineComments}
                  commentFormDisabled
                />
              ) : priorFileCategory === "image" ? (
                <Image
                  src={priorVideo.fileUrl!}
                  alt={priorVideo.fileName ?? "Attachment"}
                  width={1920}
                  height={1080}
                  unoptimized
                  className="max-h-[60vh] w-full rounded-lg border object-contain"
                />
              ) : priorFileCategory === "pdf" ? (
                <iframe
                  src={priorVideo.fileUrl!}
                  title={priorVideo.fileName ?? "PDF"}
                  className="h-[60vh] w-full rounded-lg border"
                />
              ) : (
                <a
                  href={priorVideo.fileUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Download {priorVideo.fileName ?? "file"}
                </a>
              )}
            </CardContent>
          </Card>
        ) : !priorLoading &&
          (video.version > 1 || video.previousVideoId) &&
          !versionHistory.showToolbar ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Previous version</CardTitle>
              <CardDescription>
                We could not load the prior file (
                {video.previousVideoId
                  ? `id ${video.previousVideoId}`
                  : "not in your queue"}
                ). Timeline comments below may still appear if the API returned
                them.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {needsUpload && canAccess ? (
          <Card>
            <CardHeader>
              <CardTitle>
                {isResubmitFlow ? "Re-upload" : "Upload"}{" "}
                {PHASE_LABELS[video.phase]} (v{video.version})
              </CardTitle>
              <CardDescription>
                {video.phase === "FIRST_CUT"
                  ? "Phase 5 — upload your new First Cut. After the file reaches storage, submit to Medical Affairs so they can review (then Content/Brand)."
                  : "Choose a file — it uploads automatically. Then submit to Medical Affairs to start review."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <input
                  type="file"
                  accept={FIRST_LINE_UP_MIXED_INPUT_ACCEPT}
                  className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground file:hover:bg-primary/90"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    setPendingRegistration(null)
                    if (f) void uploadSelectedFileToStorage(f)
                  }}
                  disabled={uploadingToStorage || submittingReview}
                />
                {uploadingToStorage ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
                    <Loader2 className="size-5 shrink-0 animate-spin" />
                    Uploading to storage…
                  </div>
                ) : null}
                {pendingRegistration && !uploadingToStorage ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={clearStagedFile}
                      disabled={submittingReview}
                    >
                      Remove and choose another file
                    </Button>
                  </div>
                ) : null}
              </div>

              {pendingRegistration && !uploadingToStorage ? (
                <div className="space-y-4 border-t border-border pt-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Ready for Medical Affairs
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pendingRegistration.fileName} — file is in storage. Submit
                      below to move this version to Medical review (then
                      Content/Brand for Phase 5).
                    </p>
                    <Button
                      type="button"
                      size="lg"
                      onClick={() => void handleSubmitToMedicalAffairs()}
                      disabled={submittingReview || uploadingToStorage}
                      className="w-full border-0 bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-white hover:opacity-90 sm:w-auto"
                    >
                      {submittingReview ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : null}
                      Submit to Medical Affairs
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Preview
                    </p>
                    {stagedFileCategory(pendingRegistration.fileType) ===
                    "video" ? (
                      <video
                        key={pendingRegistration.fileUrl}
                        src={pendingRegistration.fileUrl}
                        controls
                        playsInline
                        className="aspect-video w-full rounded-lg border bg-black"
                      />
                    ) : stagedFileCategory(pendingRegistration.fileType) ===
                      "image" ? (
                      <Image
                        src={pendingRegistration.fileUrl}
                        alt={pendingRegistration.fileName}
                        width={1920}
                        height={1080}
                        unoptimized
                        className="max-h-[60vh] w-full rounded-lg border object-contain"
                      />
                    ) : stagedFileCategory(pendingRegistration.fileType) ===
                      "pdf" ? (
                      <iframe
                        src={pendingRegistration.fileUrl}
                        title={pendingRegistration.fileName}
                        className="h-[60vh] w-full rounded-lg border"
                      />
                    ) : (
                      <a
                        href={pendingRegistration.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary underline"
                      >
                        Open {pendingRegistration.fileName}
                      </a>
                    )}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Current version</CardTitle>
            <CardDescription>
              {hasFile
                ? `${video.fileName ?? "File"} (${video.fileType ?? ""})`
                : needsUpload && pendingRegistration
                  ? "A file is ready in the Upload section — submit to Medical Affairs to attach it here."
                : needsUpload
                  ? `No file on v${video.version} yet — choose a file above, then submit to Medical Affairs.`
                  : "Awaiting first upload for this slot."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasFile ? (
              <p className="rounded-lg bg-muted/50 p-6 text-center text-sm text-muted-foreground">
                {needsUpload && pendingRegistration
                  ? "Use Submit to Medical Affairs in the Upload section to register this version."
                  : needsUpload
                    ? "After you submit to Medical Affairs, the file preview will show here."
                    : "No file uploaded yet."}
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
                  id="agency-poc-video-version"
                />
                {agencyMainTimelineSrc ? (
                  <VideoPlayerTimeline
                    src={agencyMainTimelineSrc}
                    mediaKey={agencyMainTimelineMediaKey}
                    comments={agencyMainTimelineComments}
                    commentFormDisabled
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
              <Image
                src={video.fileUrl!}
                alt={video.fileName ?? "Attachment"}
                width={1920}
                height={1080}
                unoptimized
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

        {/* {displayComments.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Reviewer timeline feedback</CardTitle>
              <CardDescription>
                Timestamped notes on this video (all versions returned by the
                API). Use them when re-uploading.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {displayComments.map((c) => {
                  const ts = getVideoCommentTimestampSeconds(c)
                  const ver = getVideoCommentAssetVersion(c)
                  return (
                    <li
                      key={c.id}
                      className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {ts != null ? (
                          <span className="font-mono font-medium text-foreground">
                            {formatVideoTimestamp(ts)}
                          </span>
                        ) : null}
                        {ver != null ? (
                          <span className="rounded-full bg-muted px-2 py-0.5">
                            File v{ver}
                          </span>
                        ) : null}
                        {c.author ? (
                          <span>
                            {c.author.firstName} {c.author.lastName} ·{" "}
                            {c.author.role}
                          </span>
                        ) : null}
                        <span>· {formatDate(c.createdAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-foreground">
                        {c.content}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        ) : null} */}

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
      </div>
    </div>
  )
}
