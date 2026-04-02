"use client"

import { useState, type ReactNode } from "react"
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
import type { PackageAsset } from "@/types/package"
import { parseAgencyDeliverableBlockBody } from "@/lib/package-composed-description"
import { formatPackageFileSize, thumbnailsForVideo } from "@/lib/package-ui"
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
  /** Accepted for API compatibility; unified thumbnails are plain images (no selection UI). */
  selectedThumbnailId: _selectedThumbnailId,
}: {
  asset: PackageAsset
  label: string
  icon: ReactNode
  deliverableAgencyCopy?: string | null
  deliverableBlockBody?: string | null
  unifiedMetadata?: boolean
  videoOnly?: boolean
  selectedThumbnailId?: string | null
}) {
  void _selectedThumbnailId
  const [videoError, setVideoError] = useState(false)

  const videoBlock = (
    <>
      {asset.fileUrl && !videoError ? (
        <div className="overflow-hidden rounded-xl border border-border bg-black shadow-inner">
          <video
            key={asset.fileUrl}
            src={asset.fileUrl}
            controls
            playsInline
            preload="metadata"
            className="max-h-[min(80vh,40rem)] w-full object-contain"
            onError={() => setVideoError(true)}
          >
            Your browser cannot play this video inline.
          </video>
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
              <a
                href={asset.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
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
              <h3 className="text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">
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

  const metadataBlock = (
    <div className="flex h-full min-h-0 flex-col space-y-5 rounded-xl border border-border bg-muted/20 p-4 sm:p-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Video Metadata
      </p>
      {metaTitle ? (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Title
          </Label>
          <p className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">
            {metaTitle}
          </p>
        </div>
      ) : null}
      {metaDescription ? (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Description
          </Label>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border/80 bg-background/80 p-4 text-base leading-relaxed whitespace-pre-wrap text-foreground">
            {metaDescription}
          </div>
        </div>
      ) : null}
      {metaTags.length > 0 ? (
        <div className="space-y-2.5">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tags
          </Label>
          <TagPillList tags={metaTags} />
        </div>
      ) : null}
      {!metaTitle && !metaDescription && metaTags.length === 0 ? (
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
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Thumbnail
        </p>
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {nestedThumbs.map((t) => (
            <div
              key={t.id}
              className="overflow-hidden rounded-lg bg-muted/30"
            >
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
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
        <Label className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Agency copy (this video only)
        </Label>
        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-base leading-relaxed text-foreground">
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
              <CardDescription className="break-all font-mono text-sm">
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
