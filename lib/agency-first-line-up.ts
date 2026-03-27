import {
  getLatestVideoForScriptPhase,
} from "@/lib/video-phase-gates"
import type { Video } from "@/types/video"

/**
 * Whether Agency should see the First Line Up upload entry (`/agency-poc/[id]/upload`).
 *
 * - No `FIRST_LINE_UP` row yet → Phase 4 not started; show upload.
 * - Latest FLU `APPROVED` → Content/Brand approved First Line Up; Phase 4 done — hide FLU upload (use First Cut / video queue).
 * - Latest FLU `AGENCY_UPLOAD_PENDING` → initial upload or re-upload after reject; show upload.
 * - Latest FLU in `MEDICAL_REVIEW` or `CONTENT_BRAND_REVIEW` → in flight; hide upload until rejected back to Agency.
 */
export function scriptNeedsAgencyFirstLineUpUpload(
  scriptId: string,
  videos: Video[]
): boolean {
  const latestFlu = getLatestVideoForScriptPhase(
    videos,
    scriptId,
    "FIRST_LINE_UP"
  )
  if (!latestFlu) return true
  if (latestFlu.status === "APPROVED") return false
  if (latestFlu.status === "AGENCY_UPLOAD_PENDING") return true
  return false
}
