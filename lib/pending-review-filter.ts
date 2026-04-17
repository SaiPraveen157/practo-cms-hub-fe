import type { AdminContentItem } from "@/types/admin"

/**
 * Super Admin review queue: items that still need a reviewer / approver action
 * (not draft, not locked script, not fully approved, not withdrawn).
 */
export function isAdminContentPendingReview(item: AdminContentItem): boolean {
  const type = (item.contentType ?? "").trim().toLowerCase()
  const st = (item.status ?? "").trim().toUpperCase()
  if (!st) return false

  switch (type) {
    case "script":
      // Script workflow: exclude author draft, locked (handed off), agency editing.
      if (st === "DRAFT" || st === "LOCKED" || st === "AGENCY_PRODUCTION") {
        return false
      }
      return true
    case "video":
      return st !== "APPROVED"
    case "packagevideo":
      return st !== "APPROVED" && st !== "WITHDRAWN"
    case "languagevideo":
      return st !== "APPROVED" && st !== "WITHDRAWN"
    default:
      return false
  }
}
