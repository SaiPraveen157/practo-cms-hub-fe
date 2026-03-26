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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuthStore } from "@/store"
import type { UserRole } from "@/types/auth"
import {
  getPackage,
  resubmitPackageMetadata,
  resubmitPackageVideos,
  uploadPackageThumbnailFile,
  uploadPackageVideoFile,
  withdrawPackage,
} from "@/lib/packages-api"
import type {
  FinalPackage,
  PackageAsset,
  PackageAssetFeedback,
  PackageItemFeedbackEntry,
  PackageStatus,
  PackageTrackStatus,
} from "@/types/package"
import {
  agencyPackageNeedsRevision,
  getLatestDisplayableRejection,
  type PackageRejectionDisplay,
} from "@/lib/package-list-utils"
import {
  PACKAGE_STATUS_LABELS,
  TRACK_STATUS_LABELS,
  assetsOfType,
  canWithdrawPackage,
  formatPackageDate,
  formatPackageFileSize,
  humanizeItemFeedbackField,
  packageStatusBadgeClass,
  thumbnailsForVideo,
  trackStatusSurfaceClass,
  videoAssets,
} from "@/lib/package-ui"
import { PackageTatCard } from "@/components/packages/package-tat-card"
import { PackageItemFeedbackHumanizedList } from "@/components/packages/package-item-feedback-humanized"
import { PackageListTabNav } from "@/components/packages/package-list-tab-nav"
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Calendar,
  CheckCircle2,
  Clapperboard,
  Clock,
  ExternalLink,
  FileVideo,
  Hash,
  Info,
  Loader2,
  Package,
  Smartphone,
  Upload,
  User,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type RevisionTab = "videos" | "metadata"

const METADATA_FEEDBACK_FIELDS = new Set<PackageItemFeedbackEntry["field"]>([
  "TITLE",
  "DESCRIPTION",
  "TAGS",
  "THUMBNAIL",
])

function filterVideoItemFeedback(
  items: PackageItemFeedbackEntry[] | undefined
): PackageItemFeedbackEntry[] {
  return (items ?? []).filter((i) => i.field === "VIDEO")
}

function filterMetadataItemFeedback(
  items: PackageItemFeedbackEntry[] | undefined
): PackageItemFeedbackEntry[] {
  return (items ?? []).filter((i) => METADATA_FEEDBACK_FIELDS.has(i.field))
}

function filterVideoAssetFeedback(
  items: PackageAssetFeedback[] | undefined
): PackageAssetFeedback[] {
  return (items ?? []).filter(
    (a) => a.assetType === "LONG_FORM" || a.assetType === "SHORT_FORM"
  )
}

function filterMetadataAssetFeedback(
  items: PackageAssetFeedback[] | undefined
): PackageAssetFeedback[] {
  return (items ?? []).filter(
    (a) =>
      a.assetType === "TITLE" ||
      a.assetType === "DESCRIPTION" ||
      a.assetType === "TAGS" ||
      a.assetType === "THUMBNAIL"
  )
}

/** Per-video metadata fields reviewers flagged (subset of item fields). */
type MetadataRevisionField = "TITLE" | "DESCRIPTION" | "TAGS" | "THUMBNAIL"

/**
 * Which video deliverables need a new file upload. If reviewers did not tie
 * feedback to specific videos, falls back to ALL (same as overall rejection).
 */
function getVideoReuploadAssetIdScope(
  pkg: FinalPackage,
  videoFeedback: {
    item: PackageItemFeedbackEntry[]
    asset: PackageAssetFeedback[]
  }
): "ALL" | Set<string> {
  const ids = new Set<string>()
  const sortedVideos = [...videoAssets(pkg)].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  )
  const longAsset = sortedVideos.find((v) => v.type === "LONG_FORM")
  const shortAssets = sortedVideos.filter((v) => v.type === "SHORT_FORM")

  for (const row of videoFeedback.item) {
    if (row.field === "VIDEO" && row.videoAssetId) ids.add(row.videoAssetId)
  }
  for (const row of videoFeedback.asset) {
    if (row.assetType === "LONG_FORM" && longAsset) ids.add(longAsset.id)
    if (row.assetType === "SHORT_FORM") {
      if (row.assetId) ids.add(row.assetId)
      else shortAssets.forEach((s) => ids.add(s.id))
    }
  }

  if (ids.size > 0) return ids
  return "ALL"
}

/**
 * When there is no line-item metadata feedback, treat the whole metadata
 * surface as open for edits (reviewer may have used overall comments only).
 */
function metadataNeedsLineItemScope(metadataFeedback: {
  item: PackageItemFeedbackEntry[]
  asset: PackageAssetFeedback[]
}): boolean {
  return metadataFeedback.item.length > 0 || metadataFeedback.asset.length > 0
}

function buildMetadataRevisionFieldMap(
  pkg: FinalPackage,
  metadataFeedback: {
    item: PackageItemFeedbackEntry[]
    asset: PackageAssetFeedback[]
  },
  useFullPerVideoRevision: boolean
): Map<string, Set<MetadataRevisionField>> {
  const ordered = [...videoAssets(pkg)].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  )
  const videoIds = ordered.map((v) => v.id)
  const all = (): Set<MetadataRevisionField> =>
    new Set(["TITLE", "DESCRIPTION", "TAGS", "THUMBNAIL"])

  const map = new Map<string, Set<MetadataRevisionField>>()
  for (const id of videoIds) map.set(id, new Set())

  if (useFullPerVideoRevision) {
    for (const id of videoIds) map.set(id, all())
    return map
  }

  for (const i of metadataFeedback.item) {
    if (!METADATA_FEEDBACK_FIELDS.has(i.field)) continue
    map.get(i.videoAssetId)?.add(i.field as MetadataRevisionField)
  }
  for (const a of metadataFeedback.asset) {
    const t = a.assetType
    if (
      t !== "TITLE" &&
      t !== "DESCRIPTION" &&
      t !== "TAGS" &&
      t !== "THUMBNAIL"
    )
      continue
    const field = t as MetadataRevisionField
    if (a.assetId) {
      map.get(a.assetId)?.add(field)
    } else {
      for (const id of videoIds) map.get(id)?.add(field)
    }
  }

  if (!useFullPerVideoRevision) {
    const anyTargeted = [...map.values()].some((s) => s.size > 0)
    if (!anyTargeted) {
      for (const id of videoIds) map.set(id, all())
    }
  }

  return map
}

function existingThumbnailsPayload(asset: PackageAsset) {
  return thumbnailsForVideo(asset).map((t) => ({
    fileUrl: t.fileUrl,
    fileName: t.fileName,
    fileType: t.fileType ?? undefined,
    fileSize: t.fileSize ?? undefined,
  }))
}

const VIDEO_PREVIEW_SHELL =
  "overflow-hidden rounded-xl border border-border bg-black shadow-md ring-1 ring-border/60"
