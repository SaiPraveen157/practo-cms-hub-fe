import type {
  FinalPackage,
  PackageAsset,
  PackageItemFeedbackEntry,
  PackageStatus,
  PackageThumbnailRecord,
  PackageVideo,
  PackageVideoAsset,
  PackageVideoStatus,
} from "@/types/package"

export function getCurrentVideoAsset(
  video: PackageVideo
): PackageVideoAsset | undefined {
  return video.assets?.find((a) => a.version === video.currentVersion)
}

/**
 * Content Brand — Videos tab (playback quality). Same POST …/approve|reject as
 * Postman's BRAND_VIDEO_REVIEW; also treats stuck MEDICAL_REVIEW when both
 * tracks are already APPROVED (status should have promoted but did not).
 */
export function contentBrandPlaybackQualityActionsAvailable(
  video: PackageVideo
): boolean {
  if (video.status === "APPROVED" || video.status === "WITHDRAWN") return false
  if (video.status === "BRAND_VIDEO_REVIEW") return true
  return (
    video.status === "MEDICAL_REVIEW" &&
    video.videoTrackStatus === "APPROVED" &&
    video.metadataTrackStatus === "APPROVED"
  )
}

/** No video may still be in Medical / Brand stages — then Content Approver may open full package (players, metadata, thumbnails). */
const PRE_APPROVER_VIDEO_STAGES: PackageVideoStatus[] = [
  "MEDICAL_REVIEW",
  "BRAND_VIDEO_REVIEW",
]

export function packageReadyForContentApproverFullView(
  videos: PackageVideo[]
): boolean {
  if (videos.length === 0) return false
  return videos.every((v) => !PRE_APPROVER_VIDEO_STAGES.includes(v.status))
}

export function packageVideosSorted(pkg: FinalPackage): PackageVideo[] {
  const list = [...(pkg.videos ?? [])]
  list.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "LONG_FORM" ? -1 : 1
    }
    const ca = getCurrentVideoAsset(a)?.order ?? 0
    const cb = getCurrentVideoAsset(b)?.order ?? 0
    return ca - cb
  })
  return list
}

export function mergeVideoIntoPackage(
  pkg: FinalPackage,
  updated: PackageVideo
): FinalPackage {
  const videos = (pkg.videos ?? []).map((v) =>
    v.id === updated.id ? updated : v
  )
  return { ...pkg, videos }
}

export function thumbnailsOnAsset(
  asset: PackageVideoAsset | undefined
): PackageThumbnailRecord[] {
  return asset?.thumbnails ?? []
}

/**
 * Per-thumbnail `status` can stay `PENDING` while `metadataTrackStatus` is
 * `APPROVED` (e.g. after a video-only resubmit if new thumbnail rows are created
 * without copying prior APPROVED states). For badges and read-only UI, align
 * with the track: when metadata is approved, treat orphan `PENDING` as approved.
 * Do not use this for Brand review actions that must use raw API statuses.
 */
export function displayThumbnailStatus(
  video: PackageVideo,
  status: PackageThumbnailRecord["status"]
): PackageThumbnailRecord["status"] {
  if (video.metadataTrackStatus === "APPROVED" && status === "PENDING") {
    return "APPROVED"
  }
  return status
}

/** For components that expect nested `PackageAsset` thumbnails. */
export function videoAssetToPackageAsset(va: PackageVideoAsset): PackageAsset {
  const thumbAssets: PackageAsset[] = (va.thumbnails ?? []).map((t) => ({
    id: t.id,
    type: "THUMBNAIL",
    fileUrl: t.fileUrl,
    fileName: t.fileName,
    fileType: t.fileType ?? undefined,
    fileSize: t.fileSize ?? undefined,
    version: t.version,
  }))
  return {
    id: va.id,
    type: va.type,
    fileUrl: va.fileUrl,
    fileName: va.fileName,
    fileType: va.fileType,
    fileSize: va.fileSize,
    order: va.order ?? undefined,
    version: va.version,
    title: va.title,
    description: va.description,
    tags: va.tags ?? undefined,
    doctorName: va.doctorName ?? undefined,
    specialty: va.specialty ?? undefined,
    thumbnails: thumbAssets,
  }
}

