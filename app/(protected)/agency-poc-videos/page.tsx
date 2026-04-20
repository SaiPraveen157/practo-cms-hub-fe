"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
  getVideoQueue,
  getVideoStats,
  uploadVideoFlow,
} from "@/lib/videos-api"
import { FIRST_LINE_UP_MIXED_INPUT_ACCEPT } from "@/lib/video-file-validation"
import { isAgencyRejectedReturn } from "@/lib/agency-video-resubmit"
import { getScriptQueue } from "@/lib/scripts-api"
import { getAgencyVideoCardPhaseTags } from "@/lib/agency-video-phase-tags"
import type { Script } from "@/types/script"
import type { Video, VideoPhase, VideoStatus } from "@/types/video"
import { VideoTatBar, resolveVideoTat } from "@/components/video-tat-bar"
import { Loader2, Search, Upload, Video as VideoIcon } from "lucide-react"
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

function getStatusPillClass(status: VideoStatus): string {
  switch (status) {
    case "AGENCY_UPLOAD_PENDING":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
    case "MEDICAL_REVIEW":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
    case "CONTENT_BRAND_REVIEW":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200"
    case "APPROVED":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
    default:
      return "bg-muted text-muted-foreground"
  }
}

interface VideoCardProps {
  video: Video
  scriptFromQueue: Script | undefined
  allVideos: Video[]
  onView: () => void
  onUpload?: () => void
  getStatusPillClass: (status: VideoStatus) => string
  tatLimitHours: number
  repeatCycleHours: number
}