const VIDEO_PREVIEW_CLASS = "max-h-[min(60vh,28rem)] w-full object-contain"

const EMPTY_FILE_LIST: File[] = []

function SubmittedVideoPlayerPaneInner({ asset }: { asset: PackageAsset }) {
  const [videoError, setVideoError] = useState(false)

  if (asset.fileUrl && !videoError) {
    return (
      <div className={VIDEO_PREVIEW_SHELL}>
        <video
          key={asset.fileUrl}
          src={asset.fileUrl}
          controls
          playsInline
          preload="metadata"
          className={VIDEO_PREVIEW_CLASS}
          onError={() => setVideoError(true)}
        >
          Your browser cannot play this video inline.
        </video>
      </div>
    )
  }

  return (
    <div className="flex min-h-[min(40vh,16rem)] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/40 px-4 py-10 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">
        {videoError
          ? "We couldn’t play this file in the browser (often network or permissions). Open it in a new tab instead."
          : "There is no playable URL for this file yet."}
      </p>
      {/* {asset.fileUrl ? (
        <Button variant="outline" size="sm" asChild>
          <a
            href={asset.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="mr-2 size-4" />
            Open in new tab
          </a>
        </Button>
      ) : null} */}
    </div>
  )
}

function SubmittedVideoPlayerPane({ asset }: { asset: PackageAsset }) {
  return (
    <SubmittedVideoPlayerPaneInner
      key={asset.fileUrl ?? `no-url-${asset.id}`}
      asset={asset}
    />
  )
}

function LocalReplacementVideoPreview({ file }: { file: File | null }) {
  if (!file) {
    return (
      <div className="flex min-h-[min(40vh,16rem)] items-center justify-center rounded-xl border border-dashed border-muted-foreground/25 bg-muted/30 px-4 py-8 text-center">
        <p className="max-w-xs text-sm text-muted-foreground">
          Choose a replacement file to preview it here, side by side with your
          current submission.
        </p>
      </div>
    )
  }
  const fileKey = `${file.name}-${file.size}-${file.lastModified}`
  return <LocalReplacementVideoPreviewInner key={fileKey} file={file} />
}

