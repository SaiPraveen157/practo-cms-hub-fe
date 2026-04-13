"use client"

import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TagPillList } from "@/components/packages/tag-pill-list"
import { Label } from "@/components/ui/label"
import type { PackageAsset, PackageSpecialtyOption } from "@/types/package"
import { labelForSpecialtyValue } from "@/lib/package-specialty-label"
import { parseAgencyDeliverableBlockBody } from "@/lib/package-composed-description"
import { formatPackageFileSize, thumbnailsForVideo } from "@/lib/package-ui"
import VideoPlayerTimeline from "@/components/VideoPlayerTimeline"
import { usePackageVideoThreadComments } from "@/hooks/use-package-video-thread-comments"
import { addPackageVideoComment } from "@/lib/packages-api"
import { canPostPackageVideoThreadComment } from "@/lib/package-video-thread-comment-permissions"
import { useAuthStore } from "@/store"
import type { UserRole } from "@/types/auth"
import type { PackageVideo } from "@/types/package"
import { ExternalLink } from "lucide-react"

export function PackageInlineVideoCard({
  asset,
  label,
  icon,
  deliverableAgencyCopy,
  /** Raw body from composed description block — used with `unifiedMetadata` to fill title/description/tags when API omits asset fields. */
  deliverableBlockBody,
  /** One card: metadata + thumbnails + player (e.g. Content Approver). Default keeps video first, then agency copy. */
  unifiedMetadata = false,
  /** Player only — no header, metadata, thumbnails, or agency copy (e.g. Content Brand videos tab). */
  videoOnly = false,
  /** When set, loads `/api/packages/videos/:id/comments` for this deliverable and shows timeline UI. */
  packageVideo = null,
  /** Called after a timestamp comment is posted (e.g. refresh approve-block state on the parent page). */
  onPackageVideoCommentsUpdated = null,
  /** Accepted for API compatibility; unified thumbnails are plain images (no selection UI). */
  selectedThumbnailId: _selectedThumbnailId,
  /** Map `asset.specialty` enum to label (from GET /api/packages/specialties). */
  specialtyOptions = [],
}: {
  asset: PackageAsset
  label: string
  icon: ReactNode
  deliverableAgencyCopy?: string | null
  deliverableBlockBody?: string | null
  unifiedMetadata?: boolean
  videoOnly?: boolean
  packageVideo?: PackageVideo | null
  onPackageVideoCommentsUpdated?: (() => void) | null
  selectedThumbnailId?: string | null
  specialtyOptions?: PackageSpecialtyOption[]
}) {
  void _selectedThumbnailId
  const [videoError, setVideoError] = useState(false)
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const role = user?.role as UserRole | undefined
  const threadVideoId = packageVideo?.id ?? null
  const { comments, refresh } = usePackageVideoThreadComments(
    threadVideoId,
    packageVideo?.currentVersion
  )
  const showThread = Boolean(threadVideoId)
  const allowCommentPost =
    packageVideo != null && canPostPackageVideoThreadComment(role, packageVideo)

  const videoBlock = (
    <>
      {asset.fileUrl && !videoError ? (
        <div className="overflow-hidden rounded-xl border border-border bg-black shadow-inner">
          <VideoPlayerTimeline
            src={asset.fileUrl}
            mediaKey={asset.id}
            showCommentsUi={showThread}
            comments={showThread ? comments : undefined}
            commentFormDisabled={showThread && !allowCommentPost}
            videoClassName="max-h-[min(80vh,40rem)] w-full object-contain"
            onVideoError={() => setVideoError(true)}
            onAddComment={
              showThread
                ? async ({ content, timestampSeconds }) => {
                    if (!token || !threadVideoId || !packageVideo) return
                    await addPackageVideoComment(token, threadVideoId, {
                      content,
                      timestampSeconds,
                      assetVersion: packageVideo.currentVersion,
                    })
                    await refresh()
                    onPackageVideoCommentsUpdated?.()
                    toast.success("Comment added")
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {videoError
              ? "Inline preview failed. Open in a new tab instead."
              : "No video URL on this asset."}
          </p>
          {asset.fileUrl ? (
            <Button variant="outline" size="sm" asChild>
              <a href={asset.fileUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 size-4" />
                Open video
              </a>
            </Button>
          ) : null}
        </div>
      )}
    </>
  )

  if (videoOnly) {
    const displayTitle = asset.title?.trim() || label
    return (
      <Card className="overflow-hidden border-0 shadow-md ring-1 ring-border/70">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg leading-snug font-semibold tracking-tight text-foreground sm:text-xl">
                {displayTitle}
              </h3>
            </div>
          </div>
          {videoBlock}
        </CardContent>
      </Card>
    )
  }

  const size = formatPackageFileSize(asset.fileSize ?? undefined)
  const parsed =
    deliverableBlockBody != null && deliverableBlockBody.trim()
      ? parseAgencyDeliverableBlockBody(deliverableBlockBody)
      : { title: "", description: "", tags: [] as string[] }
  const metaTitle = asset.title?.trim() || parsed.title.trim() || null
  const metaDescription =
    asset.description?.trim() || parsed.description.trim() || null
  const metaTags =
    asset.tags && asset.tags.length > 0 ? asset.tags : parsed.tags
  const nestedThumbs = thumbnailsForVideo(asset)
  const doctorLine = asset.doctorName?.trim()
  const specialtyLine = labelForSpecialtyValue(
    asset.specialty ?? undefined,
    specialtyOptions
  )

  const metadataBlock = (
    <div className="flex h-full min-h-0 flex-col space-y-5 rounded-xl border border-border bg-muted/20 p-4 sm:p-6">
      <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Video Metadata
      </p>
      {doctorLine || specialtyLine ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {doctorLine ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Doctor
              </Label>
              <p className="text-base leading-snug text-foreground">
                {doctorLine}
              </p>
            </div>
          ) : null}
          {specialtyLine ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Specialty
              </Label>
              <p className="text-base leading-snug text-foreground">
                {specialtyLine}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      {metaTitle ? (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Title
          </Label>
          <p className="text-xl leading-snug font-semibold text-foreground sm:text-2xl">
            {metaTitle}
          </p>
        </div>
      ) : null}
      {metaDescription ? (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Description
          </Label>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border/80 bg-background/80 p-4 text-base leading-relaxed whitespace-pre-wrap text-foreground">
            {metaDescription}
          </div>
        </div>
      ) : null}
      {metaTags.length > 0 ? (
        <div className="space-y-2.5">
          <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Tags
          </Label>
          <TagPillList tags={metaTags} />
        </div>
      ) : null}
      {!metaTitle &&
      !metaDescription &&
      metaTags.length === 0 &&
      !doctorLine &&
      !specialtyLine ? (
        <p className="text-base text-muted-foreground">
          No title, description, or tags on this asset or deliverable block.
        </p>
      ) : null}
    </div>
  )

  /** Right column: same shell as metadata so headings and edges align. */
  const thumbsColumnInner =
    nestedThumbs.length > 0 ? (
      <div className="flex h-full min-h-0 flex-col space-y-4 rounded-xl border border-border bg-muted/20 p-4 sm:p-6">
        <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Thumbnail
        </p>
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {nestedThumbs.map((t) => (
            <div key={t.id} className="overflow-hidden rounded-lg bg-muted/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.fileUrl}
                alt=""
                className="aspect-video w-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div className="flex h-full min-h-0 flex-col space-y-4 rounded-xl border border-border bg-muted/20 p-4 sm:p-6">
        <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Thumbnail
        </p>
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 p-6 text-base text-muted-foreground">
          No thumbnails on this deliverable.
        </div>
      </div>
    )

  const agencyCopyBlock =
    deliverableAgencyCopy && !unifiedMetadata ? (
      <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
        <Label className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Agency copy (this video only)
        </Label>
        <div className="max-h-64 overflow-y-auto text-base leading-relaxed whitespace-pre-wrap text-foreground">
          {deliverableAgencyCopy}
        </div>
      </div>
    ) : null

  return (
    <Card className="overflow-hidden border-0 shadow-md ring-1 ring-border/70">
      <CardHeader className="border-b border-border bg-muted/30 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {icon}
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg leading-snug sm:text-xl">
                {label}
              </CardTitle>
              <CardDescription className="font-mono text-sm break-all">
                {asset.fileName}
                {size ? ` · ${size}` : ""}
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0 uppercase">
            {asset.type.replace("_", " ")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-4 sm:p-6">
        {unifiedMetadata ? (
          <>
            <div className="w-full">{videoBlock}</div>
            <div className="grid gap-6 md:grid-cols-2 md:items-stretch">
              <div className="min-h-0 min-w-0">{metadataBlock}</div>
              <div className="min-h-0 min-w-0">{thumbsColumnInner}</div>
            </div>
          </>
        ) : (
          <>
            {videoBlock}
            {agencyCopyBlock}
          </>
        )}
      </CardContent>
    </Card>
  )
}
