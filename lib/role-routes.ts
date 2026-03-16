import type { UserRole } from "@/types/auth"

/**
 * Role-specific home paths. After login, users are redirected here.
 * Each role lands on their scripts list by default.
 */
export const ROLE_HOME: Record<UserRole, string> = {
  SUPER_ADMIN: "/admin",
  MEDICAL_AFFAIRS: "/medical-affairs-scripts",
  CONTENT_BRAND: "/content-brand-reviewer",
  AGENCY_POC: "/agency-poc",
  CONTENT_APPROVER: "/content-approver-script-new",
}

export function getHomePathForRole(role: UserRole): string {
  return ROLE_HOME[role] ?? "/admin"
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  MEDICAL_AFFAIRS: "Medical Affairs",
  CONTENT_BRAND: "Content / Brand",
  AGENCY_POC: "Agency POC",
  CONTENT_APPROVER: "Content Approver",
}
