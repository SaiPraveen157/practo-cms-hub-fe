import { cn } from "@/lib/utils"

export type ContentStatus =
  | "medical_review"
  | "final_review"
  | "published"
  | "under_edit"

const styles: Record<
  ContentStatus,
  string
> = {
  medical_review:
    "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200",
  final_review:
    "bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200",
  published:
    "bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white",
  under_edit: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
}

const labels: Record<ContentStatus, string> = {
  medical_review: "Medical Review",
  final_review: "Final Review",
  published: "Published",
  under_edit: "Under Edit",
}

export function ContentStatusBadge({
  status,
  className,
}: {
  status: ContentStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[status],
        className
      )}
    >
      {labels[status]}
    </span>
  )
}
