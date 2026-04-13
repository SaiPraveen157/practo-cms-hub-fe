import { getCurrentLanguageVideoAsset } from "@/lib/language-package-video-helpers"
import type { FinalPackage } from "@/types/package"
import type { LanguageVideo } from "@/types/language-package"

/** Phase 7 APIs require the script to be LOCKED. */
export function isScriptLockedForLanguagePackages(
  scriptStatus: string | undefined
): boolean {
  return scriptStatus === "LOCKED"
}

/**
 * Language packages are product-wise relevant after the English final package
 * has at least one approved video (Phase 7 auto-triggers on backend).
 */
export function englishFinalPackageHasApprovedVideo(
  englishPackage: FinalPackage | null | undefined
): boolean {
  if (!englishPackage?.videos?.length) return false
  return englishPackage.videos.some((v) => v.status === "APPROVED")
}

export function isScriptEligibleForPhase7LanguageSubmit(
  scriptStatus: string | undefined,
  englishPackage: FinalPackage | null | undefined
): boolean {
  return (
    isScriptLockedForLanguagePackages(scriptStatus) &&
    englishFinalPackageHasApprovedVideo(englishPackage)
  )
}

/**
 * True while Brand’s rejection still targets the **current** asset snapshot
 * (`videoAssetId` / `thumbnailId` on `itemFeedback` match the present file row).
 *
 * Do **not** use “latest reject time vs latest approve time” across all reviews:
 * there is often no APPROVED row until Content Approver acts, so `lastApproved`
 * stays 0 and Agency would incorrectly keep seeing “resubmit” forever after
 * they already uploaded a new version (new asset id).
 */
export function agencyLanguageVideoNeedsRevision(v: LanguageVideo): boolean {
  return languageVideoAwaitingAgencyAfterBrandRejectOnCurrentAsset(v)
}

/**
 * After Brand/Super Admin rejects at BRAND_REVIEW, status stays BRAND_REVIEW until
 * Agency resubmits (new `currentVersion`). Hide approve/reject until then.
 * Uses `itemFeedback.videoAssetId` / `thumbnailId` scoped to the current asset.
 */
export function languageVideoAwaitingAgencyAfterBrandRejectOnCurrentAsset(
  v: LanguageVideo
): boolean {
  if (v.status !== "BRAND_REVIEW") return false
  const asset = getCurrentLanguageVideoAsset(v)
  if (!asset) return false
  const thumbIds = new Set((asset.thumbnails ?? []).map((t) => t.id))

  for (const r of v.reviews ?? []) {
    if (String(r.decision ?? "").toUpperCase() !== "REJECTED") continue
    for (const it of r.itemFeedback ?? []) {
      if (it.videoAssetId && it.videoAssetId === asset.id) return true
      if (it.thumbnailId && thumbIds.has(it.thumbnailId)) return true
    }
  }
  return false
}

export function agencyLanguagePackageAllVideosTerminal(
  videos: LanguageVideo[]
): boolean {
  if (videos.length === 0) return false
  return videos.every((v) => v.status === "APPROVED" || v.status === "WITHDRAWN")
}

export function agencyLanguagePackageNeedsRevision(pkg: {
  videos?: LanguageVideo[]
}): boolean {
  return (pkg.videos ?? []).some(agencyLanguageVideoNeedsRevision)
}
