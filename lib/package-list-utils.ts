import { formatPackageDate } from "@/lib/package-ui"
import type {
  FinalPackage,
  PackageAssetFeedback,
  PackageItemFeedbackEntry,
  PackageUserRef,
} from "@/types/package"

/** Unified shape for showing the most recent rejection (API may use `latestRejection` or `reviews` only). */
export type PackageRejectionDisplay = {
  id: string
  reviewerLine: string
  trackLine: string
  reviewedAtLabel: string
  overallComments: string
  assetFeedback?: PackageAssetFeedback[]
  itemFeedback?: PackageItemFeedbackEntry[]
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

/**
 * Latest rejection for display: prefers `package.latestRejection`, else newest
 * `reviews[]` entry with decision REJECTED.
 */
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

/**
 * Agency must revise when the package is fully rejected or any parallel track
 * was rejected (e.g. Medical rejects videos → status stays MEDICAL_REVIEW but
 * videoTrackStatus is REJECTED per Phase 6 API).
 */
export function agencyPackageNeedsRevision(p: FinalPackage): boolean {
  if (p.status === "REJECTED") return true
  if (p.videoTrackStatus === "REJECTED") return true
  if (p.metadataTrackStatus === "REJECTED") return true
  return false
}

/**
 * Agency may open the Phase 6 submit wizard (`/new?scriptId`) after withdraw
 * (status DRAFT) or when reviewers rejected work (full package or a track).
 */
export function agencyPackageNeedsSubmitWizard(p: FinalPackage): boolean {
  if (p.status === "DRAFT") return true
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
    const t = (p.title ?? "").toLowerCase()
    const st = (p.script?.title ?? "").toLowerCase()
    return t.includes(q) || st.includes(q)
  })
}

/** Agency: split combined queue into workflow buckets (client-side). */
export function splitAgencyPackagesByTab(
  combined: FinalPackage[],
  tab: "active" | "revision" | "approved"
): FinalPackage[] {
  if (tab === "approved") {
    return combined.filter((p) => p.status === "APPROVED")
  }
  if (tab === "revision") {
    return combined.filter(agencyPackageNeedsRevision)
  }
  return combined.filter(
    (p) => p.status !== "APPROVED" && !agencyPackageNeedsRevision(p)
  )
}
