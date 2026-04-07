/**
 * Legacy bulk re-submit from package rows is not supported in the per-video
 * Phase 6 API. Use the package detail resubmit actions per video.
 */

import type { FinalPackage } from "@/types/package"

export function buildSubmitPackageBodyFromPackage(
  _pkg: FinalPackage
): null {
  return null
}
