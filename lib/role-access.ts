import type { UserRole } from "@/types/auth"
import type { RouteKey } from "./routes"


/**
 * Which routes each role can access. Sidebar shows only these items for the role.
 * Add or remove route keys to change what appears in the sidebar.
 */
export const ROLE_ACCESS: Record<UserRole, RouteKey[]> = {
  SUPER_ADMIN: [
    "DASHBOARD",
    "USERS",
    "NOCIFICATIONS",
    "MEDICAL_AFFAIRS_SCRIPTS",
    "CONTENT_BRAND_REVIEWER",
    "MY_TOPICS",
    "MY_DOCTOR_NOTES",
    "UPLOAD",
    "AGENCY_POC",
    "SCRIPT",
    // "VIDEOS", // Phase 4+
    "CONTENT_APPROVER_SCRIPTS",
    // "CONTENT_APPROVER_VIDEOS", // Phase 4+
    "CONTENT_LIBRARY",
  ],

  MEDICAL_AFFAIRS: [
    "MEDICAL_AFFAIRS_SCRIPTS",
    "CONTENT_APPROVER_SCRIPTS",
    // "CONTENT_APPROVER_VIDEOS", // Phase 4+
    "NOCIFICATIONS",
    "DOCTOR_PROFILE",
  ],

  CONTENT_BRAND: [
    "CONTENT_BRAND_REVIEWER",
    "CONTENT_APPROVER_SCRIPTS",
    // "CONTENT_APPROVER_VIDEOS", // Phase 4+
    "NOCIFICATIONS",
  ],

  AGENCY_POC: [
    "AGENCY_POC",
    "SCRIPT",
    // "VIDEOS", // Phase 4+
    "NOCIFICATIONS",
  ],

  CONTENT_APPROVER: [
    "CONTENT_APPROVER_SCRIPTS_NEW",
    // "CONTENT_APPROVER_VIDEOS", // Phase 4+
    "NOCIFICATIONS",
  ],
}

export function getRouteKeysForRole(role: UserRole): RouteKey[] {
  return ROLE_ACCESS[role] ?? ROLE_ACCESS.SUPER_ADMIN
}
