import { formatPackageDate } from "@/lib/package-ui"
import type {
  FinalPackage,
  PackageAssetFeedback,
  PackageItemFeedbackEntry,
  PackageUserRef,
  PackageVideo,
} from "@/types/package"

export type PackageRejectionDisplay = {
  id: string
  reviewerLine: string
  trackLine: string
  reviewedAtLabel: string
  overallComments: string
  assetFeedback?: PackageAssetFeedback[]
  itemFeedback?: PackageItemFeedbackEntry[]
}

/** Join item feedback comments the way the old reject UI did — used to hide duplicate “summary” bars. */
export function itemFeedbackCommentsJoined(
  items: PackageItemFeedbackEntry[]
): string {
  return items
    .map((i) => i.comment?.trim())
    .filter(Boolean)
    .join(" · ")
}

export function isOverallCommentsRedundantWithItemFeedback(
  overall: string,
  items: PackageItemFeedbackEntry[]
): boolean {
  const o = overall.trim()
  if (!o) return false
  const joined = itemFeedbackCommentsJoined(items)
  return joined.length > 0 && o === joined
}

function reviewerLine(
  reviewer:
    | Pick<PackageUserRef, "firstName" | "lastName">
    | PackageUserRef
    | undefined,
  reviewerType: string
): string {
  const name = [reviewer?.firstName, reviewer?.lastName]
    .filter(Boolean)
    .join(" ")
  if (name) return `${name} · ${reviewerType}`
  return reviewerType || "Reviewer"
}

export function getLatestDisplayableRejection(
  pkg: FinalPackage
): PackageRejectionDisplay | null {
  const lr = pkg.latestRejection
  if (lr) {
    return {
      id: lr.id,
      reviewerLine: reviewerLine(lr.reviewer, lr.reviewerType),
      trackLine: [lr.trackReviewed, lr.stageAtReview].filter(Boolean).join(" · "),
      reviewedAtLabel: formatPackageDate(lr.reviewedAt),
      overallComments: lr.overallComments?.trim() ?? "",
      assetFeedback: lr.assetFeedback,
      itemFeedback: lr.itemFeedback,
    }
  }
  const rejects = (pkg.reviews ?? [])
    .filter((r) => r.decision === "REJECTED")
    .sort(
      (a, b) =>
        new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime()
    )
  const r = rejects[0]
  if (!r) return null
  const overall =
    r.overallComments?.trim() || r.comments?.trim() || ""
  return {
    id: r.id,
    reviewerLine: reviewerLine(r.reviewer, r.reviewerType),
    trackLine: [r.trackReviewed, r.stageAtReview].filter(Boolean).join(" · "),
    reviewedAtLabel: formatPackageDate(r.reviewedAt),
    overallComments: overall,
    assetFeedback: r.assetFeedback,
    itemFeedback: r.itemFeedback,
  }
}

export function getLatestDisplayableRejectionForVideo(
  video: PackageVideo
): PackageRejectionDisplay | null {
  const rejects = (video.reviews ?? [])
    .filter((r) => r.decision === "REJECTED")
    .sort(
      (a, b) =>
        new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime()
    )
  const r = rejects[0]
  if (!r) return null
  const overall = r.overallComments?.trim() ?? ""
  return {
    id: r.id,
    reviewerLine: r.reviewerType,
    trackLine: [r.trackReviewed, r.stageAtReview].filter(Boolean).join(" · "),
    reviewedAtLabel: formatPackageDate(r.reviewedAt),
    overallComments: overall,
    itemFeedback: r.itemFeedback,
  }
}

/** Latest rejection for a specific parallel track (`BOTH` matches either filter). */
export function getLatestRejectionForVideoByTrack(
  video: PackageVideo,
  track: "VIDEO_TRACK" | "METADATA_TRACK"
): PackageRejectionDisplay | null {
  const matches = (tr: string | undefined) => {
    if (!tr) return false
    if (tr === "BOTH") return true
    return tr === track
  }
  const rejects = (video.reviews ?? [])
    .filter((r) => r.decision === "REJECTED" && matches(r.trackReviewed))
    .sort(
      (a, b) =>
        new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime()
    )
  const r = rejects[0]
  if (!r) return null
  const overall = r.overallComments?.trim() ?? ""
  return {
    id: r.id,
    reviewerLine: r.reviewerType,
    trackLine: [r.trackReviewed, r.stageAtReview].filter(Boolean).join(" · "),
    reviewedAtLabel: formatPackageDate(r.reviewedAt),
    overallComments: overall,
    itemFeedback: r.itemFeedback,
  }
}

export function medicalPackageVideoTrackNeedsRevision(
  pkg: FinalPackage
): boolean {
  return (pkg.videos ?? []).some(
    (v) =>
      v.status === "MEDICAL_REVIEW" && v.videoTrackStatus === "REJECTED"
  )
}

export function agencyVideoNeedsAgencyAction(v: PackageVideo): boolean {
  if (v.status === "WITHDRAWN" || v.status === "APPROVED") return false
  return (
    v.status === "MEDICAL_REVIEW" &&
    (v.videoTrackStatus === "REJECTED" ||
      v.metadataTrackStatus === "REJECTED")
  )
}

export function agencyPackageNeedsRevision(p: FinalPackage): boolean {
  return (p.videos ?? []).some(agencyVideoNeedsAgencyAction)
}

export function agencyPackageAllVideosTerminal(p: FinalPackage): boolean {
  const vids = p.videos ?? []
  if (vids.length === 0) return false
  return vids.every((v) => v.status === "APPROVED" || v.status === "WITHDRAWN")
}

export function agencyPackageNeedsSubmitWizard(p: FinalPackage): boolean {
  return agencyPackageNeedsRevision(p)
}

export function dedupePackages(list: FinalPackage[]): FinalPackage[] {
  const map = new Map<string, FinalPackage>()
  for (const p of list) map.set(p.id, p)
  return [...map.values()].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

export function filterPackagesBySearch(
  list: FinalPackage[],
  searchQuery: string
): FinalPackage[] {
  const q = searchQuery.trim().toLowerCase()
  if (!q) return list
  return list.filter((p) => {
    const t = (p.name ?? p.title ?? "").toLowerCase()
    const st = (p.script?.title ?? "").toLowerCase()
    return t.includes(q) || st.includes(q)
  })
}

export function splitAgencyPackagesByTab(
  combined: FinalPackage[],
  tab: "active" | "revision" | "approved"
): FinalPackage[] {
  if (tab === "approved") {
    return combined.filter(agencyPackageAllVideosTerminal)
  }
  if (tab === "revision") {
    return combined.filter(agencyPackageNeedsRevision)
  }
  return combined.filter(
    (p) =>
      !agencyPackageAllVideosTerminal(p) && !agencyPackageNeedsRevision(p)
  )
}
