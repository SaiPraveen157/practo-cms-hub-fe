/**
 * Coerce package `status` / track fields from API (camelCase or snake_case, any casing).
 * Phase 6 — Final Package Delivery (Postman redesigned collection).
 */

import type {
  FinalPackage,
  PackageStatus,
  PackageTrackStatus,
} from "@/types/package"

const PACKAGE_STATUSES: PackageStatus[] = [
  "DRAFT",
  "MEDICAL_REVIEW",
  "BRAND_REVIEW",
  "APPROVER_REVIEW",
  "APPROVED",
  "REJECTED",
]

const TRACK_STATUSES: PackageTrackStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
]

/** Collapse separators so e.g. brand-review / Brand Review → BRAND_REVIEW */
function normalizeEnumToken(raw: unknown): string {
  if (raw == null) return ""
  return String(raw)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
}

const STATUS_ALIASES: Record<string, PackageStatus> = {
  BRANDREVIEW: "BRAND_REVIEW",
  MEDICALREVIEW: "MEDICAL_REVIEW",
  APPROVERREVIEW: "APPROVER_REVIEW",
}

function coercePackageStatus(raw: unknown): PackageStatus {
  const s = normalizeEnumToken(raw)
  if (!s) return "MEDICAL_REVIEW"
  const key = s.replace(/_/g, "")
  if (STATUS_ALIASES[key]) return STATUS_ALIASES[key]
  if (PACKAGE_STATUSES.includes(s as PackageStatus)) return s as PackageStatus
  return s as PackageStatus
}

function coerceTrackStatus(raw: unknown): PackageTrackStatus {
  const s = normalizeEnumToken(raw)
  if (TRACK_STATUSES.includes(s as PackageTrackStatus)) return s as PackageTrackStatus
  return "PENDING"
}

/**
 * Merge normalized workflow fields onto the payload so UI gates (BRAND_REVIEW, track enums) match Postman.
 */
export function normalizeFinalPackage(pkg: unknown): FinalPackage {
  if (!pkg || typeof pkg !== "object") {
    return pkg as FinalPackage
  }
  const p = pkg as Record<string, unknown>
  return {
    ...(p as unknown as FinalPackage),
    status: coercePackageStatus(
      p.status ?? p.package_status ?? p.packageStatus
    ),
    videoTrackStatus: coerceTrackStatus(
      p.videoTrackStatus ?? p.video_track_status
    ),
    metadataTrackStatus: coerceTrackStatus(
      p.metadataTrackStatus ?? p.metadata_track_status
    ),
  }
}
