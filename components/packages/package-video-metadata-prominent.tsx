import { Hash } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function PackageVideoMetadataProminent({
  deliverableLabel,
  title,
  description,
  tags,
  className,
  variant = "card",
}: {
  deliverableLabel: string
  title: string | null | undefined
  description: string | null | undefined
  tags: string[] | null | undefined
  className?: string
  /** `embedded` sits inside a parent Card — avoids double borders. */
  variant?: "card" | "embedded"
}) {
  const tagList = tags?.filter((t) => t.trim() !== "") ?? []

  const titleBlock = (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        Deliverable · {deliverableLabel}
      </p>
      <p className="text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">
        {title?.trim() || "Untitled"}
      </p>
    </div>
  )

  const metaBlock = (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground">Description</p>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground sm:text-base">
          {description?.trim() ? description : "—"}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">Tags</p>
        {tagList.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {tagList.map((t) => (
              <Badge
                key={t}
                variant="secondary"
                className="px-2.5 py-0.5 text-xs font-medium sm:text-sm"
              >
                <Hash className="mr-1 size-3.5 opacity-70" aria-hidden />
                {t}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-muted-foreground">—</p>
        )}
      </div>
    </div>
  )

  if (variant === "embedded") {
    return (
      <div
        className={cn(
          "rounded-lg border border-border bg-muted/30 px-4 py-4 sm:px-5 sm:py-5",
          className
        )}
      >
        <div className="space-y-4">
          {titleBlock}
          {metaBlock}
        </div>
      </div>
    )
  }

  return (
    <Card className={cn("overflow-hidden border-border bg-card shadow-sm", className)}>
      <CardHeader className="border-b border-border bg-muted/20 space-y-2 py-4 sm:py-5">
        {titleBlock}
      </CardHeader>
      <CardContent className="space-y-4 pt-5 sm:pt-6">{metaBlock}</CardContent>
    </Card>
  )
}
