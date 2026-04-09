import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { TagPillList } from "@/components/packages/tag-pill-list"
import { cn } from "@/lib/utils"

export function PackageVideoMetadataProminent({
  deliverableLabel,
  title,
  description,
  tags,
  doctorName,
  specialtyLabel,
  className,
  variant = "card",
}: {
  deliverableLabel: string
  title: string | null | undefined
  description: string | null | undefined
  tags: string[] | null | undefined
  /** Optional — doctor display name on the deliverable. */
  doctorName?: string | null
  /** Precomputed label for specialty (e.g. from GET /api/packages/specialties). */
  specialtyLabel?: string | null
  className?: string
  /** `embedded` sits inside a parent Card — avoids double borders. */
  variant?: "card" | "embedded"
}) {
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

  const doctorLine = doctorName?.trim()
  const specLine = specialtyLabel?.trim()

  const metaBlock = (
    <div className="space-y-3">
      {doctorLine || specLine ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {doctorLine ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Doctor</p>
              <p className="mt-1.5 text-sm text-foreground sm:text-base">
                {doctorLine}
              </p>
            </div>
          ) : null}
          {specLine ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Specialty
              </p>
              <p className="mt-1.5 text-sm text-foreground sm:text-base">
                {specLine}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      <div>
        <p className="text-xs font-medium text-muted-foreground">Description</p>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground sm:text-base">
          {description?.trim() ? description : "—"}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">Tags</p>
        <div className="mt-2">
          <TagPillList tags={tags} />
        </div>
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
