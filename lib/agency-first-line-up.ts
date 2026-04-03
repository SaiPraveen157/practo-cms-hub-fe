import { getScriptFluStatus } from "@/lib/script-flu-status"
import { getLatestVideoForScriptPhase } from "@/lib/video-phase-gates"
import type { Script } from "@/types/script"
import type { Video } from "@/types/video"

/**
 * Whether Agency should see the First Line Up upload entry (`/agency-poc/[id]/upload`).
 *
 * When `GET /api/scripts/queue` includes `fluStatus`, that is authoritative:
 * - `null` → not uploaded yet → show upload
 * - `AGENCY_UPLOAD_PENDING` → show upload
 * - `MEDICAL_REVIEW` | `CONTENT_BRAND_REVIEW` | `APPROVED` → hide upload
 *
 * If `fluStatus` is omitted, fall back to the latest `FIRST_LINE_UP` video row.
 */
export function scriptNeedsAgencyFirstLineUpUpload(
  script: Script,
  videos: Video[]
): boolean {
  const flu = getScriptFluStatus(script)
  if (flu !== undefined) {
    return flu === null || flu === "AGENCY_UPLOAD_PENDING"
  }

  const latestFlu = getLatestVideoForScriptPhase(
    videos,
    script.id,
    "FIRST_LINE_UP"
  )
  if (!latestFlu) return true
  if (latestFlu.status === "APPROVED") return false
  if (latestFlu.status === "AGENCY_UPLOAD_PENDING") return true
  return false
}
