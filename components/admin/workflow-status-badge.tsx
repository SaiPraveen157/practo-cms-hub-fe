import { cn } from "@/lib/utils"

/** Maps workflow status strings to badge styles (admin content list + guide). */
const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  CONTENT_BRAND_REVIEW:
    "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100",
  AGENCY_PRODUCTION:
    "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-100",
  MEDICAL_REVIEW:
    "bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-100",
  CONTENT_BRAND_APPROVAL:
    "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100",
  CONTENT_APPROVER_REVIEW:
    "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-100",
  LOCKED:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100",
  APPROVED:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100",
  AGENCY_UPLOAD_PENDING:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  BRAND_VIDEO_REVIEW:
    "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100",
  AWAITING_APPROVER:
    "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-100",
  WITHDRAWN: "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-100",
  BRAND_REVIEW:
    "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100",
}

const DEFAULT_STYLE =
  "bg-muted text-muted-foreground border border-border/60"

export function WorkflowStatusBadge({
  status,
  label,
  className,
}: {
  status: string
  label?: string
  className?: string
}) {
  const style = STATUS_STYLES[status] ?? DEFAULT_STYLE
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        style,
        className
      )}
    >
      <span className="truncate">{label ?? status}</span>
    </span>
  )
}
