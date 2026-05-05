import type { Script, ScriptStatus } from "@/types/script"

/** Tabs that split script workflow: early (MA + C/B script) vs agency production through lock. */
export type PhaseTabKey = "phase12" | "phase3"

/**
 * Phases 1–2: MA creates script → Content/Brand review loop (schema: DRAFT → CONTENT_BRAND_REVIEW).
 */
export const PHASE_12_STATUSES: readonly ScriptStatus[] = [
  "DRAFT",
  "CONTENT_BRAND_REVIEW",
] as const

/**
 * Phase 3: Agency script production through lock (after C/B approves script to agency).
 */
export const PHASE_3_STATUSES: readonly ScriptStatus[] = [
  "AGENCY_PRODUCTION",
  "MEDICAL_REVIEW",
  "CONTENT_BRAND_APPROVAL",
  "CONTENT_APPROVER_REVIEW",
  "LOCKED",
] as const

const PHASE_12_SET = new Set<string>(PHASE_12_STATUSES)
const PHASE_3_SET = new Set<string>(PHASE_3_STATUSES)

export function scriptInPhaseTab(s: Script, phase: PhaseTabKey): boolean {
  return phase === "phase12"
    ? PHASE_12_SET.has(s.status)
    : PHASE_3_SET.has(s.status)
}

export function pendingStatusOptionsForPhase(
  phase: PhaseTabKey
): readonly ScriptStatus[] {
  return phase === "phase12" ? PHASE_12_STATUSES : PHASE_3_STATUSES
}
