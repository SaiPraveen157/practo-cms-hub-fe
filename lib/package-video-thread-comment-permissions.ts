import type { UserRole } from "@/types/auth"
import type { LanguageVideo } from "@/types/language-package"
import type { PackageVideo } from "@/types/package"

/** POST thread comments on Phase 6 package videos (reviewers in active stages). */
export function canPostPackageVideoThreadComment(
  role: UserRole | undefined,
  video: PackageVideo
): boolean {
  if (!role) return false
  if (video.status === "WITHDRAWN" || video.status === "APPROVED") return false

  if (role === "SUPER_ADMIN") return true

  if (role === "MEDICAL_AFFAIRS") {
    return (
      video.status === "MEDICAL_REVIEW" &&
      video.videoTrackStatus === "PENDING"
    )
  }

  if (role === "CONTENT_BRAND") {
    if (
      video.status === "MEDICAL_REVIEW" &&
      video.metadataTrackStatus === "PENDING"
    ) {
      return true
    }
    if (video.status === "BRAND_VIDEO_REVIEW") return true
    return false
  }

  if (role === "CONTENT_APPROVER") {
    return video.status === "AWAITING_APPROVER"
  }

  return false
}

/** POST thread comments on Phase 7 language videos. */
export function canPostLanguageVideoThreadComment(
  role: UserRole | undefined,
  video: LanguageVideo
): boolean {
  if (!role) return false
  if (video.status === "WITHDRAWN" || video.status === "APPROVED") return false

  if (role === "SUPER_ADMIN") return true
  if (role === "CONTENT_BRAND") return video.status === "BRAND_REVIEW"
  if (role === "CONTENT_APPROVER") return video.status === "AWAITING_APPROVER"
  return false
}
