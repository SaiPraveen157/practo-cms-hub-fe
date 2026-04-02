import type { LanguageVideoStatus } from "@/types/language-package"
import type { PackageLanguage } from "@/types/language-package"
import { cn } from "@/lib/utils"

export const LANGUAGE_VIDEO_STATUS_LABELS: Record<
  LanguageVideoStatus | "MIXED",
  string
> = {
  BRAND_REVIEW: "Content/Brand review",
  AWAITING_APPROVER: "Awaiting final approval",
  APPROVED: "Approved",
  WITHDRAWN: "Withdrawn",
  MIXED: "In progress",
}

export const PACKAGE_LANGUAGE_LABELS: Record<PackageLanguage, string> = {
  ENGLISH: "English",
  HINDI: "Hindi",
  TAMIL: "Tamil",
  TELUGU: "Telugu",
  KANNADA: "Kannada",
  MALAYALAM: "Malayalam",
  MARATHI: "Marathi",
}

export const PHASE_7_CREATE_LANGUAGES: PackageLanguage[] = [
  "HINDI",
  "TAMIL",
  "TELUGU",
  "KANNADA",
  "MALAYALAM",
  "MARATHI",
]

export function languageVideoStatusBadgeClass(
  status: LanguageVideoStatus | "MIXED"
): string {
  switch (status) {
    case "APPROVED":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
    case "AWAITING_APPROVER":
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
    case "WITHDRAWN":
      return "bg-muted text-muted-foreground"
    case "MIXED":
      return "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200"
    default:
      return "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200"
  }
}

export function languageThumbBadgeClass(
  s: "PENDING" | "APPROVED" | "REJECTED"
): string {
  switch (s) {
    case "APPROVED":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
    case "REJECTED":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
    default:
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
  }
}

export function formatLanguageLabel(code: string | undefined): string {
  if (!code) return "—"
  const u = code.toUpperCase() as PackageLanguage
  return PACKAGE_LANGUAGE_LABELS[u] ?? code
}

export function languageDetailShellClass() {
  return cn(
    "overflow-hidden rounded-xl border border-border bg-black shadow-md ring-1 ring-border/60"
  )
}