function ReplacementBlobVideoPlayer({
  objectUrl,
  file,
}: {
  objectUrl: string
  file: File
}) {
  const [videoError, setVideoError] = useState(false)

  if (videoError) {
    return (
      <div className="flex min-h-[min(40vh,16rem)] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/40 px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          This file can’t be previewed in the browser (codec or format). It can
          still upload if you resubmit.
        </p>
        <p className="font-mono text-xs break-all text-muted-foreground">
          {file.name} · {formatPackageFileSize(file.size)}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className={VIDEO_PREVIEW_SHELL}>
        <video
          controls
          playsInline
          preload="metadata"
          className={VIDEO_PREVIEW_CLASS}
          onError={() => setVideoError(true)}
        >
          {file.type ? (
            <source src={objectUrl} type={file.type} />
          ) : (
            <source src={objectUrl} />
          )}
          Your browser cannot play this video inline.
        </video>
      </div>
      <p className="font-mono text-xs break-all text-muted-foreground">
        {file.name} · {formatPackageFileSize(file.size)}
      </p>
    </div>
  )
}

function LocalReplacementVideoPreviewInner({ file }: { file: File }) {
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
      <div className="flex min-h-32 items-center justify-center rounded-xl border border-border bg-muted/20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <ReplacementBlobVideoPlayer
      key={objectUrl}
      objectUrl={objectUrl}
      file={file}
    />
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
}: {
  asset: PackageAsset
  label: string
  icon: ReactNode
}) {
  const size = formatPackageFileSize(asset.fileSize ?? undefined)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3 border-b border-border/80 pb-4">
        <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base leading-snug font-semibold text-foreground">
            {label}
          </p>
          <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
            {asset.fileName}
            {size ? ` · ${size}` : ""}
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 uppercase">
          {asset.type.replace("_", " ")}
        </Badge>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Preview
        </p>
        <SubmittedVideoPlayerPane asset={asset} />
      </div>
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
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
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
    if (pkg.videoTrackStatus === "REJECTED") setRevisionTab("videos")
    else if (pkg.metadataTrackStatus === "REJECTED") setRevisionTab("metadata")
  }, [pkg])

  const videosWithLabels = useMemo(() => {
    if (!pkg) return [] as Array<{ asset: PackageAsset; label: string }>
    let shortNum = 0
    return [...videoAssets(pkg)]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((v) => ({
        asset: v,
        label:
          v.type === "LONG_FORM"
            ? "Long-form (main)"
            : `Short-form ${++shortNum}`,
      }))
  }, [pkg])

  const hasNestedThumbnails = useMemo(
    () =>
      videosWithLabels.some(
        ({ asset }) => thumbnailsForVideo(asset).length > 0
      ),
    [videosWithLabels]
  )

  const legacyFlatThumbnails = useMemo(() => {
    if (!pkg || hasNestedThumbnails) return [] as PackageAsset[]
    return assetsOfType(pkg, "THUMBNAIL")
  }, [pkg, hasNestedThumbnails])

  const latestRejection = useMemo(
    () => (pkg ? getLatestDisplayableRejection(pkg) : null),
    [pkg]
  )

  const needsRevision = pkg ? agencyPackageNeedsRevision(pkg) : false

  const videoFeedback = useMemo(() => {
    if (!latestRejection)
      return {
        item: [] as PackageItemFeedbackEntry[],
        asset: [] as PackageAssetFeedback[],
      }
    return {
      item: filterVideoItemFeedback(latestRejection.itemFeedback),
      asset: filterVideoAssetFeedback(latestRejection.assetFeedback),
    }
  }, [latestRejection])

  const metadataFeedback = useMemo(() => {
    if (!latestRejection)
      return {
        item: [] as PackageItemFeedbackEntry[],
        asset: [] as PackageAssetFeedback[],
      }
    return {
      item: filterMetadataItemFeedback(latestRejection.itemFeedback),
      asset: filterMetadataAssetFeedback(latestRejection.assetFeedback),
    }
  }, [latestRejection])

  async function handleWithdraw() {
    if (!token || !id) return
    setWithdrawing(true)
    try {
      const res = await withdrawPackage(token, id)
      setPkg(res.package)
      setWithdrawOpen(false)
      toast.success(res.message ?? "Package withdrawn")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Withdraw failed")
    } finally {
      setWithdrawing(false)
    }
  }

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

  const status = pkg.status as PackageStatus
  const showWithdraw = canWithdrawPackage(pkg)

  const revisionTabs = [
    {
      key: "videos" as const,
      label:
        pkg.videoTrackStatus === "REJECTED"
          ? "Videos — needs update"
          : "Videos",
    },
    {
      key: "metadata" as const,
      label:
        pkg.metadataTrackStatus === "REJECTED"
          ? "Metadata — needs update"
          : "Metadata",
    },
  ]

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
                Version {pkg.version} · Updated{" "}
                {formatPackageDate(pkg.updatedAt)}
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
            {needsRevision && (
              <Button asChild className="w-full sm:w-auto">
                <Link
                  href={`/agency-poc-packages/new?scriptId=${encodeURIComponent(pkg.scriptId)}`}
                >
                  Full package wizard
                </Link>
              </Button>
            )}
            {showWithdraw && (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setWithdrawOpen(true)}
              >
                Withdraw (before review)
              </Button>
            )}
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
                    — Medical Affairs and Content/Brand review your{" "}
                    <strong className="font-medium text-foreground">
                      video files
                    </strong>{" "}
                    . If any video is rejected, upload new files only for
                    deliverables called out in the feedback (others stay as-is).
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
                    — Content/Brand reviews{" "}
                    <strong className="font-medium text-foreground">
                      titles, descriptions, tags, and thumbnails
                    </strong>
                    . If that track is rejected, change only what reviewers
                    flagged; new images only where thumbnails were flagged.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                    aria-hidden
                  />
                  <span>
                    The{" "}
                    <strong className="font-medium text-foreground">
                      timer
                    </strong>{" "}
                    under the tabs shows turnaround time (TAT) for this package.
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
                This package is <strong>approved and locked</strong> as of{" "}
                {formatPackageDate(pkg.lockedAt)}. No further agency changes are
                required.
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
              Pick the tab that matches what reviewers asked you to change. Each
              tab shows status, any comments, then your files or edit form.
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
              <PackageTatCard pkg={pkg} />

              {revisionTab === "videos" ? (
                <VideoRevisionPanel
                  pkg={pkg}
                  latestRejection={latestRejection}
                  videoFeedback={videoFeedback}
                  videosWithLabels={videosWithLabels}
                  token={token}
                  packageId={id}
                  onPackageUpdated={setPkg}
                />
              ) : (
                <MetadataRevisionPanel
                  pkg={pkg}
                  latestRejection={latestRejection}
                  metadataFeedback={metadataFeedback}
                  videosWithLabels={videosWithLabels}
                  legacyFlatThumbnails={legacyFlatThumbnails}
                  hasNestedThumbnails={hasNestedThumbnails}
                  token={token}
                  packageId={id}
                  onPackageUpdated={setPkg}
                />
              )}
            </div>
          </div>
        </section>

        {/* <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Hash className="size-5 text-muted-foreground" />
              Reference · IDs &amp; submission
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Use these when talking to Practo support or your internal team.
              They do not change when you resubmit tracks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Package ID
                </dt>
                <dd className="mt-1 font-mono text-sm break-all">{pkg.id}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Script ID
                </dt>
                <dd className="mt-1 font-mono text-sm break-all">
                  <Link
                    href={`/agency-poc/${pkg.scriptId}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {pkg.scriptId}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <Calendar className="size-3.5" />
                  Created
                </dt>
                <dd className="mt-1 text-sm">
                  {formatPackageDate(pkg.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <Calendar className="size-3.5" />
                  Last updated
                </dt>
                <dd className="mt-1 text-sm">
                  {formatPackageDate(pkg.updatedAt)}
                </dd>
              </div>
              {pkg.uploadedBy ? (
                <div className="sm:col-span-2">
                  <dt className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <User className="size-3.5" />
                    Submitted by
                  </dt>
                  <dd className="mt-1 text-sm">
                    {pkg.uploadedBy.firstName} {pkg.uploadedBy.lastName}
                    {pkg.uploadedBy.role ? ` · ${pkg.uploadedBy.role}` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card> */}
      </div>

      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw package?</DialogTitle>
            <DialogDescription>
              Only allowed before any reviewer has acted. The package returns to
              draft so you can edit and resubmit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleWithdraw} disabled={withdrawing}>
              {withdrawing && <Loader2 className="mr-2 size-4 animate-spin" />}
              Withdraw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TrackStatusCallout({
  status,
  title,
  children,
  /** When set, drives icon, border tint, and badge variant (e.g. “approved” track still waiting on another reviewer). */
  appearanceStatus,
  badgeLabel,
  headerDescription,
}: {
  status: PackageTrackStatus
  title: string
  children: ReactNode
  appearanceStatus?: PackageTrackStatus
  badgeLabel?: string
  headerDescription?: ReactNode
}) {
  const vis = appearanceStatus ?? status
  return (
    <Card className={cn("border-2 shadow-none", trackStatusSurfaceClass(vis))}>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2.5 text-lg leading-tight font-semibold">
            {vis === "APPROVED" && (
              <CheckCircle2 className="size-5 shrink-0 text-green-600 dark:text-green-400" />
            )}
            {vis === "PENDING" && (
              <Clock className="size-5 shrink-0 text-muted-foreground" />
            )}
            {vis === "REJECTED" && (
              <AlertTriangle className="size-5 shrink-0 text-destructive" />
            )}
            {title}
          </CardTitle>
          <Badge
            variant={
              vis === "REJECTED"
                ? "destructive"
                : vis === "APPROVED"
                  ? "default"
                  : "secondary"
            }
            className={cn(
              "shrink-0",
              badgeLabel
                ? "max-w-[min(100%,20rem)] text-center text-xs leading-tight font-medium whitespace-normal normal-case"
                : "uppercase"
            )}
          >
            {badgeLabel ?? TRACK_STATUS_LABELS[status]}
          </Badge>
        </div>
        <CardDescription className="text-xs font-normal text-muted-foreground">
          {headerDescription !== undefined ? (
            headerDescription
          ) : (
            <>
              {status === "APPROVED" &&
                "You do not need to upload or edit anything for this track."}
              {status === "PENDING" &&
                "Waiting on reviewers — nothing for you to do on this track yet."}
              {status === "REJECTED" &&
                "Reviewers asked for changes — follow the steps below this card."}
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="border-t border-border/60 pt-4 text-sm leading-relaxed">
        <div className="text-foreground [&_p]:leading-relaxed">{children}</div>
      </CardContent>
    </Card>
  )
}

function RejectionContextBlock({
  latestRejection,
  showOverall,
}: {
  latestRejection: PackageRejectionDisplay
  showOverall: boolean
}) {
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
      {showOverall && latestRejection.overallComments ? (
        <blockquote className="mt-4 border-l-4 border-destructive/50 bg-destructive/5 py-2 pr-3 pl-4 text-sm leading-relaxed text-foreground dark:bg-destructive/10">
          {latestRejection.overallComments}
        </blockquote>
      ) : null}
    </div>
  )
}

function VideoRevisionPanel({
  pkg,
  latestRejection,
  videoFeedback,
  videosWithLabels,
  token,
  packageId,
  onPackageUpdated,
}: {
  pkg: FinalPackage
  latestRejection: PackageRejectionDisplay | null
  videoFeedback: {
    item: PackageItemFeedbackEntry[]
    asset: PackageAssetFeedback[]
  }
  videosWithLabels: Array<{ asset: PackageAsset; label: string }>
  token: string | null
  packageId: string
  onPackageUpdated: (p: FinalPackage) => void
}) {
  const vts = pkg.videoTrackStatus
  const videoTrackTitle =
    pkg.status === "MEDICAL_REVIEW" && vts === "PENDING"
      ? "Video track (Medical Affairs)"
      : "Video track"

  const videoTrackCalloutExtras =
    vts === "APPROVED" && pkg.status === "BRAND_REVIEW"
      ? {
          appearanceStatus: "PENDING" as const,
          badgeLabel: "Medical approved · Brand review",
          headerDescription:
            "Medical Affairs has approved your video files. Content/Brand still needs to review them at this stage — hold off on new uploads unless they request changes.",
        }
      : vts === "APPROVED" &&
          pkg.status === "MEDICAL_REVIEW" &&
          pkg.metadataTrackStatus === "PENDING"
        ? {
            appearanceStatus: "PENDING" as const,
            badgeLabel: "Medical approved · Metadata pending",
            headerDescription:
              "Medical Affairs has approved your videos. Content/Brand is still reviewing titles, thumbnails, and copy — see the Metadata tab.",
          }
        : {}

  const hasVideoRejectDetail =
    videoFeedback.item.length > 0 || videoFeedback.asset.length > 0

  const videoReuploadScope = useMemo(
    () => getVideoReuploadAssetIdScope(pkg, videoFeedback),
    [pkg, videoFeedback]
  )

  const videoNeedsNewFile = useCallback(
    (assetId: string) =>
      videoReuploadScope === "ALL" || videoReuploadScope.has(assetId),
    [videoReuploadScope]
  )

  const flaggedVideoCount = useMemo(() => {
    if (videoReuploadScope === "ALL") return videosWithLabels.length
    return [...videoReuploadScope].filter((id) =>
      videosWithLabels.some(({ asset }) => asset.id === id)
    ).length
  }, [videoReuploadScope, videosWithLabels])

  const [replacementFiles, setReplacementFiles] = useState<
    Record<string, File | null>
  >({})
  const [videoResubmitBusy, setVideoResubmitBusy] = useState(false)

  async function handleResubmitVideos() {
    if (!token) {
      toast.error("Sign in to resubmit videos")
      return
    }
    for (const { asset, label } of videosWithLabels) {
      if (!videoNeedsNewFile(asset.id)) continue
      if (!replacementFiles[asset.id]) {
        toast.error(
          `Choose a replacement file for ${label} — reviewers flagged this video`
        )
        return
      }
    }
    setVideoResubmitBusy(true)
    try {
      const videos: Array<{
        type: "LONG_FORM" | "SHORT_FORM"
        fileUrl: string
        fileName: string
        fileType: string
        fileSize: number
        order: number
      }> = []
      for (const { asset } of videosWithLabels) {
        if (videoNeedsNewFile(asset.id)) {
          const file = replacementFiles[asset.id]!
          const meta = await uploadPackageVideoFile(token, file)
          videos.push({
            type: asset.type as "LONG_FORM" | "SHORT_FORM",
            fileUrl: meta.fileUrl,
            fileName: meta.fileName,
            fileType: meta.fileType,
            fileSize: meta.fileSize,
            order: asset.order ?? videos.length + 1,
          })
        } else {
          videos.push({
            type: asset.type as "LONG_FORM" | "SHORT_FORM",
            fileUrl: asset.fileUrl,
            fileName: asset.fileName,
            fileType: asset.fileType || "video/mp4",
            fileSize: asset.fileSize ?? 0,
            order: asset.order ?? videos.length + 1,
          })
        }
      }
      const res = await resubmitPackageVideos(token, packageId, { videos })
      if (res.package) onPackageUpdated(res.package)
      setReplacementFiles({})
      toast.success(
        res.message ?? "Videos resubmitted — track set back to pending review"
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resubmit failed")
    } finally {
      setVideoResubmitBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <TrackStatusCallout
        status={vts}
        title={videoTrackTitle}
        {...videoTrackCalloutExtras}
      >
        {vts === "APPROVED" && pkg.status === "BRAND_REVIEW" && (
          <p className="text-foreground">
            <strong>Medical Affairs</strong> has signed off on your long-form
            and short videos. <strong>Content/Brand</strong> is now reviewing
            those same files. You do not need to upload or replace anything
            until they approve or send feedback — use the previews below for
            reference.
          </p>
        )}
        {vts === "APPROVED" &&
          pkg.status === "MEDICAL_REVIEW" &&
          pkg.metadataTrackStatus === "PENDING" && (
            <p className="text-foreground">
              Your video files are approved by Medical Affairs. Content/Brand is
              still working through <strong>metadata</strong> (titles,
              descriptions, tags, thumbnail picks). Switch to the{" "}
              <strong>Metadata (Content/Brand)</strong> tab for that status; no
              new video upload is needed yet.
            </p>
          )}
        {vts === "APPROVED" &&
          pkg.status !== "BRAND_REVIEW" &&
          !(
            pkg.status === "MEDICAL_REVIEW" &&
            pkg.metadataTrackStatus === "PENDING"
          ) && (
            <p className="text-foreground">
              {pkg.status === "APPROVER_REVIEW" ? (
                <>
                  Medical Affairs and Content/Brand have approved your videos
                  for this package. The Content Approver is doing final
                  sign-off. No video changes are needed unless the package is
                  sent back.
                </>
              ) : (
                <>
                  No action required. Reviewers have approved your video files
                  (long-form and shorts) for this stage. You can still open the
                  files below for reference.
                </>
              )}
            </p>
          )}
        {vts === "PENDING" && (
          <p>
            Medical Affairs is reviewing your video files. You do not need to
            change anything until they approve or request changes.
          </p>
        )}
        {vts === "REJECTED" && (
          <p className="text-foreground">
            Medical Affairs asked for changes on the{" "}
            <strong>video track</strong>. Upload a{" "}
            <strong>
              new file only for deliverables called out in the feedback
            </strong>{" "}
            (or every deliverable if the notes are general). Other videos are
            sent again unchanged. Use <strong>Resubmit videos</strong> when
            ready. Titles, descriptions, tags, and thumbnails are updated in the{" "}
            <strong>Metadata (Content/Brand)</strong> tab if that track was
            rejected too.
          </p>
        )}
      </TrackStatusCallout>

      {vts === "REJECTED" && latestRejection && (
        <Card className="border-destructive/40 bg-destructive/5 shadow-none">
          <CardHeader className="space-y-1 pb-3">
            <CardTitle className="text-lg font-semibold text-destructive">
              Reviewer feedback (videos)
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Use the line items below to see which deliverables need a new
              upload. Only those need a replacement file; the rest stay as-is.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 border-t border-border/60 pt-4">
            <RejectionContextBlock
              latestRejection={latestRejection}
              showOverall={Boolean(
                latestRejection.overallComments?.trim() &&
                (hasVideoRejectDetail ||
                  !(latestRejection.itemFeedback ?? []).some((i) =>
                    METADATA_FEEDBACK_FIELDS.has(i.field)
                  ))
              )}
            />
            {videoFeedback.asset.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {videoFeedback.asset.map((a, i) => (
                  <li
                    key={a.id ?? i}
                    className="rounded-lg border border-border bg-background px-3 py-3 shadow-sm"
                  >
                    <span className="font-semibold text-foreground">
                      {a.assetType}
                    </span>
                    {a.comments ? (
                      <p className="mt-2 leading-relaxed text-muted-foreground">
                        {a.comments}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {videoFeedback.item.length > 0 ? (
              <PackageItemFeedbackHumanizedList
                pkg={pkg}
                items={videoFeedback.item}
                className="border-t-0 pt-0"
              />
            ) : null}
            {!hasVideoRejectDetail &&
            !latestRejection.overallComments?.trim() ? (
              <p className="text-sm text-muted-foreground">
                No line-item video notes on this response. Refresh the page
                after a moment or confirm details with Medical Affairs.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          Your submitted videos
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Preview plays in the browser when supported. To change titles,
          descriptions, tags, or thumbnails, open the{" "}
          <strong>Metadata (Content/Brand)</strong> tab.
          {vts === "REJECTED" ? (
            <>
              {" "}
              Deliverables flagged in the feedback need a replacement file;
              others show as reference only.
            </>
          ) : null}
        </p>
        <div className="space-y-6">
          {videosWithLabels.map(({ asset, label }) => {
            const icon =
              asset.type === "LONG_FORM" ? (
                <Clapperboard className="size-5" />
              ) : (
                <Smartphone className="size-5" />
              )
            const submittedVideoSize = formatPackageFileSize(
              asset.fileSize ?? undefined
            )
            return (
              <Card key={asset.id} className="overflow-hidden shadow-sm">
                <CardHeader className="border-b border-border bg-muted/30 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base font-semibold">
                      {label}
                    </CardTitle>
                    {vts === "REJECTED" ? (
                      videoNeedsNewFile(asset.id) ? (
                        <Badge variant="destructive" className="uppercase">
                          Replacement file needed
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Keep current file</Badge>
                      )
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-4 sm:p-6">
                  {vts === "REJECTED" && videoNeedsNewFile(asset.id) ? (
                    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                      <div className="min-w-0 space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          Current submission
                        </p>
                        <div className="flex flex-wrap items-start gap-3 border-b border-border/80 pb-3">
                          <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            {icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-xs break-all text-muted-foreground">
                              {asset.fileName}
                              {submittedVideoSize
                                ? ` · ${submittedVideoSize}`
                                : ""}
                            </p>
                          </div>
                          <Badge
                            variant="secondary"
                            className="shrink-0 uppercase"
                          >
                            {asset.type.replace("_", " ")}
                          </Badge>
                        </div>
                        <SubmittedVideoPlayerPane asset={asset} />
                        <a
                          href={asset.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                        >
                          <FileVideo className="size-4" />
                          Open current video in new tab
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                      <div className="min-w-0 space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                          Your replacement
                        </p>
                        <LocalReplacementVideoPreview
                          file={replacementFiles[asset.id] ?? null}
                        />
                        <div className="space-y-2 rounded-lg border-2 border-dashed border-primary/25 bg-primary/5 p-4 dark:border-primary/30 dark:bg-primary/10">
                          <Label
                            htmlFor={`video-replace-${asset.id}`}
                            className="text-foreground"
                          >
                            Replacement video file
                          </Label>
                          <Input
                            id={`video-replace-${asset.id}`}
                            type="file"
                            accept="video/*"
                            className="cursor-pointer border-border bg-background"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null
                              setReplacementFiles((prev) => ({
                                ...prev,
                                [asset.id]: f,
                              }))
                            }}
                          />
                          {replacementFiles[asset.id] ? (
                            <p className="text-xs text-muted-foreground">
                              Change the file above to update this preview.
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Required before resubmit.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : vts === "REJECTED" && !videoNeedsNewFile(asset.id) ? (
                    <div className="space-y-3">
                      <p className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                        Reviewers did not flag this video for a new upload. Your
                        current file will be sent again unchanged when you
                        resubmit the video track.
                      </p>
                      <AgencyPackageVideoPreview
                        asset={asset}
                        label={label}
                        icon={icon}
                      />
                      {/* <a
                        href={asset.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                      >
                        <FileVideo className="size-4" />
                        Open video in new tab
                        <ExternalLink className="size-3.5" />
                      </a> */}
                    </div>
                  ) : (
                    <>
                      <AgencyPackageVideoPreview
                        asset={asset}
                        label={label}
                        icon={icon}
                      />
                      {/* <a
                        href={asset.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                      >
                        <FileVideo className="size-4" />
                        Open video in new tab
                        <ExternalLink className="size-3.5" />
                      </a> */}
                    </>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
        {vts === "REJECTED" ? (
          <div className="mt-8 flex flex-col gap-4 rounded-xl border border-primary/25 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between dark:bg-primary/10">
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              {videoReuploadScope === "ALL" ? (
                <>
                  Reviewers did not tie notes to specific files — upload a new
                  file for <strong>each</strong> deliverable below.
                </>
              ) : (
                <>
                  <strong>{flaggedVideoCount}</strong>{" "}
                  {flaggedVideoCount === 1
                    ? "deliverable needs a new upload"
                    : "deliverables need a new upload"}
                  . The others are reused automatically.
                </>
              )}{" "}
              After a successful resubmit, this track returns to{" "}
              <strong>pending review</strong>.
            </p>
            <Button
              onClick={handleResubmitVideos}
              disabled={videoResubmitBusy || !token}
              className="shrink-0"
            >
              {videoResubmitBusy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Upload className="mr-2 size-4" />
              )}
              Resubmit videos
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

type MetadataDraftRow = {
  assetId: string
  order: number
  type: "LONG_FORM" | "SHORT_FORM"
  title: string
  description: string
  tagsInput: string
}

function MetadataResubmitForm({
  pkg,
  token,
  packageId,
  videosWithLabels,
  revisionFieldsByAsset,
  onPackageUpdated,
}: {
  pkg: FinalPackage
  token: string | null
  packageId: string
  videosWithLabels: Array<{ asset: PackageAsset; label: string }>
  revisionFieldsByAsset: Map<string, Set<MetadataRevisionField>>
  onPackageUpdated: (p: FinalPackage) => void
}) {
  const [drafts, setDrafts] = useState<MetadataDraftRow[]>([])
  const [thumbFilesByAsset, setThumbFilesByAsset] = useState<
    Record<string, File[]>
  >({})
  const [busy, setBusy] = useState(false)

  const initialRows = useMemo(
    () =>
      videosWithLabels.map(({ asset }) => ({
        assetId: asset.id,
        order: asset.order ?? 1,
        type: asset.type as "LONG_FORM" | "SHORT_FORM",
        title: asset.title?.trim() ?? "",
        description: asset.description?.trim() ?? "",
        tagsInput: (asset.tags ?? []).join(", "),
      })),
    [videosWithLabels]
  )

  const revisionFieldsKey = useMemo(
    () =>
      [...revisionFieldsByAsset.entries()]
        .map(([id, s]) => `${id}:${[...s].sort().join(",")}`)
        .sort()
        .join("|"),
    [revisionFieldsByAsset]
  )

  useEffect(() => {
    setDrafts(initialRows)
    setThumbFilesByAsset({})
  }, [pkg.id, pkg.updatedAt, initialRows, revisionFieldsKey])

  function patchDraft(assetId: string, patch: Partial<MetadataDraftRow>) {
    setDrafts((rows) =>
      rows.map((r) => (r.assetId === assetId ? { ...r, ...patch } : r))
    )
  }

  async function handleResubmitMetadata() {
    if (!token) {
      toast.error("Sign in to resubmit metadata")
      return
    }
    for (const row of drafts) {
      const fields =
        revisionFieldsByAsset.get(row.assetId) ??
        new Set<MetadataRevisionField>()
      if (!fields.has("THUMBNAIL")) continue
      const files = thumbFilesByAsset[row.assetId] ?? []
      if (files.length === 0) {
        const label =
          videosWithLabels.find((v) => v.asset.id === row.assetId)?.label ??
          "deliverable"
        toast.error(
          `Add at least one new thumbnail image for ${label} — reviewers flagged thumbnails`
        )
        return
      }
    }
    setBusy(true)
    try {
      const videoMetadata = []
      for (const row of drafts) {
        const submitted = videosWithLabels.find(
          (v) => v.asset.id === row.assetId
        )?.asset
        if (!submitted) continue

        const fields =
          revisionFieldsByAsset.get(row.assetId) ??
          new Set<MetadataRevisionField>()

        if (fields.size === 0) {
          videoMetadata.push({
            order: row.order,
            type: row.type,
            title: submitted.title?.trim() ?? "",
            description: submitted.description?.trim() ?? "",
            tags: submitted.tags ?? [],
            thumbnails: existingThumbnailsPayload(submitted),
          })
          continue
        }

        const title = fields.has("TITLE")
          ? row.title.trim()
          : (submitted.title?.trim() ?? "")
        const description = fields.has("DESCRIPTION")
          ? row.description.trim()
          : (submitted.description?.trim() ?? "")
        const tags = fields.has("TAGS")
          ? row.tagsInput
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : (submitted.tags ?? [])

        let thumbnails
        if (fields.has("THUMBNAIL")) {
          const thumbs = []
          for (const f of thumbFilesByAsset[row.assetId] ?? []) {
            const m = await uploadPackageThumbnailFile(token, f)
            thumbs.push({
              fileUrl: m.fileUrl,
              fileName: m.fileName,
              fileType: m.fileType,
              fileSize: m.fileSize,
            })
          }
          thumbnails = thumbs
        } else {
          thumbnails = existingThumbnailsPayload(submitted)
        }

        videoMetadata.push({
          order: row.order,
          type: row.type,
          title,
          description,
          tags,
          thumbnails,
        })
      }
      const res = await resubmitPackageMetadata(token, packageId, {
        videoMetadata,
      })
      if (res.package) onPackageUpdated(res.package)
      setThumbFilesByAsset({})
      toast.success(
        res.message ?? "Metadata resubmitted — track set back to pending review"
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resubmit failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/5 shadow-none">
      <CardHeader className="space-y-2 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Upload className="size-5 shrink-0" />
          Edit and resubmit metadata
        </CardTitle>
        <CardDescription className="max-w-3xl leading-relaxed">
          Change only what appears in the reviewer feedback (titles, copy, tags,
          or thumbnails). Everything else is sent back unchanged. New thumbnail
          uploads are required only when thumbnails were flagged. To swap video
          files, use the <strong>Videos</strong> tab.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8 border-t border-border/60 pt-6">
        {drafts.map((row) => {
          const match = videosWithLabels.find((v) => v.asset.id === row.assetId)
          const label = match?.label ?? row.type
          const submittedAsset = match?.asset
          const thumbList = thumbFilesByAsset[row.assetId] ?? EMPTY_FILE_LIST
          const thumbPreviewKey =
            thumbList.length === 0
              ? ""
              : thumbList
                  .map((f) => `${f.name}-${f.size}-${f.lastModified}`)
                  .join("|")
          const existingThumbs = submittedAsset
            ? thumbnailsForVideo(submittedAsset)
            : []
          const revisionFields =
            revisionFieldsByAsset.get(row.assetId) ??
            new Set<MetadataRevisionField>()
          const editTitle = revisionFields.has("TITLE")
          const editDescription = revisionFields.has("DESCRIPTION")
          const editTags = revisionFields.has("TAGS")
          const editThumb = revisionFields.has("THUMBNAIL")
          const hasAnyRevision = revisionFields.size > 0

          if (!submittedAsset) {
            return (
              <div
                key={row.assetId}
                className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              >
                Missing deliverable data for this row.
              </div>
            )
          }

          return (
            <div
              key={row.assetId}
              className="space-y-5 rounded-xl border border-border bg-background p-4 shadow-sm sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{label}</p>
                {hasAnyRevision ? (
                  <Badge variant="outline" className="max-w-full font-normal">
                    <span className="break-words">
                      {[...revisionFields]
                        .sort()
                        .map((f) => humanizeItemFeedbackField(f))
                        .join(" · ")}
                    </span>
                  </Badge>
                ) : (
                  <Badge variant="secondary">No line-item flags</Badge>
                )}
              </div>

              <div className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Current submission (read-only)
                </p>
                <div className="grid gap-6 md:grid-cols-2 md:items-stretch">
                  <div className="flex min-h-0 flex-col space-y-4 rounded-xl border border-border bg-muted/25 p-4 text-base sm:p-5 dark:bg-muted/15">
                    <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Video metadata
                    </p>
                    <div className="space-y-1.5">
                      <p className="text-sm text-muted-foreground">Title</p>
                      <p className="text-lg leading-snug font-medium text-foreground">
                        {submittedAsset.title?.trim() || "—"}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-sm text-muted-foreground">Description</p>
                      <p className="text-base leading-relaxed text-muted-foreground">
                        {submittedAsset.description?.trim() || "—"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Tags</p>
                      {submittedAsset.tags && submittedAsset.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {submittedAsset.tags.map((t) => (
                            <Badge key={t} variant="secondary">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-base text-muted-foreground">—</p>
                      )}
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-col space-y-4 rounded-xl border border-border bg-muted/25 p-4 text-base sm:p-5 dark:bg-muted/15">
                    <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Thumbnail
                    </p>
                    {existingThumbs.length > 0 ? (
                      <div className="flex min-h-0 flex-1 flex-col gap-3">
                        {existingThumbs.map((t) => (
                          <a
                            key={t.id}
                            href={t.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group relative aspect-video overflow-hidden rounded-lg border border-border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={t.fileUrl}
                              alt=""
                              className="size-full object-cover transition-opacity group-hover:opacity-90"
                            />
                            {t.isSelected ? (
                              <span className="absolute top-1 left-1 rounded bg-green-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-green-700/90">
                                Selected
                              </span>
                            ) : null}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="text-base text-muted-foreground">
                        No thumbnails on file for this deliverable.
                      </p>
                    )}
                  </div>
                </div>

                {hasAnyRevision ? (
                  <div className="min-w-0 space-y-4 border-t border-border pt-6">
                    <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                      Your updates
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Only the fields reviewers flagged are editable below.
                    </p>
                    {editTitle ? (
                      <div className="space-y-2">
                        <Label htmlFor={`mt-title-${row.assetId}`}>Title</Label>
                        <Input
                          id={`mt-title-${row.assetId}`}
                          value={row.title}
                          onChange={(e) =>
                            patchDraft(row.assetId, {
                              title: e.target.value,
                            })
                          }
                        />
                      </div>
                    ) : null}
                    {editDescription ? (
                      <div className="space-y-2">
                        <Label htmlFor={`mt-desc-${row.assetId}`}>
                          Description
                        </Label>
                        <Textarea
                          id={`mt-desc-${row.assetId}`}
                          rows={4}
                          value={row.description}
                          onChange={(e) =>
                            patchDraft(row.assetId, {
                              description: e.target.value,
                            })
                          }
                        />
                      </div>
                    ) : null}
                    {editTags ? (
                      <div className="space-y-2">
                        <Label htmlFor={`mt-tags-${row.assetId}`}>Tags</Label>
                        <Input
                          id={`mt-tags-${row.assetId}`}
                          placeholder="comma, separated, tags"
                          value={row.tagsInput}
                          onChange={(e) =>
                            patchDraft(row.assetId, {
                              tagsInput: e.target.value,
                            })
                          }
                        />
                      </div>
                    ) : null}
                    {editThumb ? (
                      <div className="space-y-3 border-t border-border pt-4">
                        <div>
                          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            New thumbnails (preview)
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Compare with the current thumbnails above before you
                            submit.
                          </p>
                        </div>
                        {thumbList.length === 0 ? (
                          <div className="flex min-h-26 items-center justify-center rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
                            Selected images will appear here for comparison.
                          </div>
                        ) : (
                          <LocalThumbnailPreviews
                            key={thumbPreviewKey}
                            files={thumbList}
                          />
                        )}
                        <div className="space-y-2 rounded-lg border-2 border-dashed border-primary/25 bg-primary/5 p-4 dark:border-primary/30 dark:bg-primary/10">
                          <Label
                            htmlFor={`mt-thumbs-${row.assetId}`}
                            className="text-foreground"
                          >
                            New thumbnail images (one or more)
                          </Label>
                          <Input
                            id={`mt-thumbs-${row.assetId}`}
                            type="file"
                            accept="image/*"
                            multiple
                            className="cursor-pointer border-border bg-background"
                            onChange={(e) => {
                              const list = e.target.files
                              const files = list ? Array.from(list) : []
                              setThumbFilesByAsset((prev) => ({
                                ...prev,
                                [row.assetId]: files,
                              }))
                            }}
                          />
                          {thumbList.length > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Pick different files above to refresh the preview
                              grid.
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              At least one new image required — reviewers
                              flagged thumbnails.
                            </p>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-muted/15 p-4 text-sm text-muted-foreground">
                    Reviewers did not attach line-item metadata notes to this
                    deliverable. It will be resubmitted unchanged.
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between dark:bg-primary/10">
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Only flagged fields change; other values and thumbnails are reused.
            This track returns to <strong>pending review</strong> after submit.
          </p>
          <Button
            onClick={handleResubmitMetadata}
            disabled={busy || !token}
            className="w-full shrink-0 sm:w-auto"
          >
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Upload className="mr-2 size-4" />
            )}
            Resubmit metadata
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function MetadataRevisionPanel({
  pkg,
  latestRejection,
  metadataFeedback,
  videosWithLabels,
  legacyFlatThumbnails,
  hasNestedThumbnails,
  token,
  packageId,
  onPackageUpdated,
}: {
  pkg: FinalPackage
  latestRejection: PackageRejectionDisplay | null
  metadataFeedback: {
    item: PackageItemFeedbackEntry[]
    asset: PackageAssetFeedback[]
  }
  videosWithLabels: Array<{ asset: PackageAsset; label: string }>
  legacyFlatThumbnails: PackageAsset[]
  hasNestedThumbnails: boolean
  token: string | null
  packageId: string
  onPackageUpdated: (p: FinalPackage) => void
}) {
  const mts = pkg.metadataTrackStatus
  const hasMetaRejectDetail =
    metadataFeedback.item.length > 0 || metadataFeedback.asset.length > 0

  const metadataRevisionFieldMap = useMemo(
    () =>
      buildMetadataRevisionFieldMap(
        pkg,
        metadataFeedback,
        !metadataNeedsLineItemScope(metadataFeedback)
      ),
    [pkg, metadataFeedback]
  )

  return (
    <div className="space-y-8">
      <TrackStatusCallout status={mts} title="Metadata track (Content / Brand)">
        {mts === "APPROVED" && (
          <p className="text-foreground">
            No action required. Content/Brand has approved titles, descriptions,
            tags, and thumbnail choices for this stage. Details below are
            read-only for your reference.
          </p>
        )}
        {mts === "PENDING" && (
          <p>
            Content/Brand is reviewing titles, descriptions, tags, and
            thumbnails. Wait for approval or feedback before changing copy.
          </p>
        )}
        {mts === "REJECTED" && (
          <p className="text-foreground">
            Content/Brand asked for changes to{" "}
            <strong>copy or thumbnails</strong>. Update <strong>only</strong>{" "}
            what appears in the feedback below; other fields stay as-is. New
            thumbnail uploads are required only where thumbnails were flagged.
          </p>
        )}
      </TrackStatusCallout>

      {mts === "REJECTED" && latestRejection && (
        <Card className="border-destructive/40 bg-destructive/5 shadow-none">
          <CardHeader className="space-y-1 pb-3">
            <CardTitle className="text-lg font-semibold text-destructive">
              Reviewer feedback (metadata)
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Copy and thumbnail notes from Content/Brand. Video file issues are
              listed under <strong>Videos</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 border-t border-border/60 pt-4">
            <RejectionContextBlock
              latestRejection={latestRejection}
              showOverall={Boolean(
                latestRejection.overallComments?.trim() &&
                (hasMetaRejectDetail ||
                  !(latestRejection.itemFeedback ?? []).some(
                    (i) => i.field === "VIDEO"
                  ))
              )}
            />
            {metadataFeedback.asset.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {metadataFeedback.asset.map((a, i) => (
                  <li
                    key={a.id ?? i}
                    className="rounded-lg border border-border bg-background px-3 py-3 shadow-sm"
                  >
                    <span className="font-semibold text-foreground">
                      {a.assetType}
                    </span>
                    {a.comments ? (
                      <p className="mt-2 leading-relaxed text-muted-foreground">
                        {a.comments}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {metadataFeedback.item.length > 0 ? (
              <PackageItemFeedbackHumanizedList
                pkg={pkg}
                items={metadataFeedback.item}
                className="border-t-0 pt-0"
              />
            ) : null}
            {!hasMetaRejectDetail &&
            !latestRejection.overallComments?.trim() ? (
              <p className="text-sm text-muted-foreground">
                No line-item metadata notes on this response. Refresh the page
                after a moment or confirm with Content/Brand.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {mts === "REJECTED" && (
        <MetadataResubmitForm
          pkg={pkg}
          token={token}
          packageId={packageId}
          videosWithLabels={videosWithLabels}
          revisionFieldsByAsset={metadataRevisionFieldMap}
          onPackageUpdated={onPackageUpdated}
        />
      )}

      {/* <Card className="shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Package className="size-4 shrink-0" />
            Package-wide title, description, and tags
          </CardTitle>
          <CardDescription className="leading-relaxed">
            These apply to the whole submission. Reviewers may also comment on
            each video&apos;s fields below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {pkg.title && pkg.title !== (pkg.name ?? "") ? (
            <p>
              <span className="text-muted-foreground">Title: </span>
              <span className="font-medium">{pkg.title}</span>
            </p>
          ) : null}
          <p className="leading-relaxed text-muted-foreground">
            {pkg.description?.trim() || "—"}
          </p>
          {pkg.tags && pkg.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {pkg.tags.map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No package-level tags.
            </p>
          )}
        </CardContent>
      </Card> */}

      {mts !== "REJECTED" && (
        <>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              Per-video Metadata and thumbnails
            </h3>
            <p className="mt-2 max-w-3xl text-base leading-relaxed text-muted-foreground">
              Read-only reference while reviewers are deciding or after
              approval.
            </p>
            <div className="mt-4 space-y-4">
              {videosWithLabels.map(({ asset, label }) => {
                const vidThumbs = thumbnailsForVideo(asset)
                return (
                  <Card key={asset.id} className="shadow-sm">
                    <CardHeader className="border-b border-border bg-muted/20 pb-3">
                      <CardTitle className="text-base font-semibold">
                        {label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 text-base sm:p-6">
                      <div className="grid gap-6 md:grid-cols-2 md:items-stretch">
                        <div className="flex min-h-0 flex-col space-y-4 rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
                          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            Video metadata
                          </p>
                          {asset.title?.trim() ? (
                            <div className="space-y-1.5">
                              <p className="text-sm text-muted-foreground">
                                Title
                              </p>
                              <p className="text-lg font-medium leading-snug text-foreground">
                                {asset.title.trim()}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm italic text-muted-foreground">
                              No title on this deliverable.
                            </p>
                          )}
                          {asset.description?.trim() ? (
                            <div className="space-y-1.5">
                              <p className="text-sm text-muted-foreground">
                                Description
                              </p>
                              <p className="text-base leading-relaxed text-muted-foreground">
                                {asset.description.trim()}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm italic text-muted-foreground">
                              No description.
                            </p>
                          )}
                          {asset.tags && asset.tags.length > 0 ? (
                            <div className="space-y-2">
                              <p className="text-sm text-muted-foreground">
                                Tags
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {asset.tags.map((t) => (
                                  <Badge key={t} variant="secondary">
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm italic text-muted-foreground">
                              No tags.
                            </p>
                          )}
                        </div>
                        <div className="flex min-h-0 flex-col space-y-4 rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
                          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            Thumbnail
                          </p>
                          {vidThumbs.length > 0 ? (
                            <div className="flex min-h-0 flex-1 flex-col gap-3">
                              {vidThumbs.map((t) => {
                                const ts = formatPackageFileSize(
                                  t.fileSize ?? undefined
                                )
                                return (
                                  <div
                                    key={t.id}
                                    className="min-w-0 space-y-1.5 overflow-hidden rounded-lg bg-muted/30"
                                  >
                                    <a
                                      href={t.fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="group relative block aspect-video overflow-hidden rounded-lg border border-border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={t.fileUrl}
                                        alt={t.fileName ?? "Thumbnail"}
                                        className="size-full object-cover transition-opacity group-hover:opacity-90"
                                      />
                                      {t.isSelected ? (
                                        <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded bg-green-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-green-700/90">
                                          <BadgeCheck className="size-3 shrink-0" />
                                          Selected
                                        </span>
                                      ) : null}
                                    </a>
                                    <p className="truncate px-0.5 font-mono text-xs text-muted-foreground">
                                      {t.fileName}
                                    </p>
                                    {ts ? (
                                      <p className="px-0.5 text-xs text-muted-foreground">
                                        {ts}
                                      </p>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              No thumbnails nested on this asset.
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>

          {legacyFlatThumbnails.length > 0 ? (
            <AssetSection
              title="Thumbnails (legacy layout)"
              assets={legacyFlatThumbnails}
            />
          ) : null}

          {pkg.selectedThumbnail && !hasNestedThumbnails ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Selected thumbnail (legacy)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pkg.selectedThumbnail.fileUrl ? (
                  <a
                    href={pkg.selectedThumbnail.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative block max-w-md overflow-hidden rounded-xl border border-border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pkg.selectedThumbnail.fileUrl}
                      alt={pkg.selectedThumbnail.fileName ?? ""}
                      className="aspect-video w-full object-cover transition-opacity group-hover:opacity-90"
                    />
                  </a>
                ) : null}
                <p className="truncate font-mono text-sm text-muted-foreground">
                  {pkg.selectedThumbnail.fileName}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
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
  if (!assets.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {assets.map((a) => {
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
