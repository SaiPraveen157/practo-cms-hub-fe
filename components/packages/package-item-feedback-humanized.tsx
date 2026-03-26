"use client"

import { Badge } from "@/components/ui/badge"
import type { FinalPackage, PackageItemFeedbackEntry } from "@/types/package"
import {
  humanizeItemFeedbackField,
  packageVideoAssetLabel,
} from "@/lib/package-ui"
import { cn } from "@/lib/utils"

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
  return (
    <ul
      className={cn(
        "space-y-3 border-t border-border pt-4 text-sm",
        className
      )}
    >
      {items.map((it, i) => {
        const deliverable = packageVideoAssetLabel(pkg, it.videoAssetId)
        const fieldLabel = humanizeItemFeedbackField(it.field)
        return (
          <li
            key={`${it.videoAssetId}-${it.field}-${i}`}
            className="rounded-lg border border-border bg-muted/40 px-4 py-3 dark:bg-muted/20"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-normal">
                {fieldLabel}
              </Badge>
              <span className="text-xs text-muted-foreground">{deliverable}</span>
            </div>
            {it.comment?.trim() ? (
              <p className="mt-2 text-foreground leading-relaxed">
                {it.comment.trim()}
              </p>
            ) : (
              <p className="mt-2 text-xs italic text-muted-foreground">
                No detailed comment for this line item.
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
