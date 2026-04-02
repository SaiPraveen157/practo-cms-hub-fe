import { formatPackageDate } from "@/lib/package-ui"
import type { LanguagePackage, LanguageVideo } from "@/types/language-package"
import {
  agencyLanguagePackageAllVideosTerminal,
  agencyLanguagePackageNeedsRevision,
} from "@/lib/language-phase-gates"

export function dedupeLanguagePackages(list: LanguagePackage[]): LanguagePackage[] {
  const map = new Map<string, LanguagePackage>()
  for (const p of list) map.set(p.id, p)
  return [...map.values()].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

export function filterLanguagePackagesBySearch(
  list: LanguagePackage[],
  searchQuery: string
): LanguagePackage[] {
  const q = searchQuery.trim().toLowerCase()
  if (!q) return list
  return list.filter((p) => {
    const name = (p.name ?? "").toLowerCase()
    const lang = String(p.language ?? "").toLowerCase()
    const st = (p.script?.title ?? "").toLowerCase()
    return name.includes(q) || lang.includes(q) || st.includes(q)
  })
}

export function splitAgencyLanguagePackagesByTab(
  combined: LanguagePackage[],
  tab: "active" | "revision" | "approved"
): LanguagePackage[] {
  if (tab === "approved") {
    return combined.filter((p) =>
      agencyLanguagePackageAllVideosTerminal(p.videos ?? [])
    )
  }
  if (tab === "revision") {
    return combined.filter((p) => agencyLanguagePackageNeedsRevision(p))
  }
  return combined.filter(
    (p) =>
      !agencyLanguagePackageAllVideosTerminal(p.videos ?? []) &&
      !agencyLanguagePackageNeedsRevision(p)
  )
}

export function groupLanguageQueueVideosIntoPackages(
  videos: LanguageVideo[]
): LanguagePackage[] {
  const byPkg = new Map<string, LanguageVideo[]>()
  for (const v of videos) {
    const pid = v.packageId || v.package?.id
    if (!pid) continue
    const list = byPkg.get(pid) ?? []
    list.push(v)
    byPkg.set(pid, list)
  }
  const out: LanguagePackage[] = []
  for (const [id, vids] of byPkg) {
    const first = vids[0]
    const summary = first.package
    out.push({
      id,
      scriptId: summary?.scriptId ?? first.scriptId ?? "",
      name: summary?.name ?? "Language package",
      language: summary?.language ?? "",
      videos: vids,
      createdAt: first.createdAt ?? "",
      updatedAt: first.updatedAt ?? "",
    })
  }
  return dedupeLanguagePackages(out).sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

export function filterLanguageQueuePackagesBySearch(
  packages: LanguagePackage[],
  searchQuery: string
): LanguagePackage[] {
  const q = searchQuery.trim().toLowerCase()
  if (!q) return packages
  return packages.filter((p) => {
    const name = (p.name ?? "").toLowerCase()
    const lang = String(p.language ?? "").toLowerCase()
    const st = (p.script?.title ?? "").toLowerCase()
    return name.includes(q) || lang.includes(q) || st.includes(q)
  })
}

/** Aggregate worst / most prominent status for a language package row. */
/**
 * Content Approver list: from grouped queue packages, those with at least one
 * video awaiting final approval.
 */
export function languagePackagesAwaitingApproverFromQueue(
  packages: LanguagePackage[]
): LanguagePackage[] {
  return packages.filter((p) =>
    (p.videos ?? []).some((v) => v.status === "AWAITING_APPROVER")
  )
}

/**
 * Content Approver list: from the same queue payload, packages where every
 * video is APPROVED (no pending final sign-off on any video in that package).
 */
export function languagePackagesAllVideosApprovedFromQueue(
  packages: LanguagePackage[]
): LanguagePackage[] {
  return packages.filter((p) => {
    const v = p.videos ?? []
    return v.length > 0 && v.every((x) => x.status === "APPROVED")
  })
}

export function aggregateLanguagePackageRowStatus(
  pkg: LanguagePackage
): LanguageVideo["status"] | "MIXED" {
  const vids = pkg.videos ?? []
  if (vids.length === 0) return "BRAND_REVIEW"
  const set = new Set(vids.map((v) => v.status))
  if (set.size === 1) return vids[0].status
  return "MIXED"
}

export function languagePackageUpdatedLabel(pkg: LanguagePackage): string {
  return formatPackageDate(pkg.updatedAt)
}
