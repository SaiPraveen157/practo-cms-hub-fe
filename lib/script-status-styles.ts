import type { ScriptStatus } from "@/types/script"

/**
 * Text and border (outline) colors per script status. No background fill.
 */
export const SCRIPT_STATUS_STYLES: Record<
  ScriptStatus,
  string
> = {
  DRAFT:
    "border-slate-400 text-slate-700 dark:border-slate-500 dark:text-slate-300",
  CONTENT_BRAND_REVIEW:
    "border-blue-500 text-blue-700 dark:border-blue-400 dark:text-blue-300",
  AGENCY_PRODUCTION:
    "border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-300",
  MEDICAL_REVIEW:
    "border-teal-500 text-teal-700 dark:border-teal-400 dark:text-teal-300",
  CONTENT_BRAND_APPROVAL:
    "border-indigo-500 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300",
  CONTENT_APPROVER_REVIEW:
    "border-violet-500 text-violet-700 dark:border-violet-400 dark:text-violet-300",
  LOCKED:
    "border-green-500 text-green-700 dark:border-green-400 dark:text-green-300",
}

export function getScriptStatusClassName(status: ScriptStatus): string {
  return SCRIPT_STATUS_STYLES[status] ?? SCRIPT_STATUS_STYLES.DRAFT
}