function VideoCard({
  video,
  scriptFromQueue,
  allVideos,
  onView,
  onUpload,
  getStatusPillClass,
  tatLimitHours,
  repeatCycleHours,
}: VideoCardProps) {
  const phaseTags = getAgencyVideoCardPhaseTags(
    scriptFromQueue,
    allVideos,
    video.scriptId
  )
  const rejectedReturn = isAgencyRejectedReturn(video)
  return (
    <Card
      className={cn(
        "flex flex-col overflow-hidden rounded-xl shadow-sm ring-1 ring-border/50 transition-shadow",
        "cursor-pointer hover:shadow-md",
        rejectedReturn &&
          "border-2 border-destructive/55 ring-0 dark:border-destructive/50"
      )}
      onClick={onView}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onView()
        }
      }}
    >
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <span
            className={cn(
              "inline-flex min-w-0 max-w-full rounded-full px-2 py-0.5 text-[10px] leading-snug font-medium wrap-break-word sm:text-xs",
              phaseTags.phase4.className
            )}
          >
            {phaseTags.phase4.label}
          </span>
          <span
            className={cn(
              "inline-flex min-w-0 max-w-full rounded-full px-2 py-0.5 text-[10px] leading-snug font-medium wrap-break-word sm:text-xs",
              phaseTags.phase5.className
            )}
          >
            {phaseTags.phase5.label}
          </span>
          {rejectedReturn ? (
            <span className="inline-flex shrink-0 rounded-full border border-destructive/40 bg-destructive/15 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-destructive uppercase dark:bg-destructive/20">
              Rejected
            </span>
          ) : null}
          <span
            className={cn(
              "inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium uppercase",
              getStatusPillClass(video.status)
            )}
          >
            {STATUS_LABELS[video.status]}
          </span>
          <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
            {PHASE_LABELS[video.phase]} · v{video.version}
          </span>
        </div>
        <h3 className="min-w-0 text-lg leading-tight font-semibold text-foreground">
          {video.script?.title ?? "Untitled script"}
        </h3>
        <div className="text-sm text-muted-foreground">
          {video.fileUrl ? (
            <span>{video.fileName ?? "File attached"}</span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              {rejectedReturn ? "Awaiting re-upload" : "Awaiting upload"}
            </span>
          )}
          {video.uploadedBy && (
            <span className="ml-2">
              · {video.uploadedBy.firstName} {video.uploadedBy.lastName}
            </span>
          )}
        </div>
        <VideoTatBar
          className="pt-1"
          tat={resolveVideoTat(video, tatLimitHours)}
          repeatCycleHours={repeatCycleHours}
        />
        <div className="mt-auto flex flex-wrap gap-2">
          {onUpload && (
            <Button
              size="sm"
              className="gap-1.5 border-0 bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-white hover:opacity-90"
              onClick={(e) => {
                e.stopPropagation()
                onUpload()
              }}
            >
              <Upload className="size-4" />
              {rejectedReturn ? "Re-upload" : "Upload"}{" "}
              {video.phase === "FIRST_LINE_UP" ? "First Line Up" : "First Cut"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function AgencyPocVideosPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [videos, setVideos] = useState<Video[]>([])
  const [scriptById, setScriptById] = useState<Map<string, Script>>(
    () => new Map()
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [stats, setStats] = useState<Awaited<
    ReturnType<typeof getVideoStats>
  > | null>(null)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploadVideo, setUploadVideo] = useState<Video | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadStep, setUploadStep] = useState<
    "idle" | "url" | "put" | "submit"
  >("idle")
  const [uploading, setUploading] = useState(false)
  const [phaseTab, setPhaseTab] = useState<VideoPhase>("FIRST_LINE_UP")
  const [statusSubTab, setStatusSubTab] = useState<
    "all" | "approved" | "rejected"
  >("all")

  const isAgency = user?.role === "AGENCY_POC"

  const fetchQueue = useCallback(async () => {
    if (!token || !isAgency) return
    setLoading(true)
    setError(null)
    try {
      const [videoRes, scriptRes] = await Promise.all([
        getVideoQueue(token),
        getScriptQueue(token),
      ])
      const combined = [
        ...(videoRes.available ?? []),
        ...(videoRes.myReviews ?? []),
      ]
      setVideos(combined)
      const scripts = [
        ...(scriptRes.available ?? []),
        ...(scriptRes.myReviews ?? []),
      ]
      const m = new Map<string, Script>()
      for (const s of scripts) {
        if (!m.has(s.id)) m.set(s.id, s)
      }
      setScriptById(m)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load videos")
      toast.error("Failed to load videos")
      setScriptById(new Map())
    } finally {
      setLoading(false)
    }
  }, [token, isAgency])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  useEffect(() => {
    if (!token || !isAgency) return
    getVideoStats(token)
      .then(setStats)
      .catch(() => setStats(null))
  }, [token, isAgency])

  const filteredVideos = searchQuery.trim()
    ? videos.filter((v) => {
        const title = v.script?.title ?? ""
        const fileName = v.fileName ?? ""
        return (
          title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          fileName.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })
    : videos

  const firstLineUpVideos = filteredVideos.filter(
    (v) => v.phase === "FIRST_LINE_UP"
  )
  const firstCutVideos = filteredVideos.filter((v) => v.phase === "FIRST_CUT")

  const phaseVideos =
    phaseTab === "FIRST_LINE_UP" ? firstLineUpVideos : firstCutVideos
  const approvedVideos = phaseVideos.filter((v) => v.status === "APPROVED")
  const rejectedVideos = phaseVideos.filter((v) => v.status !== "APPROVED")

  const subTabVideos =
    statusSubTab === "all"
      ? phaseVideos
      : statusSubTab === "approved"
        ? approvedVideos
        : rejectedVideos

  /**
   * Phase 5 (First Cut): rows awaiting Agency upload (`AGENCY_UPLOAD_PENDING`) first,
   * then rejected-return slots, then everything else. Phase 4: rejected-return first
   * (unchanged).
   */
  const subTabVideosSorted = useMemo(() => {
    const list = [...subTabVideos]
    return list.sort((a, b) => {
      if (phaseTab === "FIRST_CUT") {
        const aPending = a.status === "AGENCY_UPLOAD_PENDING" ? 1 : 0
        const bPending = b.status === "AGENCY_UPLOAD_PENDING" ? 1 : 0
        if (bPending !== aPending) return bPending - aPending
      }
      const aResubmit = isAgencyRejectedReturn(a) ? 1 : 0
      const bResubmit = isAgencyRejectedReturn(b) ? 1 : 0
      if (bResubmit !== aResubmit) return bResubmit - aResubmit
      return (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    })
  }, [subTabVideos, phaseTab])

  const needsUpload = (v: Video) => v.status === "AGENCY_UPLOAD_PENDING"

  const handleOpenUpload = (v: Video) => {
    setUploadVideo(v)
    setUploadFile(null)
    setUploadStep("idle")
    setUploadDialogOpen(true)
  }

  const handleUploadSubmit = async () => {
    if (!token || !uploadVideo || !uploadFile) return
    const phase = uploadVideo.phase
    setUploading(true)
    setUploadStep("url")
    try {
      setUploadStep("put")
      await uploadVideoFlow(
        token,
        uploadFile,
        uploadVideo.scriptId,
        phase,
        isAgencyRejectedReturn(uploadVideo)
          ? { videoId: uploadVideo.id }
          : undefined
      )
      setUploadStep("submit")
      const wasRejectedReturn = isAgencyRejectedReturn(uploadVideo)
      toast.success(
        wasRejectedReturn
          ? phase === "FIRST_CUT"
            ? "First Cut re-uploaded"
            : "First Line Up re-uploaded"
          : phase === "FIRST_CUT"
            ? "First Cut submitted"
            : "First Line Up submitted",
        {
          description:
            phase === "FIRST_CUT"
              ? "Medical Affairs then Content/Brand review. TAT 24 hours."
              : "Medical Affairs review, then Content/Brand. TAT 24 hours.",
        }
      )
      setUploadDialogOpen(false)
      setUploadVideo(null)
      setUploadFile(null)
      fetchQueue()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed"
      toast.error("Upload failed", { description: msg })
    } finally {
      setUploading(false)
      setUploadStep("idle")
    }
  }

  const uploadIsRejectedReturn =
    uploadVideo != null && isAgencyRejectedReturn(uploadVideo)

  if (!isAgency) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Only Agency POC can access this page.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.back()}
            >
              Go back
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Agency POC — Videos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <strong>Phase 4</strong> — Upload First Line Up (rough cut) per
            locked script. After Content/Brand approves,{" "}
            <strong>Phase 5</strong> — upload First Cut (full draft). Same
            review loop for First Cut. TAT 24 hours per stage.
          </p>
        </div>

        {stats && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.firstLineUp && (
              <>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">
                      First Line Up — Pending
                    </p>
                    <p className="text-2xl font-semibold">
                      {stats.firstLineUp.pending}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">
                      First Line Up — Approved
                    </p>
                    <p className="text-2xl font-semibold">
                      {stats.firstLineUp.approved}
                    </p>
                  </CardContent>
                </Card>
              </>
            )}
            {stats.firstCut && (
              <>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">
                      First Cut — Pending
                    </p>
                    <p className="text-2xl font-semibold">
                      {stats.firstCut.pending}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">
                      First Cut — Approved
                    </p>
                    <p className="text-2xl font-semibold">
                      {stats.firstCut.approved}
                    </p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by script title or file name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 pl-9"
          />
        </div>

        {/* Level 1: Phase tabs — full width, equal columns, centered labels */}
        <div className="w-full border-b border-border">
          <nav
            className="flex w-full items-stretch"
            role="tablist"
            aria-label="Phase tabs"
          >
            {(
              [
                {
                  key: "FIRST_LINE_UP" as const,
                  label: "First Line Up - Phase 4",
                  // sublabel: "First Line Up",
                },
                {
                  key: "FIRST_CUT" as const,
                  label: "First Cut - Phase 5",
                  // sublabel: "First Cut",
                },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={phaseTab === key}
                onClick={() => setPhaseTab(key)}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center border-b-2 px-2 py-3 text-center transition-colors sm:px-4",
                  phaseTab === key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="text-sm font-medium">{label}</span>
                {/* <span className="text-xs font-normal opacity-80">{sublabel}</span> */}
              </button>
            ))}
          </nav>
        </div>

        {/* Level 2: Status sub-tabs — full width, equal columns, centered */}
        <div className="w-full border-b border-border">
          <nav
            className="flex w-full items-stretch"
            role="tablist"
            aria-label="Status tabs"
          >
            {(
              [
                { key: "all" as const, label: "All" },
                { key: "approved" as const, label: "Approved" },
                { key: "rejected" as const, label: "Rejected" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={statusSubTab === key}
                onClick={() => setStatusSubTab(key)}
                className={cn(
                  "min-w-0 flex-1 border-b-2 px-2 py-2.5 text-center text-sm font-medium transition-colors sm:px-4",
                  statusSubTab === key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={fetchQueue}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredVideos.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <VideoIcon className="size-12 text-muted-foreground" />
              <p className="mt-4 font-medium">
                {searchQuery.trim()
                  ? "No videos match your search"
                  : "No videos in your queue"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Locked scripts will appear here for First Line Up / First Cut
                upload.
              </p>
            </CardContent>
          </Card>
        ) : subTabVideosSorted.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <VideoIcon className="size-12 text-muted-foreground" />
              <p className="mt-4 font-medium">
                {statusSubTab === "all"
                  ? `No ${PHASE_LABELS[phaseTab]} videos right now`
                  : `No ${statusSubTab} videos in ${PHASE_LABELS[phaseTab]} right now`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {statusSubTab === "approved"
                  ? "Approved videos will appear here."
                  : statusSubTab === "rejected"
                    ? "Videos awaiting upload or in review (or with changes requested) will appear here."
                    : "Switch phase or status to see more."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {subTabVideosSorted.map((video) => {
              const limitH = stats?.tatConfig?.limitHours ?? 24
              const repeatH = stats?.tatConfig?.repeatCycleHours ?? 6
              return (
                <VideoCard
                  key={video.id}
                  video={video}
                  scriptFromQueue={scriptById.get(video.scriptId)}
                  allVideos={videos}
                  onView={() => router.push(`${LIST_PATH}/${video.id}`)}
                  onUpload={
                    needsUpload(video)
                      ? isAgencyRejectedReturn(video)
                        ? () => router.push(`${LIST_PATH}/${video.id}`)
                        : () => handleOpenUpload(video)
                      : undefined
                  }
                  getStatusPillClass={getStatusPillClass}
                  tatLimitHours={limitH}
                  repeatCycleHours={repeatH}
                />
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="gap-6 p-6 sm:max-w-lg sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              {uploadIsRejectedReturn ? "Re-upload" : "Upload"}{" "}
              {uploadVideo?.phase === "FIRST_LINE_UP"
                ? "First Line Up"
                : "First Cut"}
            </DialogTitle>
            <DialogDescription className="max-w-[42ch] text-sm leading-relaxed">
              {uploadVideo?.script?.title && (
                <span className="font-medium">{uploadVideo.script.title}</span>
              )}{" "}
              —{" "}
              {uploadIsRejectedReturn
                ? "Select a new file to re-upload for this rejected version. We’ll get a secure upload URL, upload the file, then submit it for review."
                : "Select a file. We’ll get a secure upload URL, upload the file, then submit it for review."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <input
              type="file"
              accept={FIRST_LINE_UP_MIXED_INPUT_ACCEPT}
              className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground file:hover:bg-primary/90"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              disabled={uploading}
            />
            {uploading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {uploadStep === "url" && "Getting upload URL…"}
                {uploadStep === "put" && "Uploading file…"}
                {uploadStep === "submit" && "Submitting…"}
              </p>
            )}
          </div>
          <DialogFooter className="-mx-6 -mb-6 gap-3 px-6 pb-6 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setUploadDialogOpen(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUploadSubmit}
              disabled={!uploadFile || uploading}
              className="border-0 bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-white hover:opacity-90"
            >
              {uploading && <Loader2 className="mr-2 size-4 animate-spin" />}
              {uploadIsRejectedReturn
                ? "Re-upload & submit"
                : "Upload & submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
