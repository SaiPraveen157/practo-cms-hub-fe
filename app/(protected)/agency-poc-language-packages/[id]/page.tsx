"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useAuthStore } from "@/store"
import type { UserRole } from "@/types/auth"
import type {
  PackageItemFeedbackEntry,
  PackageItemFeedbackField,
} from "@/types/package"
import {
  addLanguagePackageVideo,
  getLanguagePackage,
  resubmitLanguageMetadata,
  resubmitLanguageVideoFile,
  updateLanguagePackageName,
  uploadLanguagePackageThumbnailFile,
  uploadLanguagePackageVideoFile,
  withdrawLanguageVideo,
} from "@/lib/language-packages-api"
import {
  agencyLanguagePackageNeedsRevision,
  agencyLanguageVideoNeedsRevision,
} from "@/lib/language-phase-gates"
import {
  getCurrentLanguageVideoAsset,
  mergeLanguageVideoIntoPackage,
  languageVideosSorted,
} from "@/lib/language-package-video-helpers"
import type {
  LanguageItemFeedbackEntry,
  LanguagePackage,
  LanguageThumbnailRecord,
  LanguageVideo,
  LanguageVideoAsset,
  LanguageVideoReview,
} from "@/types/language-package"
import {
  formatLanguageLabel,
  languageDetailShellClass,
  languageThumbBadgeClass,
  languageVideoStatusBadgeClass,
  LANGUAGE_VIDEO_STATUS_LABELS,
} from "@/lib/language-package-ui"
import { isOverallCommentsRedundantWithItemFeedback } from "@/lib/package-list-utils"
import {
  formatPackageDate,
  formatPackageFileSize,
  humanizeItemFeedbackField,
} from "@/lib/package-ui"
import { LanguageVideoPlayerWithThread } from "@/components/language-packages/language-video-player-with-thread"
import { TrackStatusCallout } from "@/components/packages/track-status-callout"
import {
  TagPillList,
  parseTagsFromCommaInput,
} from "@/components/packages/tag-pill-list"
import {
  ArrowLeft,
  ImageIcon,
  Info,
  Loader2,
  Plus,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const VIDEO_CLASS =
  "h-auto w-full max-w-full object-contain max-h-[min(85vh,40rem)]"

function thumbnailStatusSurfaceClass(s: LanguageThumbnailRecord["status"]) {
  switch (s) {
    case "APPROVED":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
    case "REJECTED":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
    default:
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
  }
}

const VIDEO_PREVIEW_SHELL =
  "overflow-hidden rounded-xl border border-border bg-black shadow-md ring-1 ring-border/60"
const VIDEO_INLINE_CLASS =
  "h-auto w-full max-w-full object-contain max-h-[min(85vh,40rem)]"

function submittedVideoShellClass() {
  return cn(VIDEO_PREVIEW_SHELL, "w-full")
}

function normalizeLanguageItemField(raw: string): PackageItemFeedbackField {
  const key = raw.trim().toLowerCase()
  switch (key) {
    case "video":
      return "VIDEO"
    case "title":
      return "TITLE"
    case "description":
      return "DESCRIPTION"
    case "tags":
      return "TAGS"
    case "thumbnail":
      return "THUMBNAIL"
    default: {
      const u = raw.trim().toUpperCase()
      if (
        u === "VIDEO" ||
        u === "TITLE" ||
        u === "DESCRIPTION" ||
        u === "TAGS" ||
        u === "THUMBNAIL"
      ) {
        return u as PackageItemFeedbackField
      }
      return "TITLE"
    }
  }
}

function mapLanguageFeedbackToPackageItems(
  items: LanguageItemFeedbackEntry[] | undefined
): PackageItemFeedbackEntry[] {
  return (items ?? []).map((i) => ({
    ...i,
    field: normalizeLanguageItemField(i.field),
  }))
}

function getLatestLanguageRejection(
  video: LanguageVideo
): LanguageVideoReview | null {
  const rejects = [...(video.reviews ?? [])]
    .filter((r) => r.decision === "REJECTED")
    .sort(
      (a, b) =>
        new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime()
    )
  return rejects[0] ?? null
}

/** Line items Brand flagged with hasIssue — gates resubmits and drives the feedback list. */
function languageValidationIssues(
  review: LanguageVideoReview | null
): PackageItemFeedbackEntry[] {
  if (!review) return []
  return mapLanguageFeedbackToPackageItems(review.itemFeedback).filter(
    (f) => f.hasIssue
  )
}

function tagsFingerprintFromArray(
  tags: string[] | null | undefined
): string {
  return [...(tags ?? [])]
    .map((t) => t.trim())
    .filter(Boolean)
    .sort()
    .join("\0")
}

function tagsFingerprintFromInput(s: string): string {
  return parseTagsFromCommaInput(s).sort().join("\0")
}

function baselineTitle(asset: LanguageVideoAsset | undefined): string {
  return asset?.title?.trim() ?? ""
}

function baselineDescription(asset: LanguageVideoAsset | undefined): string {
  return asset?.description?.trim() ?? ""
}

/** Thumbnail slots that must get a new upload before metadata resubmit. */
function requiredThumbnailReplacementIds(
  issues: PackageItemFeedbackEntry[],
  thumbs: LanguageThumbnailRecord[]
): Set<string> {
  const ids = new Set<string>()
  for (const t of thumbs) {
    if (t.status === "REJECTED") ids.add(t.id)
  }
  for (const i of issues) {
    if (i.field === "THUMBNAIL" && i.hasIssue && i.thumbnailId) {
      ids.add(i.thumbnailId)
    }
  }
  return ids
}

const FIELD_ORDER: PackageItemFeedbackField[] = [
  "TITLE",
  "DESCRIPTION",
  "TAGS",
  "VIDEO",
  "THUMBNAIL",
]

function sortLanguageFeedbackItems(
  items: PackageItemFeedbackEntry[]
): PackageItemFeedbackEntry[] {
  return [...items].sort((a, b) => {
    const ia = FIELD_ORDER.indexOf(a.field)
    const ib = FIELD_ORDER.indexOf(b.field)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
}

function nonThumbnailSectionLabel(items: PackageItemFeedbackEntry[]): string {
  if (!items.length) return ""
  if (items.every((i) => i.field === "VIDEO")) return "Video file"
  if (items.some((i) => i.field === "VIDEO")) return "Copy, tags & video"
  return "Title, description & tags"
}

function LanguageFeedbackItemRow({
  it,
  thumbOrdinal,
}: {
  it: PackageItemFeedbackEntry
  thumbOrdinal?: number
}) {
  const fieldLabel = humanizeItemFeedbackField(it.field)
  const title =
    it.field === "THUMBNAIL" && thumbOrdinal != null
      ? `${fieldLabel} ${thumbOrdinal}`
      : fieldLabel

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div
        className={cn(
          "border-l-4 border-l-destructive/60 bg-muted/25 px-4 py-4 dark:bg-muted/15",
          "sm:pl-5"
        )}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold leading-snug text-foreground">
              {title}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              This localized video
            </p>
            {it.thumbnailId ? (
              <p className="font-mono text-[10px] text-muted-foreground/90">
                ID {it.thumbnailId}
              </p>
            ) : null}
          </div>
          {it.hasIssue ? (
            <Badge
              variant="outline"
              className="w-fit shrink-0 border-destructive/40 text-xs font-normal text-destructive"
            >
              Change requested
            </Badge>
          ) : null}
        </div>
        <div className="mt-3 rounded-lg border border-border/80 bg-background px-3 py-3 text-sm leading-relaxed text-foreground shadow-inner">
          {it.comment?.trim() ? (
            <p className="whitespace-pre-wrap">{it.comment.trim()}</p>
          ) : (
            <p className="text-xs italic text-muted-foreground">
              No detailed comment for this line item.
            </p>
          )}
        </div>
      </div>
    </li>
  )
}

function LanguageItemFeedbackHumanizedList({
  items,
  className,
}: {
  items: PackageItemFeedbackEntry[]
  className?: string
}) {
  if (!items.length) return null
  const sorted = sortLanguageFeedbackItems(items)
  const copyItems = sorted.filter((i) => i.field !== "THUMBNAIL")
  const thumbItems = sorted.filter((i) => i.field === "THUMBNAIL")

  const renderSection = (
    label: string,
    sectionItems: PackageItemFeedbackEntry[],
    isThumbs: boolean
  ) => {
    if (!sectionItems.length) return null
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <ul className="space-y-4">
          {sectionItems.map((it, i) => (
            <LanguageFeedbackItemRow
              key={`${it.videoAssetId ?? "x"}-${it.field}-${it.thumbnailId ?? i}-${i}`}
              it={it}
              thumbOrdinal={isThumbs ? i + 1 : undefined}
            />
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "space-y-6 border-t border-border pt-4 text-sm",
        className
      )}
    >
      <p className="text-xs text-muted-foreground">
        Each block is one reviewer note. Fix every item before resubmitting.
      </p>
      {renderSection(nonThumbnailSectionLabel(copyItems), copyItems, false)}
      {renderSection("Thumbnails", thumbItems, true)}
    </div>
  )
}

function LanguageRejectionContextBlock({
  latestRejection,
  showOverall,
  itemFeedbackForDedup,
}: {
  latestRejection: LanguageVideoReview
  showOverall: boolean
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
        <span className="font-medium">
          {latestRejection.reviewerType ?? "Content / Brand"}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {formatPackageDate(latestRejection.reviewedAt)}
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

function LangSubmittedVideoPlayerPaneInner({
  fileUrl,
  mediaKey,
  languageVideo,
  compact,
}: {
  fileUrl: string
  mediaKey: string
  languageVideo: LanguageVideo
  compact?: boolean
}) {
  const [videoError, setVideoError] = useState(false)

  if (fileUrl && !videoError) {
    return (
      <div className={submittedVideoShellClass()}>
        <LanguageVideoPlayerWithThread
          languageVideo={languageVideo}
          fileUrl={fileUrl}
          mediaKey={mediaKey}
          videoClassName={VIDEO_INLINE_CLASS}
          onVideoError={() => setVideoError(true)}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/40 px-3 text-center",
        compact ? "min-h-36 py-6" : "min-h-48 px-4 py-10"
      )}
    >
      <p className="max-w-sm text-sm text-muted-foreground">
        {videoError
          ? "We couldn’t play this file in the browser. Open it in a new tab instead."
          : "There is no playable URL for this file yet."}
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
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [videoError, setVideoError] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- blob URL for <video>
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

  if (videoError) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/40 px-3 text-center",
          compact ? "min-h-36 py-6" : "px-4 py-8"
        )}
      >
        <p className="text-sm text-muted-foreground">
          This file can’t be previewed in the browser. It can still upload if you
          resubmit.
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
        <video
          controls
          playsInline
          preload="metadata"
          className={VIDEO_INLINE_CLASS}
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
      <p className="shrink-0 font-mono text-xs wrap-break-word text-muted-foreground">
        {file.name} · {formatPackageFileSize(file.size)}
      </p>
    </div>
  )
}

function LocalReplacementVideoPreview({
  file,
  compact,
}: {
  file: File | null
  compact?: boolean
}) {
  if (!file) {
    return (
      <div
        className={cn(
          "flex w-full items-center justify-center rounded-xl border border-dashed border-muted-foreground/25 bg-muted/30 px-2 text-center",
          compact ? "min-h-36 py-6" : "px-4 py-8"
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
      compact={compact}
    />
  )
}

function VideoReplacementUploadCell({
  videoId,
  file,
  onFileChange,
}: {
  videoId: string
  file: File | null
  onFileChange: (next: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const id = `lang-video-replace-${videoId}`

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
        Choose file
      </Button>
      {file ? (
        <p className="text-xs wrap-break-word text-muted-foreground">
          {file.name} — use Choose file to change.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Required before resubmit.</p>
      )}
    </div>
  )
}

function LocalThumbnailPreviews({ files }: { files: File[] }) {
  const [urls, setUrls] = useState<string[]>([])

  useEffect(() => {
    const next = files.map((x) => URL.createObjectURL(x))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- blob URLs for <img>
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

export default function AgencyLanguagePackageDetailPage() {
  const params = useParams()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const role = user?.role as UserRole | undefined
  const isAgency = role === "AGENCY_POC" || role === "SUPER_ADMIN"
  const isSuper = role === "SUPER_ADMIN"

  const [pkg, setPkg] = useState<LanguagePackage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rename, setRename] = useState("")
  const [savingName, setSavingName] = useState(false)

  const [addVideoFile, setAddVideoFile] = useState<File | null>(null)
  const [addThumbFiles, setAddThumbFiles] = useState<File[]>([])
  const [addTitle, setAddTitle] = useState("")
  const [addDesc, setAddDesc] = useState("")
  const [addTags, setAddTags] = useState("")
  const [addingVideo, setAddingVideo] = useState(false)

  const load = useCallback(async () => {
    if (!token || !id) return
    setLoading(true)
    setError(null)
    try {
      const res = await getLanguagePackage(token, id)
      setPkg(res.data)
      setRename(res.data.name ?? "")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [token, id])

  useEffect(() => {
    load()
  }, [load])

  const sortedVideos = useMemo(
    () => (pkg ? languageVideosSorted(pkg) : []),
    [pkg]
  )

  const packageHasVideos = (pkg?.videos?.length ?? 0) > 0

  async function savePackageName() {
    if (!token || !pkg || !rename.trim()) return
    setSavingName(true)
    try {
      const res = await updateLanguagePackageName(token, pkg.id, {
        name: rename.trim(),
      })
      setPkg(res.data)
      toast.success("Package name updated")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed")
    } finally {
      setSavingName(false)
    }
  }

  async function submitAddVideo() {
    if (!token || !pkg || !addVideoFile) {
      toast.error("Choose a video file")
      return
    }
    setAddingVideo(true)
    try {
      const vMeta = await uploadLanguagePackageVideoFile(token, addVideoFile)
      const thumbs = []
      for (const f of addThumbFiles) {
        const t = await uploadLanguagePackageThumbnailFile(token, f)
        thumbs.push({
          fileUrl: t.fileUrl,
          fileName: t.fileName,
          fileType: t.fileType,
          fileSize: t.fileSize,
        })
      }
      const tags = parseTagsFromCommaInput(addTags)
      const res = await addLanguagePackageVideo(token, pkg.id, {
        fileUrl: vMeta.fileUrl,
        fileName: vMeta.fileName,
        fileType: vMeta.fileType,
        fileSize: vMeta.fileSize,
        title: addTitle.trim() || undefined,
        description: addDesc.trim() || undefined,
        tags: tags.length ? tags : undefined,
        thumbnails: thumbs.length ? thumbs : [],
      })
      setPkg((p) =>
        p
          ? { ...p, videos: [...(p.videos ?? []), res.data] }
          : p
      )
      setAddVideoFile(null)
      setAddThumbFiles([])
      setAddTitle("")
      setAddDesc("")
      setAddTags("")
      toast.success("Video added")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add failed")
    } finally {
      setAddingVideo(false)
    }
  }

  if (!isAgency) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Agency POC or Super Admin only.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link href="/agency-poc-language-packages">
            <ArrowLeft className="size-4" />
            Language packages
          </Link>
        </Button>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : error || !pkg ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">{error ?? "Not found"}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {formatLanguageLabel(String(pkg.language))}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Updated {formatPackageDate(pkg.updatedAt)}
                  </span>
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight">
                  {pkg.name}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pkg.script?.title ?? "Script"}
                </p>
              </div>
            </div>

            {agencyLanguagePackageNeedsRevision(pkg) ? (
              <Card className="border-blue-200/60 bg-blue-50/60 shadow-none dark:border-blue-900/40 dark:bg-blue-950/25">
                <CardContent className="flex gap-4 py-5 sm:py-6">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-700 dark:text-blue-300">
                    <Info className="size-5" />
                  </div>
                  <div className="min-w-0 space-y-3 text-sm">
                    <p className="font-semibold text-foreground">
                      Fixing rejected language deliverables
                    </p>
                    <ul className="list-none space-y-2.5 text-muted-foreground">
                      <li className="flex gap-2">
                        <span
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                          aria-hidden
                        />
                        <span>
                          <span className="font-medium text-foreground">
                            Video file
                          </span>{" "}
                          — On each video card, upload a replacement in the{" "}
                          <strong className="font-medium text-foreground">
                            Video file
                          </strong>{" "}
                          section when Brand flagged the clip.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                          aria-hidden
                        />
                        <span>
                          <span className="font-medium text-foreground">
                            Metadata & thumbnails
                          </span>{" "}
                          — Below that on the same card, edit copy and upload new
                          images only for{" "}
                          <strong className="font-medium text-foreground">
                            rejected
                          </strong>{" "}
                          thumbnails; approved and pending slots keep their current
                          files.
                        </span>
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {agencyLanguagePackageNeedsRevision(pkg) ? (
              <p className="text-sm text-muted-foreground">
                Finish resubmitting rejected videos below.
              </p>
            ) : !packageHasVideos ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Rename package</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="rename">Name</Label>
                      <Input
                        id="rename"
                        value={rename}
                        onChange={(e) => setRename(e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={() => void savePackageName()}
                      disabled={savingName || !rename.trim()}
                    >
                      {savingName ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Plus className="size-4" />
                      Add another video
                    </CardTitle>
                    <CardDescription>
                      Same language package; each video is reviewed
                      independently.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Video file</Label>
                      <Input
                        type="file"
                        accept="video/*"
                        onChange={(e) =>
                          setAddVideoFile(e.target.files?.[0] ?? null)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Thumbnails (optional)</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) =>
                          setAddThumbFiles(Array.from(e.target.files ?? []))
                        }
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input
                          value={addTitle}
                          onChange={(e) => setAddTitle(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tags (comma-separated)</Label>
                        <Input
                          value={addTags}
                          onChange={(e) => setAddTags(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={addDesc}
                        onChange={(e) => setAddDesc(e.target.value)}
                        rows={2}
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={() => void submitAddVideo()}
                      disabled={addingVideo || !addVideoFile}
                      className="gap-2"
                    >
                      {addingVideo ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4" />
                      )}
                      Add video
                    </Button>
                  </CardContent>
                </Card>
              </>
            ) : null}

            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Videos</h2>
              {sortedVideos.map((v) => (
                <AgencyLanguageVideoCard
                  key={v.id}
                  video={v}
                  token={token}
                  isSuper={isSuper}
                  onUpdated={(nv) =>
                    setPkg((p) => (p ? mergeLanguageVideoIntoPackage(p, nv) : p))
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AgencyLanguageVideoCard({
  video,
  token,
  isSuper,
  onUpdated,
}: {
  video: LanguageVideo
  token: string
  isSuper: boolean
  onUpdated: (v: LanguageVideo) => void
}) {
  const asset = getCurrentLanguageVideoAsset(video)
  const needsRev =
    video.status === "BRAND_REVIEW" && agencyLanguageVideoNeedsRevision(video)
  const canResubmit = video.status === "BRAND_REVIEW" && needsRev

  const latestReject = useMemo(
    () => getLatestLanguageRejection(video),
    [video]
  )
  const validationIssues = useMemo(
    () => languageValidationIssues(latestReject),
    [latestReject]
  )
  const hasStructuredIssues = validationIssues.length > 0

  const needsVideoResubmit = useMemo(
    () => hasStructuredIssues && validationIssues.some((i) => i.field === "VIDEO"),
    [hasStructuredIssues, validationIssues]
  )

  const [replaceFile, setReplaceFile] = useState<File | null>(null)
  const [resV, setResV] = useState(false)
  const [metaTitle, setMetaTitle] = useState(asset?.title ?? "")
  const [metaDesc, setMetaDesc] = useState(asset?.description ?? "")
  const [metaTags, setMetaTags] = useState((asset?.tags ?? []).join(", "))
  const [replacementThumbFiles, setReplacementThumbFiles] = useState<
    Record<string, File | null>
  >({})
  const [resM, setResM] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

  const thumbs = asset?.thumbnails ?? []

  const needsMetadataResubmit = useMemo(() => {
    if (!hasStructuredIssues) return true
    if (validationIssues.some((i) => i.field !== "VIDEO")) return true
    return thumbs.some((t) => t.status === "REJECTED")
  }, [hasStructuredIssues, validationIssues, thumbs])

  const requiredThumbIds = useMemo(
    () => requiredThumbnailReplacementIds(validationIssues, thumbs),
    [validationIssues, thumbs]
  )

  const titleFixRequired = validationIssues.some(
    (i) => i.field === "TITLE" && i.hasIssue
  )
  const descriptionFixRequired = validationIssues.some(
    (i) => i.field === "DESCRIPTION" && i.hasIssue
  )
  const tagsFixRequired = validationIssues.some(
    (i) => i.field === "TAGS" && i.hasIssue
  )

  const titleChanged = metaTitle.trim() !== baselineTitle(asset)
  const descriptionChanged = metaDesc.trim() !== baselineDescription(asset)
  const tagsChanged =
    tagsFingerprintFromInput(metaTags) !==
    tagsFingerprintFromArray(asset?.tags ?? [])

  const titleFixOk = !titleFixRequired || titleChanged
  const descriptionFixOk = !descriptionFixRequired || descriptionChanged
  const tagsFixOk = !tagsFixRequired || tagsChanged

  const thumbsFixOk = useMemo(() => {
    if (requiredThumbIds.size === 0) return true
    for (const id of requiredThumbIds) {
      if (!replacementThumbFiles[id]) return false
    }
    return true
  }, [requiredThumbIds, replacementThumbFiles])

  const metadataResubmitReady = useMemo(() => {
    if (!needsMetadataResubmit) return false
    if (!metaTitle.trim() || !metaDesc.trim()) return false
    if (!titleFixOk || !descriptionFixOk || !tagsFixOk) return false
    if (!thumbsFixOk) return false
    return true
  }, [
    needsMetadataResubmit,
    metaTitle,
    metaDesc,
    titleFixOk,
    descriptionFixOk,
    tagsFixOk,
    thumbsFixOk,
  ])

  const videoResubmitReady = !needsVideoResubmit || replaceFile != null

  useEffect(() => {
    setMetaTitle(asset?.title ?? "")
    setMetaDesc(asset?.description ?? "")
    setMetaTags((asset?.tags ?? []).join(", "))
    setReplacementThumbFiles({})
    setReplaceFile(null)
  }, [
    video.id,
    video.currentVersion,
    asset?.id,
    asset?.title,
    asset?.description,
    asset?.tags,
  ])

  async function resubmitVideo() {
    if (!needsVideoResubmit) {
      toast.error(
        "Brand did not flag the video file in this rejection. Use metadata resubmit below if copy or thumbnails were flagged."
      )
      return
    }
    if (!replaceFile) {
      toast.error("Choose a replacement video file to address the video feedback.")
      return
    }
    setResV(true)
    try {
      const m = await uploadLanguagePackageVideoFile(token, replaceFile)
      const res = await resubmitLanguageVideoFile(token, video.id, {
        fileUrl: m.fileUrl,
        fileName: m.fileName,
        fileType: m.fileType,
        fileSize: m.fileSize,
      })
      onUpdated(res.data)
      setReplaceFile(null)
      toast.success(res.message ?? "Video file resubmitted for review")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setResV(false)
    }
  }

  async function resubmitMeta() {
    if (!needsMetadataResubmit) {
      toast.error(
        "Metadata resubmit is not needed for this rejection — Brand only flagged the video. Use “Resubmit video file” above."
      )
      return
    }
    if (!metadataResubmitReady) {
      const missing: string[] = []
      if (!metaTitle.trim() || !metaDesc.trim()) {
        missing.push("enter title and description")
      } else {
        if (!titleFixOk) missing.push("edit the title (Brand flagged it)")
        if (!descriptionFixOk)
          missing.push("edit the description (Brand flagged it)")
        if (!tagsFixOk) missing.push("edit tags (Brand flagged them)")
        if (!thumbsFixOk)
          missing.push(
            "upload a new image for each thumbnail slot Brand rejected or that shows Rejected"
          )
      }
      toast.error(
        missing.length
          ? `Before resubmitting metadata: ${missing.join("; ")}.`
          : "Fix the items above before resubmitting metadata."
      )
      return
    }
    setResM(true)
    try {
      const tags = parseTagsFromCommaInput(metaTags)

      let thumbnailsPayload:
        | {
            fileUrl: string
            fileName: string
            fileType?: string
            fileSize?: number
          }[]
        | undefined

      if (thumbs.length > 0) {
        thumbnailsPayload = []
        for (const t of thumbs) {
          if (requiredThumbIds.has(t.id)) {
            const f = replacementThumbFiles[t.id]!
            const m = await uploadLanguagePackageThumbnailFile(token, f)
            thumbnailsPayload.push({
              fileUrl: m.fileUrl,
              fileName: m.fileName,
              fileType: m.fileType,
              fileSize: m.fileSize,
            })
          } else {
            thumbnailsPayload.push({
              fileUrl: t.fileUrl,
              fileName: t.fileName || "thumbnail",
              fileType: t.fileType ?? undefined,
              fileSize:
                t.fileSize != null ? Number(t.fileSize) : undefined,
            })
          }
        }
      }

      const res = await resubmitLanguageMetadata(token, video.id, {
        title: metaTitle.trim(),
        description: metaDesc.trim(),
        tags: tags.length ? tags : undefined,
        thumbnails: thumbnailsPayload,
      })
      onUpdated(res.data)
      setReplacementThumbFiles({})
      toast.success(res.message ?? "Metadata resubmitted for review")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setResM(false)
    }
  }

  async function withdraw() {
    if (!confirm("Withdraw this language video? This cannot be undone.")) return
    setWithdrawing(true)
    try {
      const res = await withdrawLanguageVideo(token, video.id)
      onUpdated(res.data)
      toast.success("Video withdrawn")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setWithdrawing(false)
    }
  }

  const rejects = [...(video.reviews ?? [])]
    .filter((r) => r.decision === "REJECTED")
    .sort(
      (a, b) =>
        new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime()
    )

  return (
    <Card className={cn(canResubmit && "overflow-hidden shadow-sm")}>
      <CardHeader
        className={cn(
          "flex flex-row flex-wrap items-start justify-between gap-2",
          canResubmit && "border-b border-border bg-muted/25 pb-4"
        )}
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                languageVideoStatusBadgeClass(video.status)
              )}
            >
              {LANGUAGE_VIDEO_STATUS_LABELS[video.status]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              v{video.currentVersion}
            </span>
          </div>
          <CardTitle className="mt-2 text-base">
            {asset?.title?.trim() || asset?.fileName || "Video"}
          </CardTitle>
        </div>
        {isSuper && video.status !== "WITHDRAWN" ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={withdrawing}
            onClick={() => void withdraw()}
          >
            {withdrawing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Withdraw"
            )}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent
        className={cn(
          "p-4 sm:p-6",
          canResubmit ? "space-y-6" : "space-y-4"
        )}
      >
        {!canResubmit ? (
          <>
            {asset?.fileUrl ? (
              <div className={languageDetailShellClass()}>
                <LanguageVideoPlayerWithThread
                  languageVideo={video}
                  fileUrl={asset.fileUrl}
                  mediaKey={asset.id}
                  videoClassName={VIDEO_CLASS}
                />
              </div>
            ) : null}

            {asset ? (
              <div className="text-sm text-muted-foreground">
                <p>{asset.fileName}</p>
                {asset.fileSize != null ? (
                  <p>{formatPackageFileSize(Number(asset.fileSize))}</p>
                ) : null}
              </div>
            ) : null}

            {asset?.description ? (
              <p className="text-sm">{asset.description}</p>
            ) : null}

            {(asset?.tags?.length ?? 0) > 0 ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Tags
                </p>
                <TagPillList tags={asset?.tags} />
              </div>
            ) : null}

            {thumbs.length > 0 ? (
              <div>
                <p className="mb-2 flex items-center gap-1 text-sm font-medium">
                  <ImageIcon className="size-4" />
                  Thumbnails
                </p>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {thumbs.map((t) => (
                    <li
                      key={t.id}
                      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm text-xs"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={t.fileUrl}
                        alt=""
                        className="aspect-video w-full object-cover"
                      />
                      <div className="space-y-1.5 p-3">
                        <Badge
                          variant="secondary"
                          className={thumbnailStatusSurfaceClass(t.status)}
                        >
                          {t.status}
                        </Badge>
                        <p className="truncate text-muted-foreground">
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
              </div>
            ) : null}

            {rejects[0]?.overallComments ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">Latest feedback</p>
                <p className="mt-1 whitespace-pre-wrap">
                  {rejects[0].overallComments}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <TrackStatusCallout
              status="REJECTED"
              title="Content / Brand — revision"
              badgeLabel="Resubmit needed"
              headerDescription="Each resubmit button stays disabled until every line item Brand flagged in the checklist below is addressed."
            >
              <p>
                Use <strong>Resubmit video file</strong> only when Brand marked the
                video in their checklist. Use <strong>Resubmit metadata</strong> when
                they flagged title, description, tags, or thumbnails — edit those
                fields from the current version and upload new images only where
                required.
              </p>
            </TrackStatusCallout>

            {latestReject ? (
              <Card className="border-destructive/40 bg-destructive/5 shadow-none">
                <CardHeader className="space-y-1 pb-3">
                  <CardTitle className="text-lg font-semibold text-destructive">
                    Reviewer feedback
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 border-t border-border/60 pt-4">
                  <LanguageRejectionContextBlock
                    latestRejection={latestReject}
                    showOverall={Boolean(
                      latestReject.overallComments?.trim()
                    )}
                    itemFeedbackForDedup={validationIssues}
                  />
                  {validationIssues.length > 0 ? (
                    <LanguageItemFeedbackHumanizedList
                      items={validationIssues}
                      className="border-t-0 pt-0"
                    />
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            <div className="space-y-10">
              <section className="space-y-4" aria-labelledby={`lang-video-file-${video.id}`}>
                <div>
                  <h3
                    id={`lang-video-file-${video.id}`}
                    className="text-base font-semibold tracking-tight text-foreground"
                  >
                    Video file
                  </h3>
                  {needsVideoResubmit ? (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Brand flagged the video file. Upload a new file below; the
                      button enables only after you choose one.
                    </p>
                  ) : (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Brand did not flag the video file in this rejection. You do
                      not need to replace the clip — use metadata resubmit if copy
                      or thumbnails were flagged.
                    </p>
                  )}
                </div>
                {needsVideoResubmit && !videoResubmitReady ? (
                  <ul className="list-inside list-disc text-sm text-amber-900 dark:text-amber-200">
                    <li>Choose a replacement video file.</li>
                  </ul>
                ) : null}
                {asset?.fileUrl ? (
                  <div
                    className={cn(
                      "grid grid-cols-1 gap-4 sm:grid-cols-2",
                      !needsVideoResubmit && "sm:grid-cols-1"
                    )}
                  >
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Current file
                      </p>
                      <LangSubmittedVideoPlayerPaneInner
                        fileUrl={asset.fileUrl}
                        mediaKey={asset.id}
                        languageVideo={video}
                        compact
                      />
                      <p className="font-mono text-xs wrap-break-word text-muted-foreground">
                        {asset.fileName}
                        {asset.fileSize != null
                          ? ` · ${formatPackageFileSize(Number(asset.fileSize))}`
                          : ""}
                      </p>
                    </div>
                    {needsVideoResubmit ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                          Replacement
                        </p>
                        <LocalReplacementVideoPreview
                          compact
                          file={replaceFile}
                        />
                        <VideoReplacementUploadCell
                          videoId={video.id}
                          file={replaceFile}
                          onFileChange={setReplaceFile}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No current file URL — contact support if this persists.
                  </p>
                )}
                <Button
                  type="button"
                  onClick={() => void resubmitVideo()}
                  disabled={resV || !videoResubmitReady}
                >
                  {resV ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 size-4" />
                  )}
                  Resubmit video file
                </Button>
              </section>

              <section
                className="space-y-6 border-t border-border pt-10"
                aria-labelledby={`lang-metadata-${video.id}`}
              >
                <div>
                  <h3
                    id={`lang-metadata-${video.id}`}
                    className="text-base font-semibold tracking-tight text-foreground"
                  >
                    Metadata & thumbnails
                  </h3>
                  {needsMetadataResubmit ? (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Edit every field Brand flagged in the checklist (compare to
                      the current version). Upload a new image for each thumbnail
                      slot listed below as requiring a replacement.
                    </p>
                  ) : (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Not needed for this rejection — Brand only flagged the video
                      file. Resubmit the video above; metadata stays as-is until
                      you change it in a later round.
                    </p>
                  )}
                </div>

                {needsMetadataResubmit && !metadataResubmitReady ? (
                  <ul className="list-inside list-disc space-y-1 text-sm text-amber-900 dark:text-amber-200">
                    {!metaTitle.trim() || !metaDesc.trim() ? (
                      <li>Enter title and description.</li>
                    ) : null}
                    {metaTitle.trim() && metaDesc.trim() ? (
                      <>
                        {titleFixRequired && !titleChanged ? (
                          <li>Update the title — Brand flagged it.</li>
                        ) : null}
                        {descriptionFixRequired && !descriptionChanged ? (
                          <li>Update the description — Brand flagged it.</li>
                        ) : null}
                        {tagsFixRequired && !tagsChanged ? (
                          <li>Update tags — Brand flagged them.</li>
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

                {needsMetadataResubmit ? (
                  <>
                <section className="space-y-4 rounded-lg border border-border bg-background/80 p-4 shadow-sm dark:bg-background/40">
                  <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Title & description
                  </h4>
                  <div className="space-y-2">
                    <Label htmlFor={`lang-mt-title-${video.id}`}>Title</Label>
                    <Input
                      id={`lang-mt-title-${video.id}`}
                      value={metaTitle}
                      onChange={(e) => setMetaTitle(e.target.value)}
                      className={cn(
                        titleFixRequired && !titleChanged && "border-destructive"
                      )}
                      aria-invalid={titleFixRequired && !titleChanged}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`lang-mt-desc-${video.id}`}>
                      Description
                    </Label>
                    <Textarea
                      id={`lang-mt-desc-${video.id}`}
                      rows={5}
                      value={metaDesc}
                      onChange={(e) => setMetaDesc(e.target.value)}
                      className={cn(
                        "min-h-[120px] resize-y text-sm leading-relaxed",
                        descriptionFixRequired &&
                          !descriptionChanged &&
                          "border-destructive"
                      )}
                      aria-invalid={
                        descriptionFixRequired && !descriptionChanged
                      }
                    />
                  </div>
                </section>

                <section className="space-y-4 rounded-lg border border-border bg-background/80 p-4 shadow-sm dark:bg-background/40">
                  <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Tags
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Separate with commas. Empty segments are ignored.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor={`lang-mt-tags-${video.id}`}>Tag list</Label>
                    <Input
                      id={`lang-mt-tags-${video.id}`}
                      placeholder="e.g. cardiology, awareness, campaign"
                      value={metaTags}
                      onChange={(e) => setMetaTags(e.target.value)}
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
                        tags={parseTagsFromCommaInput(metaTags)}
                        emptyLabel={
                          <span className="text-xs text-muted-foreground">
                            No tags parsed yet — separate with commas.
                          </span>
                        }
                      />
                    </div>
                  </div>
                </section>

                {thumbs.length > 0 ? (
                  <section className="space-y-4 rounded-lg border border-border bg-background/80 p-4 shadow-sm dark:bg-background/40">
                    <h4 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      <ImageIcon className="size-4 shrink-0" aria-hidden />
                      Thumbnails (same order as current version)
                    </h4>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {requiredThumbIds.size > 0 ? (
                        <>
                          <span className="font-medium text-foreground">
                            {requiredThumbIds.size} thumbnail slot
                            {requiredThumbIds.size === 1 ? "" : "s"}
                          </span>{" "}
                          need a new upload before metadata resubmit (rejected
                          slots and any thumbnail Brand called out in the
                          checklist). Others keep their current file.
                        </>
                      ) : (
                        <>
                          No thumbnail re-upload required — current images are
                          sent back with your updated copy.
                        </>
                      )}
                    </p>
                    <ul className="space-y-4">
                      {thumbs.map((t, idx) => {
                        const needsFile = requiredThumbIds.has(t.id)
                        const file = replacementThumbFiles[t.id] ?? null
                        const previewKey = file
                          ? `${file.name}-${file.size}-${file.lastModified}`
                          : ""
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
                                    className={thumbnailStatusSurfaceClass(
                                      t.status
                                    )}
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
                                    <Label
                                      htmlFor={`lang-mt-repl-${video.id}-${t.id}`}
                                    >
                                      Replacement image (required)
                                    </Label>
                                    <Input
                                      id={`lang-mt-repl-${video.id}-${t.id}`}
                                      type="file"
                                      accept="image/*"
                                      className={cn(
                                        "cursor-pointer bg-background",
                                        !file
                                          ? "border-destructive"
                                          : "border-border"
                                      )}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0] ?? null
                                        setReplacementThumbFiles((prev) => ({
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
                                    Approved — this file is reused; no upload
                                    needed.
                                  </p>
                                ) : (
                                  <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                                    Pending review — current file is kept; no
                                    upload required unless Brand rejected this
                                    slot.
                                  </p>
                                )}
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ) : null}

                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={() => void resubmitMeta()}
                  disabled={resM || !metadataResubmitReady}
                >
                  {resM ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 size-4" />
                  )}
                  Resubmit metadata for review
                </Button>
                  </>
                ) : null}
              </section>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
