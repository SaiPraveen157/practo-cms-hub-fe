import type { Script, ScriptStatus } from "@/types/script"

/**
 * Text and border (outline) colors per script status. No background fill.
 */
export const SCRIPT_STATUS_STYLES: Record<ScriptStatus, string> = {
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

/** Display label when script came back due to rejection (from queue latestRejection). */
const REJECTED_DISPLAY_STYLE =
  "border-red-500 text-red-700 dark:border-red-400 dark:text-red-300"

/** Oval status pill on script cards: background + text (matches Script Approvals UI). */
export const SCRIPT_STATUS_PILL_STYLES: Record<ScriptStatus, string> = {
  DRAFT:
    "bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-200",
  CONTENT_BRAND_REVIEW:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  AGENCY_PRODUCTION:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  MEDICAL_REVIEW:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200",
  CONTENT_BRAND_APPROVAL:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200",
  CONTENT_APPROVER_REVIEW:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  LOCKED:
    "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
}

export const REJECTED_PILL_STYLE =
  "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"

export const STATUS_DISPLAY_LABELS: Record<ScriptStatus, string> = {
  DRAFT: "Draft",
  CONTENT_BRAND_REVIEW: "Content/Brand Review",
  AGENCY_PRODUCTION: "Agency Production",
  MEDICAL_REVIEW: "Medical Review",
  CONTENT_BRAND_APPROVAL: "Content/Brand Approval",
  CONTENT_APPROVER_REVIEW: "Content Approver Review",
  LOCKED: "Locked",
}

export function getScriptStatusClassName(status: ScriptStatus): string {
  return SCRIPT_STATUS_STYLES[status] ?? SCRIPT_STATUS_STYLES.DRAFT
}

/**
 * True when the script still reflects an open rejection (same rules as the
 * "Rejected" badge from {@link getScriptDisplayInfo}).
 */
export function scriptIsInRejectedState(script: Script): boolean {
  const rejection = script.latestRejection
  if (rejection == null) return false
  const stageAtRejection = rejection.stageAtReview
  return script.status === "DRAFT" || script.status === stageAtRejection
}

/**
 * Label and className for badge display. Show "Rejected" only when the script
 * is still in a rejected state (DRAFT after rejection, or still at the stage
 * where it was rejected). Once the script has moved forward (e.g. re-submitted
 * and approved, now in MEDICAL_REVIEW), show the actual status.
 */
export function getScriptDisplayInfo(script: Script): {
  label: string
  className: string
  pillClassName: string
} {
  if (scriptIsInRejectedState(script)) {
    return {
      label: "Rejected",
      className: REJECTED_DISPLAY_STYLE,
      pillClassName: REJECTED_PILL_STYLE,
    }
  }
  return {
    label: STATUS_DISPLAY_LABELS[script.status] ?? script.status,
    className: getScriptStatusClassName(script.status),
    pillClassName: SCRIPT_STATUS_PILL_STYLES[script.status] ?? SCRIPT_STATUS_PILL_STYLES.DRAFT,
  }
}