export function packageVideoDeliverableLabel(
  video: PackageVideo,
  shortFormIndex: number
): string {
  if (video.type === "LONG_FORM") return "Long-form (main)"
  return `Short-form ${shortFormIndex}`
}

/** Stable label per video id (long-form vs numbered short-forms). */
export function deliverableLabelsByVideoId(
  videos: PackageVideo[]
): Map<string, string> {
  let shortIndex = 0
  const m = new Map<string, string>()
  for (const v of videos) {
    if (v.type === "LONG_FORM") {
      m.set(v.id, "Long-form (main)")
    } else {
      shortIndex += 1
      m.set(v.id, packageVideoDeliverableLabel(v, shortIndex))
    }
  }
  return m
}

/**
 * Queue responses are video-centric; multiple rows can share one package name.
 * Labels each video within its package (sorted like detail views) so list rows are distinct.
 */
export function deliverableLabelsForQueueVideos(
  videos: PackageVideo[]
): Map<string, string> {
  const byPackage = new Map<string, PackageVideo[]>()
  for (const v of videos) {
    const pid = v.packageId
    if (!pid) continue
    const list = byPackage.get(pid) ?? []
    list.push(v)
    byPackage.set(pid, list)
  }
  const out = new Map<string, string>()
  for (const list of byPackage.values()) {
    const sorted = packageVideosSorted({ videos: list } as FinalPackage)
    const m = deliverableLabelsByVideoId(sorted)
    for (const [id, label] of m) out.set(id, label)
  }
  return out
}

/** One list card per package; videos sorted like detail views. */
export type QueuePackageGroup = {
  packageId: string
  videos: PackageVideo[]
  packageName: string
  scriptTitle?: string
}

export function groupQueueVideosByPackage(
  videos: PackageVideo[]
): QueuePackageGroup[] {
  const byPackage = new Map<string, PackageVideo[]>()
  for (const v of videos) {
    const pid = v.packageId
    if (!pid) continue
    const list = byPackage.get(pid) ?? []
    list.push(v)
    byPackage.set(pid, list)
  }
  const groups: QueuePackageGroup[] = []
  for (const [packageId, list] of byPackage) {
    const sorted = packageVideosSorted({ videos: list } as FinalPackage)
    const first = sorted[0]
    groups.push({
      packageId,
      videos: sorted,
      packageName:
        first?.package?.name ?? first?.script?.title ?? "Final package",
      scriptTitle: first?.script?.title,
    })
  }
  const latest = (vs: PackageVideo[]) =>
    Math.max(
      0,
      ...vs.map((x) => (x.updatedAt ? new Date(x.updatedAt).getTime() : 0))
    )
  groups.sort((a, b) => latest(b.videos) - latest(a.videos))
  return groups
}

export function packageItemFeedbackDeliverableLabel(
  pkg: FinalPackage,
  entry: Pick<PackageItemFeedbackEntry, "videoAssetId">
): string {
  const aid = entry.videoAssetId
  if (!aid) return "Deliverable"
  let shortN = 0
  for (const v of packageVideosSorted(pkg)) {
    const asset = getCurrentVideoAsset(v)
    if (asset?.id === aid) {
      if (v.type === "LONG_FORM") return "Long-form (main)"
      return `Short-form ${shortN}`
    }
    if (v.type === "SHORT_FORM") shortN += 1
  }
  return "Video deliverable"
}

export function getVideoTrackFeedbackItems(
  reviews: PackageVideo["reviews"] | undefined
): PackageItemFeedbackEntry[] {
  return (reviews ?? [])
    .filter(
      (r) =>
        r.decision === "REJECTED" &&
        (r.trackReviewed === "VIDEO_TRACK" || r.trackReviewed === "BOTH")
    )
    .flatMap((r) => r.itemFeedback ?? [])
    .filter((f) => f.hasIssue && (f.comment?.trim() ?? "") !== "")
}

