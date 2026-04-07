"use client"

import { Badge } from "@/components/ui/badge"
import type {
  FinalPackage,
  PackageItemFeedbackEntry,
  PackageItemFeedbackField,
} from "@/types/package"
import { packageItemFeedbackDeliverableLabel } from "@/lib/package-video-helpers"
import { humanizeItemFeedbackField } from "@/lib/package-ui"
import { cn } from "@/lib/utils"

const FIELD_ORDER: PackageItemFeedbackField[] = [
  "TITLE",
  "DESCRIPTION",
  "TAGS",
  "VIDEO",
  "THUMBNAIL",
]

function sortFeedbackItems(
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

function FeedbackItemRow({
  pkg,
  it,
  thumbOrdinal,
}: {
  pkg: FinalPackage
  it: PackageItemFeedbackEntry
  thumbOrdinal?: number
}) {
  const deliverable = packageItemFeedbackDeliverableLabel(pkg, it)
  const fieldLabel = humanizeItemFeedbackField(it.field)
  const title =
    it.field === "THUMBNAIL" && thumbOrdinal != null
      ? `${fieldLabel} ${thumbOrdinal}`
      : fieldLabel

  return (
    <li
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
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
              {deliverable}
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

export function PackageItemFeedbackHumanizedList({
  pkg,
  items,
  className,
}: {
  pkg: FinalPackage
  items: PackageItemFeedbackEntry[]
  className?: string
}) {
  if (!items.length) return null

  const sorted = sortFeedbackItems(items)
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
            <FeedbackItemRow
              key={`${it.videoAssetId ?? "x"}-${it.field}-${it.thumbnailId ?? i}-${i}`}
              pkg={pkg}
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
