"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuthStore } from "@/store"
import VideoPlayerTimeline from "@/components/VideoPlayerTimeline"
import type { UserRole } from "@/types/auth"
import {
  getPackage,
  resubmitPackageMetadata,
  resubmitPackageVideoFile,
  uploadPackageThumbnailFile,
  uploadPackageVideoFile,
  withdrawPackageVideo,
} from "@/lib/packages-api"
import type {
  FinalPackage,
  PackageAsset,
  PackageItemFeedbackEntry,
  PackageStatus,
  PackageThumbnailRecord,
  PackageVideo,
} from "@/types/package"
import {
  getLatestDisplayableRejectionForVideo,
  isOverallCommentsRedundantWithItemFeedback,
  type PackageRejectionDisplay,
} from "@/lib/package-list-utils"
import {
  aggregatePackageDisplayStatus,
  deliverableLabelsByVideoId,
  getCurrentVideoAsset,
  getMetadataTrackFeedbackItems,
  getVideoTrackFeedbackItems,
  mergeVideoIntoPackage,
  packageVideosSorted,
  thumbnailsOnAsset,
  videoAssetToPackageAsset,
} from "@/lib/package-video-helpers"
import {
  PACKAGE_STATUS_LABELS,
  TRACK_STATUS_LABELS,
  VIDEO_STATUS_LABELS,
  formatPackageDate,
  formatPackageFileSize,
  packageStatusBadgeClass,
  videoStatusBadgeClass,
} from "@/lib/package-ui"
import { PackageVideoTatInline } from "@/components/packages/package-video-tat-inline"
import { PackageItemFeedbackHumanizedList } from "@/components/packages/package-item-feedback-humanized"
import { PackageListTabNav } from "@/components/packages/package-list-tab-nav"
import { PackageVideoMetadataProminent } from "@/components/packages/package-video-metadata-prominent"
import { PackageInlineVideoCard } from "@/components/packages/package-inline-video-card"
import { TrackStatusCallout } from "@/components/packages/track-status-callout"
import {
  TagPillList,
  parseTagsFromCommaInput,
} from "@/components/packages/tag-pill-list"
import {
  ArrowLeft,
  CheckCircle2,
  Clapperboard,
  ExternalLink,
  ImageIcon,
  Info,
  Loader2,
  Smartphone,
  Upload,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type RevisionTab = "videos" | "metadata"

function thumbnailStatusSurfaceClass(s: PackageThumbnailRecord["status"]) {
  switch (s) {
    case "APPROVED":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
    case "REJECTED":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
    default:
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
  }
}

function AgencyMetadataThumbnailsGrid({
  thumbs,
  headingId,
}: {
  thumbs: PackageThumbnailRecord[]
  /** Optional id for aria-labelledby on section */
  headingId?: string
}) {
  if (thumbs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No thumbnails on this version.
      </p>
    )
  }
  return (
    <ul
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      aria-labelledby={headingId}
    >
      {thumbs.map((t) => (
        <li
          key={t.id}
          className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
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
          <div className="space-y-1.5 p-3">
            <Badge
              className={thumbnailStatusSurfaceClass(t.status)}
              variant="secondary"
            >
              {t.status}
            </Badge>
            <p className="truncate text-xs text-muted-foreground">
              {t.fileName}
            </p>
            {t.status === "REJECTED" && t.comment ? (
              <p className="text-xs leading-snug text-destructive">
                {t.comment}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

const VIDEO_PREVIEW_SHELL =
  "overflow-hidden rounded-xl border border-border bg-black shadow-md ring-1 ring-border/60"

/** Intrinsic aspect from the file; width fills column; soft cap for very tall sources. */
const VIDEO_INLINE_CLASS =
  "h-auto w-full max-w-full object-contain max-h-[min(85vh,40rem)]"

function submittedVideoShellClass() {
  return cn(VIDEO_PREVIEW_SHELL, "w-full")
}

const EMPTY_FILE_LIST: File[] = []

function LocalReplacementVideoPreview({
  file,
  className,
  compact,
}: {
  file: File | null
  className?: string
  compact?: boolean
}) {
  if (!file) {
    return (
      <div
        className={cn(
          "flex w-full items-center justify-center rounded-xl border border-dashed border-muted-foreground/25 bg-muted/30 px-2 text-center",
          compact ? "min-h-36 py-6" : "px-4 py-8",
          className
        )}
      >
        <p className="max-w-[min(100%,12rem)] text-xs text-muted-foreground sm:max-w-xs sm:text-sm">
          Choose a replacement to preview beside your current submission.
        </p>
      </div>
    )
  }
  const fileKey = `${file.name}-${file.size}-${file.lastModified}`
  return (
    <LocalReplacementVideoPreviewInner
      key={fileKey}
      file={file}
      className={className}
      compact={compact}
    />
  )
}

function ReplacementBlobVideoPlayer({
  objectUrl,
  file,
  compact,
}: {
  objectUrl: string
  file: File
  compact?: boolean
}) {
  const [videoError, setVideoError] = useState(false)

  if (videoError) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/40 px-3 text-center",
          compact ? "min-h-36 py-6" : "px-4 py-8"
        )}
      >
        <p className="text-sm text-muted-foreground">
          This file can’t be previewed in the browser (codec or format). It can
          still upload if you resubmit.
        </p>
        <p className="font-mono text-xs wrap-break-word text-muted-foreground">
          {file.name} · {formatPackageFileSize(file.size)}
        </p>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className={submittedVideoShellClass()}>
        <VideoPlayerTimeline
          src={objectUrl}
          mediaKey={objectUrl}
          showCommentsUi={false}
          videoClassName={VIDEO_INLINE_CLASS}
          onVideoError={() => setVideoError(true)}
        />
      </div>
      <p className="shrink-0 font-mono text-xs wrap-break-word text-muted-foreground">
        {file.name} · {formatPackageFileSize(file.size)}
      </p>
    </div>
  )
}

function LocalReplacementVideoPreviewInner({
  file,
  className,
  compact,
}: {
  file: File
  className?: string
  compact?: boolean
}) {
  /** Blob URL in state + effect: Strict Mode revokes on unmount; useMemo would
   *  reuse a revoked URL string on remount. */
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    // Blob URL must be registered in effect so Strict Mode cleanup revokes before remount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync object URL to state for <video src>
    setObjectUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [file])

  if (!objectUrl) {
    return (
      <div
        className={cn(
          "flex w-full items-center justify-center rounded-xl border border-border bg-muted/20",
          compact ? "min-h-36 py-8" : "min-h-48 py-8",
          className
        )}
      >
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <ReplacementBlobVideoPlayer
        key={objectUrl}
        objectUrl={objectUrl}
        file={file}
        compact={compact}
      />
    </div>
  )
}

function VideoReplacementUploadCell({
  assetId,
  file,
  onFileChange,
}: {
  assetId: string
  file: File | null
  onFileChange: (next: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const id = `video-replace-${assetId}`

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="video/*"
        className="hidden"
        aria-label="Choose replacement video file"
        onChange={(e) => {
          onFileChange(e.target.files?.[0] ?? null)
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full shrink-0"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mr-2 size-4" />
        Re-upload
      </Button>
      {file ? (
        <p className="text-xs wrap-break-word text-muted-foreground">
          {file.name} — use Re-upload to change.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Required before resubmit.
        </p>
      )}
    </div>
  )
}

/** Only mount when `files.length > 0` so blob URLs are always created in a
 *  keyed instance (avoids Strict Mode revoke + stale useMemo URL). */
function LocalThumbnailPreviews({ files }: { files: File[] }) {
  const [urls, setUrls] = useState<string[]>([])

  useEffect(() => {
    const next = files.map((x) => URL.createObjectURL(x))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync object URLs for <img src>
    setUrls(next)
    return () => {
      for (const u of next) URL.revokeObjectURL(u)
    }
  }, [files])

  if (urls.length === 0) {
    return (
      <div className="flex min-h-26 items-center justify-center rounded-lg border border-border bg-muted/20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {urls.map((src, i) => {
        const f = files[i]
        if (!f) return null
        return (
          <div
            key={`${f.name}-${f.size}-${i}`}
            className="relative aspect-video overflow-hidden rounded-lg border border-border bg-muted"
          >
            {/* Blob URLs — next/image not applicable */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="size-full object-cover" />
            <span className="absolute right-0 bottom-0 left-0 truncate bg-background/85 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {f.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function AgencyPackageVideoPreview({
  asset,
  label,
  icon,
  packageVideo,
}: {
  asset: PackageAsset
  label: string
  icon: ReactNode
  packageVideo: PackageVideo
}) {
  return (
    <div className="space-y-4">
      <PackageInlineVideoCard
        asset={asset}
        label={label}
        icon={icon}
        videoOnly
        packageVideo={packageVideo}
      />
    </div>
  )
}

export default function AgencyPackageDetailPage() {
  const params = useParams()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [pkg, setPkg] = useState<FinalPackage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revisionTab, setRevisionTab] = useState<RevisionTab>("videos")
  const revisionTabInit = useRef(false)

  const role = user?.role as UserRole | undefined
  const isAgency = role === "AGENCY_POC" || role === "SUPER_ADMIN"

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
    revisionTabInit.current = false
    setRevisionTab("videos")
  }, [id])

  useEffect(() => {
    if (!pkg || revisionTabInit.current) return
    revisionTabInit.current = true
    const vids = pkg.videos ?? []
    if (
      vids.some(
        (v) =>
          v.status === "MEDICAL_REVIEW" && v.videoTrackStatus === "REJECTED"
      )
    ) {
      setRevisionTab("videos")
    } else if (
      vids.some(
        (v) =>
          v.status === "MEDICAL_REVIEW" && v.metadataTrackStatus === "REJECTED"
      )
    ) {
      setRevisionTab("metadata")
    }
  }, [pkg])

  if (!isAgency) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">
          Only Agency POC or Super Admin can view this page.
        </p>
        <Button variant="link" asChild className="pl-0">
          <Link href="/agency-poc-packages">Back</Link>
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6">
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
          <Link href="/agency-poc-packages">Back</Link>
        </Button>
      </div>
    )
  }

  const status: PackageStatus = aggregatePackageDisplayStatus(pkg)
  const vids = pkg.videos ?? []
  const anyVideoTrackRejected = vids.some(
    (v) => v.status === "MEDICAL_REVIEW" && v.videoTrackStatus === "REJECTED"
  )
  const anyMetadataRejected = vids.some(
    (v) => v.status === "MEDICAL_REVIEW" && v.metadataTrackStatus === "REJECTED"
  )
  const revisionTabs = [
    {
      key: "videos" as const,
      label: anyVideoTrackRejected ? "Videos — needs update" : "Videos",
    },
    {
      key: "metadata" as const,
      label: anyMetadataRejected ? "Metadata — needs update" : "Metadata",
    },
  ]
  /** Avoid implying a single package-wide version when deliverables differ (per-video `currentVersion`). */
  const versionLabel =
    vids.length === 1 && pkg.version != null
      ? `Version ${pkg.version} · `
      : vids.length > 1
        ? `${vids.length} deliverables · `
        : ""

  return (
    <div className="min-h-full bg-linear-to-b from-muted/40 via-background to-background pb-12 md:pb-16">
      <div className="mx-auto max-w-5xl space-y-10 px-4 py-6 md:px-6 md:py-8">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link href="/agency-poc-packages">
            <ArrowLeft className="mr-1 size-4" />
            Final packages
          </Link>
        </Button>

        <header className="flex flex-col gap-6 border-b border-border/80 pb-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-4">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Phase 6 · Final package
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn("uppercase", packageStatusBadgeClass(status))}
              >
                {PACKAGE_STATUS_LABELS[status]}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {versionLabel}Updated {formatPackageDate(pkg.updatedAt)}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
              {pkg.name ?? pkg.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>From script</span>
              {pkg.script?.title ? (
                <Link
                  href={`/agency-poc/${pkg.scriptId}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {pkg.script.title}
                </Link>
              ) : (
                <Button variant="link" className="h-auto p-0 text-sm" asChild>
                  <Link href={`/agency-poc/${pkg.scriptId}`}>
                    Open script
                    <ExternalLink className="ml-1 size-3.5" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end">
            <Button asChild variant="default" className="w-full sm:w-auto">
              <Upload className="mr-2 size-4" />
              <Link
                href={`/agency-poc-packages/new?scriptId=${encodeURIComponent(pkg.scriptId)}`}
              >
                Add videos
              </Link>
            </Button>
          </div>
        </header>

        <Card className="border-blue-200/60 bg-blue-50/60 shadow-none dark:border-blue-900/40 dark:bg-blue-950/25">
          <CardContent className="flex gap-4 py-5 sm:py-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-700 dark:text-blue-300">
              <Info className="size-5" />
            </div>
            <div className="min-w-0 space-y-3 text-sm">
              <p className="font-semibold text-foreground">
                How this page is organized
              </p>
              <ul className="list-none space-y-2.5 text-muted-foreground">
                <li className="flex gap-2">
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden
                  />
                  <span>
                    <span className="font-medium text-foreground">Videos</span>{" "}
                    — Each video flows{" "}
                    <strong className="font-medium text-foreground">
                      independently
                    </strong>
                    . If Medical Affairs rejects the{" "}
                    <strong className="font-medium text-foreground">
                      video file
                    </strong>{" "}
                    for one clip, only that clip needs a new upload here; other
                    videos keep moving forward.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden
                  />
                  <span>
                    <span className="font-medium text-foreground">
                      Metadata
                    </span>{" "}
                    — Content/Brand reviews titles, descriptions, tags, and each
                    thumbnail. Metadata rejection applies per video; resubmit
                    metadata (replace rejected thumbnails only) for videos where
                    that track is rejected.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                    aria-hidden
                  />
                  <span>
                    <strong className="font-medium text-foreground">
                      Super Admin
                    </strong>{" "}
                    can withdraw an individual video from the video card (Agency
                    cannot).
                  </span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {status === "APPROVED" && pkg.lockedAt && (
          <Card className="border-green-600/30 bg-green-50/50 shadow-none dark:border-green-700/40 dark:bg-green-950/30">
            <CardContent className="flex items-center gap-3 py-4 text-sm text-green-900 dark:text-green-100">
              <CheckCircle2 className="size-5 shrink-0" />
              <span>
                All videos in this package are processed and the package is{" "}
                <strong>locked</strong> as of {formatPackageDate(pkg.lockedAt)}.
              </span>
            </CardContent>
          </Card>
        )}

        <section aria-label="Revision by track" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Work on this package
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Use the tabs to work on video files versus metadata. Each video
              has its own cards and actions.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
            <div className="border-b border-border bg-muted/20 px-1">
              <PackageListTabNav<RevisionTab>
                tabs={revisionTabs}
                active={revisionTab}
                onChange={setRevisionTab}
                ariaLabel="Video and metadata revision"
              />
            </div>
            <div className="space-y-6 p-4 sm:p-6">
              {revisionTab === "videos" ? (
                <VideoRevisionPanel
                  pkg={pkg}
                  token={token}
                  role={role}
                  onPackageUpdated={setPkg}
                />
              ) : (
                <MetadataRevisionPanel
                  pkg={pkg}
                  token={token}
                  role={role}
                  onPackageUpdated={setPkg}
                />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function RejectionContextBlock({
  latestRejection,
  showOverall,
  itemFeedbackForDedup,
}: {
  latestRejection: PackageRejectionDisplay
  showOverall: boolean
  /** When overall text is only a duplicate of joined item comments, hide the summary bar. */
  itemFeedbackForDedup?: PackageItemFeedbackEntry[]
}) {
  const overall = latestRejection.overallComments?.trim() ?? ""
  const redundant =
    itemFeedbackForDedup &&
    itemFeedbackForDedup.length > 0 &&
    isOverallCommentsRedundantWithItemFeedback(overall, itemFeedbackForDedup)
  const showSummary = showOverall && Boolean(overall) && !redundant

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-4 py-4 text-sm dark:bg-muted/20">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Reviewer
      </p>
      <p className="mt-2 text-foreground">
        <span className="font-medium">{latestRejection.reviewerLine}</span>
        {latestRejection.trackLine ? (
          <span className="mt-1 block text-muted-foreground">
            Stage: {latestRejection.trackLine}
          </span>
        ) : null}
        <span className="mt-1 block text-xs text-muted-foreground">
          {latestRejection.reviewedAtLabel}
        </span>
      </p>
      {showSummary ? (
        <div className="mt-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Overall note
          </p>
          <blockquote className="border-l-4 border-destructive/50 bg-destructive/5 py-3 pr-3 pl-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground dark:bg-destructive/10">
            {overall}
          </blockquote>
        </div>
      ) : redundant ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Summary matches the detailed list below — see each field for
          specifics.
        </p>
      ) : null}
    </div>
  )
}

function VideoRevisionPanel({
  pkg,
  token,
  role,
  onPackageUpdated,
}: {
  pkg: FinalPackage
  token: string | null
  role: UserRole | undefined
  onPackageUpdated: (p: FinalPackage) => void
}) {
  const [replaceFileByVideoId, setReplaceFileByVideoId] = useState<
    Record<string, File | null>
  >({})
  const [busyVideoId, setBusyVideoId] = useState<string | null>(null)
  const [withdrawBusyId, setWithdrawBusyId] = useState<string | null>(null)

  const videos = packageVideosSorted(pkg)
  let shortN = 0

  async function handleResubmitVideoFile(videoId: string) {
    const f = replaceFileByVideoId[videoId]
    if (!token) {
      toast.error("Sign in to resubmit")
      return
    }
    if (!f) {
      toast.error("Choose a replacement video file")
      return
    }
    setBusyVideoId(videoId)
    try {
      const meta = await uploadPackageVideoFile(token, f)
      const res = await resubmitPackageVideoFile(token, videoId, {
        fileUrl: meta.fileUrl,
        fileName: meta.fileName,
        fileType: meta.fileType,
        fileSize: meta.fileSize,
      })
      onPackageUpdated(mergeVideoIntoPackage(pkg, res.video))
      setReplaceFileByVideoId((prev) => ({ ...prev, [videoId]: null }))
      toast.success(res.message ?? "Video file resubmitted for review")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resubmit failed")
    } finally {
      setBusyVideoId(null)
    }
  }

  async function handleWithdrawVideo(videoId: string) {
    if (!token) return
    setWithdrawBusyId(videoId)
    try {
      const res = await withdrawPackageVideo(token, videoId)
      onPackageUpdated(mergeVideoIntoPackage(pkg, res.video))
      toast.success(res.message ?? "Video withdrawn")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Withdraw failed")
    } finally {
      setWithdrawBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Each video is reviewed independently. If the <strong>video file</strong>{" "}
        track is rejected at the medical stage, upload a replacement for that
        video only — siblings keep moving forward.
      </p>
      {videos.map((video) => {
        const label =
          video.type === "LONG_FORM"
            ? "Long-form (main)"
            : `Short-form ${++shortN}`
        const va = getCurrentVideoAsset(video)
        const asset = va ? videoAssetToPackageAsset(va) : null
        const vts = video.videoTrackStatus
        const latest = getLatestDisplayableRejectionForVideo(video)
        const feedbackItems = getVideoTrackFeedbackItems(video.reviews)
        const needsVideoResubmit =
          video.status === "MEDICAL_REVIEW" && vts === "REJECTED"
        const canWithdraw =
          role === "SUPER_ADMIN" &&
          video.status !== "WITHDRAWN" &&
          video.status !== "APPROVED"
        const icon =
          video.type === "LONG_FORM" ? (
            <Clapperboard className="size-5" />
          ) : (
            <Smartphone className="size-5" />
          )

        return (
          <Card key={video.id} className="overflow-hidden shadow-sm">
            <CardHeader className="border-b border-border bg-muted/25 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle className="text-base font-semibold">
                    {label}
                  </CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        videoStatusBadgeClass(video.status)
                      )}
                    >
                      {VIDEO_STATUS_LABELS[video.status]}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      Video track: {TRACK_STATUS_LABELS[vts]}
                    </Badge>
                  </div>
                </div>
                {canWithdraw ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={withdrawBusyId === video.id}
                    onClick={() => void handleWithdrawVideo(video.id)}
                  >
                    {withdrawBusyId === video.id ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Withdraw video
                  </Button>
                ) : null}
              </div>
              <PackageVideoTatInline
                video={video}
                className="border-t border-border/60 pt-3"
              />
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <TrackStatusCallout
                status={vts}
                title="Video file (Medical Affairs)"
              >
                {video.status === "MEDICAL_REVIEW" && vts === "PENDING" ? (
                  <p>
                    Medical Affairs is reviewing this video file. Wait for
                    approval or feedback.
                  </p>
                ) : null}
                {video.status === "MEDICAL_REVIEW" &&
                vts === "APPROVED" &&
                video.metadataTrackStatus === "PENDING" ? (
                  <p className="text-foreground">
                    This video file is approved. Content/Brand is still
                    reviewing metadata — see the Metadata tab.
                  </p>
                ) : null}
                {video.status === "BRAND_VIDEO_REVIEW" ? (
                  <p className="text-foreground">
                    Content/Brand is reviewing overall video quality for this
                    deliverable.
                  </p>
                ) : null}
                {video.status === "AWAITING_APPROVER" ? (
                  <p>Awaiting final approver sign-off.</p>
                ) : null}
                {video.status === "APPROVED" ? (
                  <p>This video is approved.</p>
                ) : null}
                {video.status === "WITHDRAWN" ? (
                  <p>This video was withdrawn.</p>
                ) : null}
                {needsVideoResubmit ? (
                  <p className="text-foreground">
                    Upload a new video file below. Use the Metadata tab if
                    titles, tags, or thumbnails need changes.
                  </p>
                ) : null}
              </TrackStatusCallout>

              {needsVideoResubmit && latest ? (
                <Card className="border-destructive/40 bg-destructive/5 shadow-none">
                  <CardHeader className="space-y-1 pb-3">
                    <CardTitle className="text-lg font-semibold text-destructive">
                      Reviewer feedback (video file)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 border-t border-border/60 pt-4">
                    <RejectionContextBlock
                      latestRejection={latest}
                      showOverall={Boolean(latest.overallComments?.trim())}
                      itemFeedbackForDedup={feedbackItems}
                    />
                    {feedbackItems.length > 0 ? (
                      <PackageItemFeedbackHumanizedList
                        pkg={pkg}
                        items={feedbackItems}
                        className="border-t-0 pt-0"
                      />
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {asset ? (
                needsVideoResubmit ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Current file
                      </p>
                      <PackageInlineVideoCard
                        asset={asset}
                        label={label}
                        icon={icon}
                        videoOnly
                        packageVideo={video}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                        Replacement
                      </p>
                      <LocalReplacementVideoPreview
                        compact
                        file={replaceFileByVideoId[video.id] ?? null}
                      />
                      <VideoReplacementUploadCell
                        assetId={video.id}
                        file={replaceFileByVideoId[video.id] ?? null}
                        onFileChange={(f) =>
                          setReplaceFileByVideoId((prev) => ({
                            ...prev,
                            [video.id]: f,
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <AgencyPackageVideoPreview
                    asset={asset}
                    label={label}
                    icon={icon}
                    packageVideo={video}
                  />
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  No current asset for this video.
                </p>
              )}

              {needsVideoResubmit ? (
                <Button
                  type="button"
                  onClick={() => void handleResubmitVideoFile(video.id)}
                  disabled={busyVideoId === video.id || !token}
                >
                  {busyVideoId === video.id ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 size-4" />
                  )}
                  Resubmit video file
                </Button>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function agencyThumbnailNeedsReplacement(t: PackageThumbnailRecord): boolean {
  return t.status === "REJECTED"
}

function MetadataResubmitFields({
  video,
  pkg,
  token,
  label,
  asset,
  thumbs,
  onUpdated,
}: {
  video: PackageVideo
  pkg: FinalPackage
  token: string | null
  label: string
  asset: PackageAsset
  thumbs: PackageThumbnailRecord[]
  onUpdated: (p: FinalPackage) => void
}) {
  const [title, setTitle] = useState(asset.title?.trim() ?? "")
  const [description, setDescription] = useState(
    asset.description?.trim() ?? ""
  )
  const [tagsInput, setTagsInput] = useState((asset.tags ?? []).join(", "))
  const [replacementFiles, setReplacementFiles] = useState<
    Record<string, File | null>
  >({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setTitle(asset.title?.trim() ?? "")
    setDescription(asset.description?.trim() ?? "")
    setTagsInput((asset.tags ?? []).join(", "))
    setReplacementFiles({})
  }, [
    video.id,
    video.updatedAt,
    asset.id,
    asset.title,
    asset.description,
    asset.tags,
  ])

  const approvedCount = thumbs.filter((t) => t.status === "APPROVED").length
  const rejectedCount = thumbs.filter((t) => t.status === "REJECTED").length
  const pendingCount = thumbs.filter((t) => t.status === "PENDING").length

  async function handleResubmitMetadata() {
    if (!token) {
      toast.error("Sign in to resubmit")
      return
    }
    if (!title.trim() || !description.trim()) {
      toast.error("Title and description are required")
      return
    }
    if (thumbs.length === 0) {
      toast.error("This version has no thumbnails — contact support.")
      return
    }
    for (const t of thumbs) {
      if (!agencyThumbnailNeedsReplacement(t)) continue
      const f = replacementFiles[t.id]
      if (!f) {
        toast.error(
          `Upload a replacement image for the rejected thumbnail${t.fileName ? ` (${t.fileName})` : ""}.`
        )
        return
      }
    }
    setBusy(true)
    try {
      const thumbnails: {
        fileUrl: string
        fileName: string
        fileType?: string
        fileSize?: number
      }[] = []
      for (const t of thumbs) {
        if (!agencyThumbnailNeedsReplacement(t)) {
          thumbnails.push({
            fileUrl: t.fileUrl,
            fileName: t.fileName || "thumbnail",
            fileType: t.fileType ?? undefined,
            fileSize: t.fileSize ?? undefined,
          })
          continue
        }
        const f = replacementFiles[t.id]!
        const m = await uploadPackageThumbnailFile(token, f)
        thumbnails.push({
          fileUrl: m.fileUrl,
          fileName: m.fileName,
          fileType: m.fileType,
          fileSize: m.fileSize,
        })
      }
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
      const res = await resubmitPackageMetadata(token, video.id, {
        title: title.trim(),
        description: description.trim(),
        tags,
        thumbnails,
      })
      onUpdated(mergeVideoIntoPackage(pkg, res.video))
      setReplacementFiles({})
      toast.success(res.message ?? "Metadata resubmitted for review")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resubmit failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/5 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          Resubmit metadata — {label}
        </CardTitle>
        <CardDescription className="leading-relaxed">
          Fix copy as needed. <strong>Approved</strong> (and any still{" "}
          <strong>pending</strong>) thumbnails keep their current file — only{" "}
          <strong>rejected</strong> images need a replacement upload. Your video
          file is unchanged; Content/Brand reviews the metadata track again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 border-t border-border/60 pt-6">
        <section className="space-y-4 rounded-lg border border-border bg-background/80 p-4 shadow-sm dark:bg-background/40">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Title & description
          </h3>
          <div className="space-y-2">
            <Label htmlFor={`mt-title-${video.id}`}>Title</Label>
            <Input
              id={`mt-title-${video.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`mt-desc-${video.id}`}>Description</Label>
            <Textarea
              id={`mt-desc-${video.id}`}
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[120px] resize-y text-sm leading-relaxed"
            />
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-background/80 p-4 shadow-sm dark:bg-background/40">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Tags
          </h3>
          <p className="text-xs text-muted-foreground">
            Separate with commas. Empty segments are ignored.
          </p>
          <div className="space-y-2">
            <Label htmlFor={`mt-tags-${video.id}`}>Tag list</Label>
            <Input
              id={`mt-tags-${video.id}`}
              placeholder="e.g. cardiology, awareness, campaign"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
            <div className="space-y-1 pt-1">
              <p className="text-xs font-medium text-muted-foreground">
                Preview
              </p>
              <TagPillList
                tags={parseTagsFromCommaInput(tagsInput)}
                emptyLabel={
                  <span className="text-xs text-muted-foreground">
                    No tags parsed yet — separate with commas.
                  </span>
                }
              />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-background/80 p-4 shadow-sm dark:bg-background/40">
          <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <ImageIcon className="size-4 shrink-0" aria-hidden />
            Thumbnails (same order as current version)
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {rejectedCount > 0 ? (
              <>
                {approvedCount > 0 ? (
                  <>
                    <span className="font-medium text-foreground">
                      {approvedCount} approved
                    </span>{" "}
                    — reused as-is.{" "}
                  </>
                ) : null}
                {pendingCount > 0 ? (
                  <>
                    <span className="font-medium text-foreground">
                      {pendingCount} pending
                    </span>{" "}
                    — current file kept.{" "}
                  </>
                ) : null}
                <span className="font-medium text-foreground">
                  {rejectedCount} rejected
                </span>{" "}
                — upload a new file for each. Order matches your current
                version.
              </>
            ) : (
              <>
                No rejected thumbnails — all current images are sent back
                unchanged with your updated copy.
              </>
            )}
          </p>
          <ul className="space-y-4">
            {thumbs.map((t, idx) => {
              const needsFile = agencyThumbnailNeedsReplacement(t)
              const file = replacementFiles[t.id] ?? null
              const previewKey = file
                ? `${file.name}-${file.size}-${file.lastModified}`
                : ""
              return (
                <li
                  key={t.id}
                  className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                >
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:gap-4">
                    <a
                      href={t.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:max-w-[200px]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={t.fileUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    </a>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          Thumbnail {idx + 1}
                        </span>
                        <Badge
                          className={thumbnailStatusSurfaceClass(t.status)}
                          variant="secondary"
                        >
                          {t.status}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.fileName ?? t.id}
                      </p>
                      {t.status === "REJECTED" && t.comment ? (
                        <p className="text-xs leading-snug text-destructive">
                          {t.comment}
                        </p>
                      ) : null}
                      {needsFile ? (
                        <div className="space-y-2 border-t border-border pt-3">
                          <Label htmlFor={`mt-repl-${video.id}-${t.id}`}>
                            Replacement image (required for rejected)
                          </Label>
                          <Input
                            id={`mt-repl-${video.id}-${t.id}`}
                            type="file"
                            accept="image/*"
                            className="cursor-pointer border-border bg-background"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null
                              setReplacementFiles((prev) => ({
                                ...prev,
                                [t.id]: f,
                              }))
                            }}
                          />
                          {file ? (
                            <LocalThumbnailPreviews
                              key={previewKey}
                              files={[file]}
                            />
                          ) : null}
                        </div>
                      ) : t.status === "APPROVED" ? (
                        <p className="rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs text-green-800 dark:text-green-200">
                          Approved — this file is reused; no upload needed.
                        </p>
                      ) : (
                        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                          Pending review — current file is kept; no upload
                          required unless Brand rejected this slot.
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => void handleResubmitMetadata()}
          disabled={busy || !token}
        >
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Upload className="mr-2 size-4" />
          )}
          Resubmit metadata for review
        </Button>
      </CardContent>
    </Card>
  )
}

function MetadataRevisionPanel({
  pkg,
  token,
  role,
  onPackageUpdated,
}: {
  pkg: FinalPackage
  token: string | null
  role: UserRole | undefined
  onPackageUpdated: (p: FinalPackage) => void
}) {
  const videos = useMemo(() => packageVideosSorted(pkg), [pkg])
  const deliverableLabels = useMemo(
    () => deliverableLabelsByVideoId(videos),
    [videos]
  )
  const [withdrawBusyId, setWithdrawBusyId] = useState<string | null>(null)

  async function handleWithdrawVideo(videoId: string) {
    if (!token) return
    setWithdrawBusyId(videoId)
    try {
      const res = await withdrawPackageVideo(token, videoId)
      onPackageUpdated(mergeVideoIntoPackage(pkg, res.video))
      toast.success(res.message ?? "Video withdrawn")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Withdraw failed")
    } finally {
      setWithdrawBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border bg-muted/15 shadow-none">
        <CardContent className="flex gap-4 py-5 sm:py-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Info className="size-5" />
          </div>
          <div className="min-w-0 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Metadata tab</p>
            <ul className="list-inside list-disc space-y-1.5 pl-0.5">
              <li>
                Each deliverable has its own <strong>title</strong>,{" "}
                <strong>description</strong>, <strong>tags</strong>, and{" "}
                <strong>thumbnails</strong> below.
              </li>
              <li>
                If Content/Brand <strong>rejected the metadata track</strong>,
                use the resubmit form for that deliverable only — the video file
                stays as-is.
              </li>
              <li>
                For <strong>playback / file</strong> changes, use the{" "}
                <strong>Videos</strong> tab.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {videos.map((video) => {
        const label = deliverableLabels.get(video.id) ?? "Deliverable"
        const va = getCurrentVideoAsset(video)
        const asset = va ? videoAssetToPackageAsset(va) : null
        const mts = video.metadataTrackStatus
        const needsMetadataResubmit =
          video.status === "MEDICAL_REVIEW" && mts === "REJECTED"
        const latest = getLatestDisplayableRejectionForVideo(video)
        const metaFeedback = getMetadataTrackFeedbackItems(video.reviews)
        const canWithdraw =
          role === "SUPER_ADMIN" &&
          video.status !== "WITHDRAWN" &&
          video.status !== "APPROVED"
        const thumbs = va ? thumbnailsOnAsset(va) : []
        const thumbsHeadingId = `agency-meta-thumbs-${video.id}`

        return (
          <Card key={video.id} className="overflow-hidden shadow-sm">
            <CardHeader className="border-b border-border bg-muted/25 py-5 sm:py-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle className="text-base font-semibold">
                    {label}
                  </CardTitle>
                  <CardDescription>
                    Deliverable ID:{" "}
                    <span className="font-mono text-xs">{video.id}</span>
                  </CardDescription>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs font-normal",
                        videoStatusBadgeClass(video.status)
                      )}
                    >
                      Stage: {VIDEO_STATUS_LABELS[video.status]}
                    </Badge>
                    <Badge variant="secondary" className="text-xs font-normal">
                      Metadata track: {TRACK_STATUS_LABELS[mts]}
                    </Badge>
                  </div>
                </div>
                {canWithdraw ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={withdrawBusyId === video.id}
                    onClick={() => void handleWithdrawVideo(video.id)}
                  >
                    {withdrawBusyId === video.id ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Withdraw video
                  </Button>
                ) : null}
              </div>
              <PackageVideoTatInline
                video={video}
                className="border-t border-border/60 pt-3"
              />
            </CardHeader>
            <CardContent className="space-y-8 p-4 sm:p-6">
              <TrackStatusCallout
                status={mts}
                title="Metadata & thumbnails (Content / Brand)"
              >
                {video.status === "MEDICAL_REVIEW" && mts === "PENDING" ? (
                  <p>
                    Content/Brand is reviewing titles, descriptions, tags, and
                    each thumbnail for this video.
                  </p>
                ) : null}
                {mts === "APPROVED" && video.status === "MEDICAL_REVIEW" ? (
                  <p className="text-foreground">
                    Metadata is approved for this video at the medical stage. If
                    the video file is still pending, wait on the Videos tab.
                  </p>
                ) : null}
                {video.status === "BRAND_VIDEO_REVIEW" ||
                video.status === "AWAITING_APPROVER" ||
                video.status === "APPROVED" ? (
                  <p className="text-foreground">
                    Metadata for this video is locked in for later stages. Open
                    the Videos tab if reviewers asked for a new video file only.
                  </p>
                ) : null}
                {needsMetadataResubmit ? (
                  <p className="text-foreground">
                    Update copy below. Replace only thumbnails that Brand
                    rejected; approved ones stay on the file already stored.
                  </p>
                ) : null}
                {video.status === "WITHDRAWN" ? (
                  <p>This video was withdrawn.</p>
                ) : null}
              </TrackStatusCallout>

              {needsMetadataResubmit && latest ? (
                <Card className="border-destructive/40 bg-destructive/5 shadow-none">
                  <CardHeader className="space-y-1 pb-3">
                    <CardTitle className="text-lg font-semibold text-destructive">
                      Reviewer feedback (metadata)
                    </CardTitle>
                    <CardDescription>
                      Use this together with the snapshot below when you
                      resubmit.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 border-t border-border/60 pt-4">
                    <RejectionContextBlock
                      latestRejection={latest}
                      showOverall={Boolean(latest.overallComments?.trim())}
                      itemFeedbackForDedup={metaFeedback}
                    />
                    {metaFeedback.length > 0 ? (
                      <PackageItemFeedbackHumanizedList
                        pkg={pkg}
                        items={metaFeedback}
                        className="border-t-0 pt-0"
                      />
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {needsMetadataResubmit && asset && va ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 sm:p-5">
                    <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      What&apos;s live now (reference before you change it)
                    </h3>
                    <div className="space-y-6">
                      <PackageVideoMetadataProminent
                        variant="embedded"
                        deliverableLabel={label}
                        title={asset.title}
                        description={asset.description}
                        tags={asset.tags ?? undefined}
                      />
                      <div>
                        <h4
                          id={thumbsHeadingId}
                          className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                        >
                          <ImageIcon className="size-4 shrink-0" aria-hidden />
                          Current thumbnails
                        </h4>
                        <AgencyMetadataThumbnailsGrid
                          thumbs={thumbs}
                          headingId={thumbsHeadingId}
                        />
                      </div>
                    </div>
                  </div>
                  <MetadataResubmitFields
                    video={video}
                    pkg={pkg}
                    token={token}
                    label={label}
                    asset={asset}
                    thumbs={thumbs}
                    onUpdated={onPackageUpdated}
                  />
                </div>
              ) : null}

              {asset && !needsMetadataResubmit && va ? (
                <div className="space-y-6">
                  <div className="rounded-lg border border-border bg-card/50 p-1">
                    <p className="border-b border-border bg-muted/30 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Read-only · current submission
                    </p>
                    <div className="p-4 sm:p-5">
                      <PackageVideoMetadataProminent
                        variant="embedded"
                        deliverableLabel={label}
                        title={asset.title}
                        description={asset.description}
                        tags={asset.tags ?? undefined}
                      />
                    </div>
                  </div>
                  <div>
                    <h3
                      id={thumbsHeadingId}
                      className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      <ImageIcon className="size-4 shrink-0" aria-hidden />
                      Thumbnails
                    </h3>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Status reflects Content/Brand review. Open an image to see
                      it full size.
                    </p>
                    <AgencyMetadataThumbnailsGrid
                      thumbs={thumbs}
                      headingId={thumbsHeadingId}
                    />
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function AssetSection({
  title,
  assets,
}: {
  title: string
  assets: FinalPackage["currentAssets"]
}) {
  const list = assets ?? []
  if (!list.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {list.map((a) => {
            const ts = formatPackageFileSize(a.fileSize ?? undefined)
            return (
              <div
                key={a.id}
                className="min-w-0 space-y-1.5 rounded-lg border border-border bg-muted/20 p-2"
              >
                {a.fileUrl ? (
                  <a
                    href={a.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative block aspect-video overflow-hidden rounded-md border border-border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.fileUrl}
                      alt={a.fileName ?? "Asset"}
                      className="size-full object-cover transition-opacity group-hover:opacity-90"
                    />
                  </a>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 text-xs text-muted-foreground">
                    No URL
                  </div>
                )}
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {a.fileName}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                  {a.order != null ? <span>Order {a.order}</span> : null}
                  {ts ? <span>{ts}</span> : null}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
