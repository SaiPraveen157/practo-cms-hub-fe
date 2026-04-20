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
  deletePackageThumbnail,
  getPackage,
  getPackageSpecialties,
  resubmitPackageMetadata,
  resubmitPackageVideoFile,
  uploadPackageThumbnailFile,
  uploadPackageVideoFile,
  withdrawPackageVideo,
} from "@/lib/packages-api"
import {
  labelForSpecialtyValue,
  optionalDoctorSpecialtyPayload,
} from "@/lib/package-specialty-label"
import { DELIVERABLE_VIDEO_INPUT_ACCEPT } from "@/lib/video-file-validation"
import type {
  FinalPackage,
  PackageAsset,
  PackageItemFeedbackEntry,
  PackageSpecialtyOption,
  PackageStatus,
  PackageThumbnailRecord,
  PackageVideo,
} from "@/types/package"
import {
  getLatestDisplayableRejectionForVideo,
  getLatestRejectionForVideoByTrack,
  isOverallCommentsRedundantWithItemFeedback,
  type PackageRejectionDisplay,
} from "@/lib/package-list-utils"
import {
  aggregatePackageDisplayStatus,
  deliverableLabelsByVideoId,
  displayThumbnailStatus,
  getCurrentVideoAsset,
  getLatestPackageVideoRejectionIssueItems,
  getMetadataTrackFeedbackItems,
  getVideoTrackFeedbackItems,
  mergeVideoIntoPackage,
  packageMetadataResubmitRequiredThumbnailIds,
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
  Trash2,
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
  video,
}: {
  thumbs: PackageThumbnailRecord[]
  /** Optional id for aria-labelledby on section */
  headingId?: string
  /** When set, thumbnail badges use track-aligned display status (see `displayThumbnailStatus`). */
  video?: PackageVideo
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
      {thumbs.map((t) => {
        const uiStatus = video
          ? displayThumbnailStatus(video, t.status)
          : t.status
        return (
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
                className={thumbnailStatusSurfaceClass(uiStatus)}
                variant="secondary"
              >
                {uiStatus}
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
        )
      })}
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
        accept={DELIVERABLE_VIDEO_INPUT_ACCEPT}
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
  const [specialtyOptions, setSpecialtyOptions] = useState<
    PackageSpecialtyOption[]
  >([])

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
                  specialtyOptions={specialtyOptions}
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

function tagsFingerprintFromArray(tags: string[] | null | undefined): string {
  return [...(tags ?? [])]
    .map((t) => t.trim())
    .filter(Boolean)
    .sort()
    .join("\0")
}

function tagsFingerprintFromInput(s: string): string {
  return parseTagsFromCommaInput(s).sort().join("\0")
}

function baselineTitleFromAsset(asset: PackageAsset): string {
  return asset.title?.trim() ?? ""
}

function baselineDescriptionFromAsset(asset: PackageAsset): string {
  return asset.description?.trim() ?? ""
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

  async function handleResubmitVideoFile(
    videoId: string,
    needsFileReplace: boolean
  ) {
    if (!needsFileReplace) {
      toast.error(
        "Reviewers did not flag the video file in this checklist. Use the Metadata tab if copy or thumbnails were flagged."
      )
      return
    }
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
        const videoChecklistIssues = getLatestPackageVideoRejectionIssueItems(
          video,
          "VIDEO_TRACK"
        )
        const needsVideoResubmit =
          video.status === "MEDICAL_REVIEW" &&
          vts === "REJECTED" &&
          (videoChecklistIssues.length === 0 ||
            videoChecklistIssues.some((i) => i.field === "VIDEO"))
        const videoResubmitReady =
          !needsVideoResubmit || Boolean(replaceFileByVideoId[video.id])
        const latestVideoRejection =
          getLatestRejectionForVideoByTrack(video, "VIDEO_TRACK") ??
          (vts === "REJECTED"
            ? getLatestDisplayableRejectionForVideo(video)
            : null)
        const feedbackItems =
          videoChecklistIssues.length > 0
            ? videoChecklistIssues
            : getVideoTrackFeedbackItems(video.reviews)
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
                    Reviewers flagged the video file. Upload a new file below.
                    Use the Metadata tab if only copy or thumbnails were flagged.
                  </p>
                ) : null}
                {video.status === "MEDICAL_REVIEW" &&
                vts === "REJECTED" &&
                !needsVideoResubmit ? (
                  <p className="text-foreground">
                    The video track is rejected, but the checklist does not flag
                    the video file — use the Metadata tab for title, description,
                    tags, or thumbnails.
                  </p>
                ) : null}
              </TrackStatusCallout>

              {vts === "REJECTED" && latestVideoRejection ? (
                <Card className="border-destructive/40 bg-destructive/5 shadow-none">
                  <CardHeader className="space-y-1 pb-3">
                    <CardTitle className="text-lg font-semibold text-destructive">
                      Reviewer feedback (video file)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 border-t border-border/60 pt-4">
                    <RejectionContextBlock
                      latestRejection={latestVideoRejection}
                      showOverall={Boolean(
                        latestVideoRejection.overallComments?.trim()
                      )}
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
                  <div className="space-y-4">
                    {needsVideoResubmit && !videoResubmitReady ? (
                      <ul className="list-inside list-disc text-sm text-amber-900 dark:text-amber-200">
                        <li>Choose a replacement video file.</li>
                      </ul>
                    ) : null}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
                      <div className="flex min-w-0 flex-col gap-2">
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
                      <div className="flex min-w-0 flex-col gap-2">
                        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          Replacement
                        </p>
                        <Card className="overflow-hidden border-0 shadow-md ring-1 ring-border/70">
                          <CardContent className="space-y-4 p-4 sm:p-6">
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
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 px-4 py-4 sm:px-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-muted-foreground">
                          When the replacement preview looks correct, submit the
                          new file for Medical review.
                        </p>
                        <Button
                          type="button"
                          className="w-full shrink-0 sm:w-auto"
                          onClick={() =>
                            void handleResubmitVideoFile(
                              video.id,
                              needsVideoResubmit
                            )
                          }
                          disabled={
                            busyVideoId === video.id ||
                            !token ||
                            !videoResubmitReady
                          }
                        >
                          {busyVideoId === video.id ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          ) : (
                            <Upload className="mr-2 size-4" />
                          )}
                          Resubmit video file
                        </Button>
                      </div>
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
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function MetadataResubmitFields({
  video,
  pkg,
  token,
  label,
  asset,
  thumbs,
  metadataValidationIssues,
  onUpdated,
  specialtyOptions,
}: {
  video: PackageVideo
  pkg: FinalPackage
  token: string | null
  label: string
  asset: PackageAsset
  thumbs: PackageThumbnailRecord[]
  /** Latest metadata-track rejection checklist (`hasIssue` rows), like language packages. */
  metadataValidationIssues: PackageItemFeedbackEntry[]
  onUpdated: (p: FinalPackage) => void
  specialtyOptions: PackageSpecialtyOption[]
}) {
  const [title, setTitle] = useState(asset.title?.trim() ?? "")
  const [description, setDescription] = useState(
    asset.description?.trim() ?? ""
  )
  const [tagsInput, setTagsInput] = useState((asset.tags ?? []).join(", "))
  const [doctorName, setDoctorName] = useState(asset.doctorName?.trim() ?? "")
  const [specialty, setSpecialty] = useState(asset.specialty?.trim() ?? "")
  const [replacementFiles, setReplacementFiles] = useState<
    Record<string, File | null>
  >({})
  const [busy, setBusy] = useState(false)
  const [deletingThumbId, setDeletingThumbId] = useState<string | null>(null)

  const requiredThumbIds = useMemo(
    () => packageMetadataResubmitRequiredThumbnailIds(video, thumbs),
    [video, thumbs]
  )

  const titleFixRequired = metadataValidationIssues.some(
    (i) => i.field === "TITLE" && i.hasIssue
  )
  const descriptionFixRequired = metadataValidationIssues.some(
    (i) => i.field === "DESCRIPTION" && i.hasIssue
  )
  const tagsFixRequired = metadataValidationIssues.some(
    (i) => i.field === "TAGS" && i.hasIssue
  )

  const titleChanged = title.trim() !== baselineTitleFromAsset(asset)
  const descriptionChanged =
    description.trim() !== baselineDescriptionFromAsset(asset)
  const tagsChanged =
    tagsFingerprintFromInput(tagsInput) !==
    tagsFingerprintFromArray(asset.tags ?? [])

  const titleFixOk = !titleFixRequired || titleChanged
  const descriptionFixOk = !descriptionFixRequired || descriptionChanged
  const tagsFixOk = !tagsFixRequired || tagsChanged

  const thumbsFixOk = useMemo(() => {
    if (requiredThumbIds.size === 0) return true
    for (const id of requiredThumbIds) {
      if (!replacementFiles[id]) return false
    }
    return true
  }, [requiredThumbIds, replacementFiles])

  const metadataResubmitReady = useMemo(() => {
    if (!title.trim() || !description.trim()) return false
    if (!titleFixOk || !descriptionFixOk || !tagsFixOk) return false
    if (!thumbsFixOk) return false
    return true
  }, [
    title,
    description,
    titleFixOk,
    descriptionFixOk,
    tagsFixOk,
    thumbsFixOk,
    metadataValidationIssues,
  ])

  useEffect(() => {
    setTitle(asset.title?.trim() ?? "")
    setDescription(asset.description?.trim() ?? "")
    setTagsInput((asset.tags ?? []).join(", "))
    setDoctorName(asset.doctorName?.trim() ?? "")
    setSpecialty(asset.specialty?.trim() ?? "")
    setReplacementFiles({})
  }, [
    video.id,
    video.updatedAt,
    asset.id,
    asset.title,
    asset.description,
    asset.tags,
    asset.doctorName,
    asset.specialty,
  ])

  async function handleDeleteThumbnail(thumbnailId: string) {
    if (!token) return
    setDeletingThumbId(thumbnailId)
    try {
      await deletePackageThumbnail(token, thumbnailId)
      const fresh = await getPackage(token, pkg.id)
      onUpdated(fresh.package)
      toast.success(
        "Thumbnail removed. Finish edits and resubmit metadata when ready."
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete thumbnail")
    } finally {
      setDeletingThumbId(null)
    }
  }

  const slotsNeedingUpload = requiredThumbIds.size

  async function handleResubmitMetadata() {
    if (!token) {
      toast.error("Sign in to resubmit")
      return
    }
    if (!metadataResubmitReady) {
      const missing: string[] = []
      if (!title.trim() || !description.trim()) {
        missing.push("enter title and description")
      } else {
        if (!titleFixOk) missing.push("edit the title (reviewers flagged it)")
        if (!descriptionFixOk)
          missing.push("edit the description (reviewers flagged it)")
        if (!tagsFixOk) missing.push("edit tags (reviewers flagged them)")
        if (!thumbsFixOk) {
          missing.push(
            `upload a new image for each thumbnail slot that requires a replacement (${requiredThumbIds.size} slot${requiredThumbIds.size === 1 ? "" : "s"})`
          )
        }
      }
      toast.error(
        missing.length
          ? `Before resubmitting metadata: ${missing.join("; ")}.`
          : "Fix the items above before resubmitting metadata."
      )
      return
    }
    if (thumbs.length === 0) {
      toast.error("This version has no thumbnails — contact support.")
      return
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
        if (!requiredThumbIds.has(t.id)) {
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
      const tags = parseTagsFromCommaInput(tagsInput)
      const res = await resubmitPackageMetadata(token, video.id, {
        title: title.trim(),
        description: description.trim(),
        tags,
        ...optionalDoctorSpecialtyPayload({ doctorName, specialty }),
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
          Edit every field reviewers flagged in the checklist (compare to the
          snapshot above). Upload a new image only for thumbnail slots that
          require a replacement. The video file is unchanged; Content/Brand
          reviews the metadata track again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 border-t border-border/60 pt-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          The <strong>Resubmit metadata</strong> button stays disabled until each
          checklist item is addressed (changed copy where flagged, and new files
          for required thumbnails).
        </p>

        {!metadataResubmitReady ? (
          <ul className="list-inside list-disc space-y-1 text-sm text-amber-900 dark:text-amber-200">
            {!title.trim() || !description.trim() ? (
              <li>Enter title and description.</li>
            ) : null}
            {title.trim() && description.trim() ? (
              <>
                {titleFixRequired && !titleChanged ? (
                  <li>Update the title — reviewers flagged it.</li>
                ) : null}
                {descriptionFixRequired && !descriptionChanged ? (
                  <li>Update the description — reviewers flagged it.</li>
                ) : null}
                {tagsFixRequired && !tagsChanged ? (
                  <li>Update tags — reviewers flagged them.</li>
                ) : null}
                {!thumbsFixOk ? (
                  <li>
                    Upload a new file for each thumbnail that requires a
                    replacement ({requiredThumbIds.size} slot
                    {requiredThumbIds.size === 1 ? "" : "s"}).
                  </li>
                ) : null}
              </>
            ) : null}
          </ul>
        ) : null}

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
              className={cn(
                titleFixRequired && !titleChanged && "border-destructive"
              )}
              aria-invalid={titleFixRequired && !titleChanged}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`mt-desc-${video.id}`}>Description</Label>
            <Textarea
              id={`mt-desc-${video.id}`}
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={cn(
                "min-h-[120px] resize-y text-sm leading-relaxed",
                descriptionFixRequired &&
                  !descriptionChanged &&
                  "border-destructive"
              )}
              aria-invalid={descriptionFixRequired && !descriptionChanged}
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
              className={cn(
                tagsFixRequired && !tagsChanged && "border-destructive"
              )}
              aria-invalid={tagsFixRequired && !tagsChanged}
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
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Doctor & specialty (optional)
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`mt-doctor-${video.id}`}>Doctor</Label>
              <Input
                id={`mt-doctor-${video.id}`}
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="e.g. Dr. Ramesh Kumar"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`mt-specialty-${video.id}`}>Specialty</Label>
              <select
                id={`mt-specialty-${video.id}`}
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="">Select specialty…</option>
                {specialtyOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-background/80 p-4 shadow-sm dark:bg-background/40">
          <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <ImageIcon className="size-4 shrink-0" aria-hidden />
            Thumbnails (same order as current version)
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {slotsNeedingUpload > 0 ? (
              <>
                <span className="font-medium text-foreground">
                  {slotsNeedingUpload} thumbnail slot
                  {slotsNeedingUpload === 1 ? "" : "s"}
                </span>{" "}
                need a new upload (rejected rows and any thumbnail Content/Brand
                flagged in the checklist). All other slots keep their current
                file. Order matches your current version.
              </>
            ) : (
              <>
                No thumbnail re-upload required — current images are sent back
                unchanged with your updated copy.
              </>
            )}
          </p>
          <ul className="space-y-4">
            {thumbs.map((t, idx) => {
              const needsFile = requiredThumbIds.has(t.id)
              const thumbUiStatus = displayThumbnailStatus(video, t.status)
              const file = replacementFiles[t.id] ?? null
              const previewKey = file
                ? `${file.name}-${file.size}-${file.lastModified}`
                : ""
              const canDeleteThumb =
                t.status === "REJECTED" &&
                video.metadataTrackStatus === "REJECTED" &&
                thumbs.length > 1
              return (
                <li
                  key={t.id}
                  className={cn(
                    "overflow-hidden rounded-xl border bg-card shadow-sm",
                    needsFile && !file
                      ? "border-destructive/60"
                      : "border-border"
                  )}
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
                          className={thumbnailStatusSurfaceClass(thumbUiStatus)}
                          variant="secondary"
                        >
                          {thumbUiStatus}
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
                      {canDeleteThumb ? (
                        <div className="space-y-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={
                              busy || deletingThumbId === t.id || !token
                            }
                            onClick={() => void handleDeleteThumbnail(t.id)}
                          >
                            {deletingThumbId === t.id ? (
                              <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : (
                              <Trash2 className="mr-2 size-4" />
                            )}
                            Remove rejected thumbnail
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            You must still resubmit metadata with the remaining
                            thumbnails.
                          </p>
                        </div>
                      ) : null}
                      {needsFile ? (
                        <div className="space-y-2 border-t border-border pt-3">
                          <Label htmlFor={`mt-repl-${video.id}-${t.id}`}>
                            Replacement image (required)
                          </Label>
                          <Input
                            id={`mt-repl-${video.id}-${t.id}`}
                            type="file"
                            accept="image/*"
                            className={cn(
                              "cursor-pointer bg-background",
                              !file
                                ? "border-destructive/60"
                                : "border-border"
                            )}
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
                      ) : thumbUiStatus === "APPROVED" ? (
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
          disabled={busy || !token || !metadataResubmitReady}
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
  specialtyOptions,
}: {
  pkg: FinalPackage
  token: string | null
  role: UserRole | undefined
  onPackageUpdated: (p: FinalPackage) => void
  specialtyOptions: PackageSpecialtyOption[]
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
        const thumbs = va ? thumbnailsOnAsset(va) : []
        const metadataIssues = getLatestPackageVideoRejectionIssueItems(
          video,
          "METADATA_TRACK"
        )
        const hasStructuredMetadataIssues = metadataIssues.length > 0
        const needsMetadataResubmit =
          video.status === "MEDICAL_REVIEW" &&
          mts === "REJECTED" &&
          (!hasStructuredMetadataIssues ||
            metadataIssues.some((i) => i.field !== "VIDEO") ||
            thumbs.some((t) => t.status === "REJECTED"))
        const latestMetaRejection =
          getLatestRejectionForVideoByTrack(video, "METADATA_TRACK") ??
          (mts === "REJECTED"
            ? getLatestDisplayableRejectionForVideo(video)
            : null)
        const metaFeedbackDisplay =
          metadataIssues.length > 0
            ? metadataIssues
            : getMetadataTrackFeedbackItems(video.reviews)
        const canWithdraw =
          role === "SUPER_ADMIN" &&
          video.status !== "WITHDRAWN" &&
          video.status !== "APPROVED"
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
                    Edit every field reviewers flagged in the checklist (compare
                    to the snapshot below). Upload a new image for each thumbnail
                    slot that requires a replacement.
                  </p>
                ) : null}
                {video.status === "MEDICAL_REVIEW" &&
                mts === "REJECTED" &&
                !needsMetadataResubmit ? (
                  <p className="text-foreground">
                    This rejection only flags the video file in the checklist.
                    Use the <strong>Videos</strong> tab to replace the clip; you
                    do not need to resubmit metadata here.
                  </p>
                ) : null}
                {video.status === "WITHDRAWN" ? (
                  <p>This video was withdrawn.</p>
                ) : null}
              </TrackStatusCallout>

              {needsMetadataResubmit &&
              (latestMetaRejection || metaFeedbackDisplay.length > 0) ? (
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
                    {latestMetaRejection ? (
                      <RejectionContextBlock
                        latestRejection={latestMetaRejection}
                        showOverall={Boolean(
                          latestMetaRejection.overallComments?.trim()
                        )}
                        itemFeedbackForDedup={metaFeedbackDisplay}
                      />
                    ) : null}
                    {metaFeedbackDisplay.length > 0 ? (
                      <PackageItemFeedbackHumanizedList
                        pkg={pkg}
                        items={metaFeedbackDisplay}
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
                        doctorName={asset.doctorName}
                        specialtyLabel={labelForSpecialtyValue(
                          asset.specialty,
                          specialtyOptions
                        )}
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
                          video={video}
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
                    metadataValidationIssues={metadataIssues}
                    onUpdated={onPackageUpdated}
                    specialtyOptions={specialtyOptions}
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
                        doctorName={asset.doctorName}
                        specialtyLabel={labelForSpecialtyValue(
                          asset.specialty,
                          specialtyOptions
                        )}
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
                      video={video}
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