export function getMetadataTrackFeedbackItems(
  reviews: PackageVideo["reviews"] | undefined
): PackageItemFeedbackEntry[] {
  return (reviews ?? [])
    .filter(
      (r) =>
        r.decision === "REJECTED" &&
        (r.trackReviewed === "METADATA_TRACK" || r.trackReviewed === "BOTH")
    )
    .flatMap((r) => r.itemFeedback ?? [])
    .filter((f) => f.hasIssue && (f.comment?.trim() ?? "") !== "")
}

/** Row label when package has no single workflow status. */
export function aggregatePackageDisplayStatus(
  pkg: FinalPackage
): PackageStatus {
  const v = pkg.videos ?? []
  if (v.length === 0) return "MEDICAL_REVIEW"
  if (v.every((x) => x.status === "APPROVED" || x.status === "WITHDRAWN")) {
    return v.some((x) => x.status === "APPROVED") ? "APPROVED" : "WITHDRAWN"
  }
  if (v.some((x) => x.status === "AWAITING_APPROVER"))
    return "AWAITING_APPROVER"
  if (v.some((x) => x.status === "BRAND_VIDEO_REVIEW"))
    return "BRAND_VIDEO_REVIEW"
  return "MEDICAL_REVIEW"
}

export function filterQueueVideosBySearch(
  videos: PackageVideo[],
  searchQuery: string
): PackageVideo[] {
  const q = searchQuery.trim().toLowerCase()
  if (!q) return videos
  return videos.filter((v) => {
    const pkgName = (v.package?.name ?? "").toLowerCase()
    const scriptTitle = (v.script?.title ?? "").toLowerCase()
    return pkgName.includes(q) || scriptTitle.includes(q)
  })
}

export function filterQueuePackagesBySearch(
  packages: FinalPackage[],
  searchQuery: string
): FinalPackage[] {
  const q = searchQuery.trim().toLowerCase()
  if (!q) return packages
  return packages.filter((pkg) => {
    const pkgName = (pkg.name ?? "").toLowerCase()
    const scriptTitle = (pkg.script?.title ?? "").toLowerCase()
    if (pkgName.includes(q) || scriptTitle.includes(q)) return true
    for (const v of pkg.videos ?? []) {
      const asset = getCurrentVideoAsset(v)
      const title = (asset?.title ?? "").toLowerCase()
      if (title.includes(q)) return true
      const tags = (asset?.tags ?? []).join(" ").toLowerCase()
      if (tags.includes(q)) return true
    }
    return false
  })
}

export function groupQueueVideosIntoPackages(
  videos: PackageVideo[]
): FinalPackage[] {
  const byId = new Map<string, PackageVideo[]>()
  for (const v of videos) {
    const pid = v.packageId
    const arr = byId.get(pid) ?? []
    arr.push(v)
    byId.set(pid, arr)
  }
  const out: FinalPackage[] = []
  for (const [packageId, list] of byId) {
    const sorted = [...list].sort((a, b) => {
      if (a.type !== b.type) return a.type === "LONG_FORM" ? -1 : 1
      return (
        new Date(a.updatedAt ?? 0).getTime() -
        new Date(b.updatedAt ?? 0).getTime()
      )
    })
    const first = sorted[0]
    const scriptId =
      first?.scriptId ?? first?.package?.scriptId ?? first?.script?.id ?? ""
    const name = first?.package?.name
    out.push({
      id: packageId,
      scriptId,
      name,
      title: name,
      videos: sorted,
      createdAt: first?.createdAt ?? "",
      updatedAt: sorted[sorted.length - 1]?.updatedAt ?? first?.updatedAt ?? "",
      script: first?.script,
    })
  }
  return out.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}
