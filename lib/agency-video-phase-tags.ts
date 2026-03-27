import { getLatestVideoForScriptPhase } from "@/lib/video-phase-gates"
import { getScriptFluStatus } from "@/lib/script-flu-status"
import type { Script, ScriptFluStatus } from "@/types/script"
import type { Video } from "@/types/video"

export type AgencyPhaseTag = {
  label: string
  className: string
}

const muted =
  "border-border/80 bg-muted/50 text-muted-foreground dark:bg-muted/30"
const amber =
  "border-amber-600/50 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100"
const sky =
  "border-sky-600/50 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-100"
const indigo =
  "border-indigo-600/50 bg-indigo-50 text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-100"
const emerald =
  "border-emerald-600/50 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-100"

function tag(label: string, className: string): AgencyPhaseTag {
  return {
    label,
    className: `border ${className}`,
  }
}

function phase4FromFluStatus(fs: ScriptFluStatus): AgencyPhaseTag {
  switch (fs) {
    case "AGENCY_UPLOAD_PENDING":
      return tag("First Line Up — Upload pending", amber)
    case "MEDICAL_REVIEW":
      return tag("First Line Up — Medical review", sky)
    case "CONTENT_BRAND_REVIEW":
      return tag("First Line Up — Brand review", indigo)
    case "APPROVED":
      return tag("First Line Up — Completed", emerald)
    default:
      return tag("First Line Up — In progress", muted)
  }
}

function videoRowToPhaseTag(
  phaseLabel: "First Line Up" | "First Cut",
  latest: Video | undefined
): AgencyPhaseTag {
  if (!latest) {
    return tag(`${phaseLabel} — Not started`, muted)
  }
  switch (latest.status) {
    case "AGENCY_UPLOAD_PENDING":
      return tag(`${phaseLabel} — Upload pending`, amber)
    case "MEDICAL_REVIEW":
      return tag(`${phaseLabel} — Medical review`, sky)
    case "CONTENT_BRAND_REVIEW":
      return tag(`${phaseLabel} — Brand review`, indigo)
    case "APPROVED":
      return tag(`${phaseLabel} — Completed`, emerald)
    default:
      return tag(`${phaseLabel} — In progress`, muted)
  }
}

/**
 * First Line Up tag: prefer `fluStatus` from script queue when present; else latest FLU video row.
 * First Cut tag: latest First Cut video row for the script.
 */
export function getAgencyVideoCardPhaseTags(
  script: Script | undefined,
  allVideos: Video[],
  scriptId: string
): { phase4: AgencyPhaseTag; phase5: AgencyPhaseTag } {
  const flu = getScriptFluStatus(script)

  const latestFlu = getLatestVideoForScriptPhase(
    allVideos,
    scriptId,
    "FIRST_LINE_UP"
  )
  const latestFc = getLatestVideoForScriptPhase(
    allVideos,
    scriptId,
    "FIRST_CUT"
  )

  let phase4: AgencyPhaseTag
  if (flu !== undefined) {
    if (flu === null) {
      phase4 = tag("First Line Up — Not started", muted)
    } else {
      phase4 = phase4FromFluStatus(flu)
    }
  } else {
    phase4 = videoRowToPhaseTag("First Line Up", latestFlu)
  }

  const phase5 = videoRowToPhaseTag("First Cut", latestFc)

  return { phase4, phase5 }
}
