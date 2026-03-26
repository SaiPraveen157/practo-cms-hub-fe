

export const ROUTES = {
  LOGIN: "/login",
  FORGET_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  DASHBOARD: "/dashboard",
  UPLOAD: "/upload",
  UPLOAD_WITH_ID: "/upload/[id]",
  MY_TOPICS: "/my-topics",
  REVIEW_QUEUE: "/review-queue",
  USERS: "/users",
  SETTINGS: "/settings",
  USER_PROFILE: "/profile",
  NOTIFICATIONS: "/notifications",
  NOCIFICATIONS: "/notifications",
  MEDICAL_AFFAIRS_SCRIPTS: "/medical-affairs-scripts",
  MEDICAL_AFFAIRS_VIDEOS: "/medical-affairs-videos",
  CONTENT_BRAND_REVIEWER: "/content-brand-reviewer",
  CONTENT_BRAND_VIDEOS: "/content-brand-videos",
  MY_DOCTOR_NOTES: "/doctor-notes",
  AGENCY_POC: "/agency-poc",
  AGENCY_POC_SCRIPT: "/agency-poc",
  AGENCY_POC_VIDEOS: "/agency-poc-videos",
  VIDEOS: "/videos",
  CONTENT_APPROVER_SCRIPTS: "/content-approver-scripts",
  CONTENT_APPROVER_SCRIPTS_NEW: "/content-approver-script-new",
  CONTENT_APPROVER_VIDEOS: "/content-approver-videos",
  AGENCY_POC_PACKAGES: "/agency-poc-packages",
  MEDICAL_AFFAIRS_PACKAGES: "/medical-affairs-packages",
  CONTENT_BRAND_PACKAGES: "/content-brand-packages",
  CONTENT_APPROVER_PACKAGES: "/content-approver-packages",
  PUBLISHER: "/publisher",
  // DOCTOR_PROFILE: "/doctor-profile",
  CONTENT_LIBRARY: "/content-library",
} as const

export type RouteKey = keyof typeof ROUTES

/** Sidebar label and icon for each route. Only entries used in sidebar need to be set. */
export const ROUTE_META: Record<
  RouteKey,
  {
    label: string
    icon:
      | "layout-dashboard"
      | "file-text"
      | "users"
      | "clipboard-list"
      | "shield-check"
      | "history"
      | "upload"
      | "bell"
      | "folder-open"
      | "video"
      | "package"
      | "book-open"
      | "user"
      | "settings"
  }
> = {
  LOGIN: { label: "Login", icon: "layout-dashboard" },
  FORGET_PASSWORD: { label: "Forgot Password", icon: "layout-dashboard" },
  RESET_PASSWORD: { label: "Reset Password", icon: "layout-dashboard" },
  DASHBOARD: { label: "Dashboard", icon: "layout-dashboard" },
  UPLOAD: { label: "Upload", icon: "upload" },
  UPLOAD_WITH_ID: { label: "Upload", icon: "upload" },
  MY_TOPICS: { label: "My Topics", icon: "folder-open" },
  REVIEW_QUEUE: { label: "Review Queue", icon: "clipboard-list" },
  USERS: { label: "Users", icon: "users" },
  SETTINGS: { label: "Settings", icon: "settings" },
  USER_PROFILE: { label: "Profile", icon: "user" },
  NOTIFICATIONS: { label: "Notifications", icon: "bell" },
  NOCIFICATIONS: { label: "Notifications", icon: "bell" },
  MEDICAL_AFFAIRS_SCRIPTS: { label: "Scripts", icon: "file-text" },
  MEDICAL_AFFAIRS_VIDEOS: { label: "Videos", icon: "video" },
  CONTENT_BRAND_REVIEWER: { label: "Scripts", icon: "file-text" },
  CONTENT_BRAND_VIDEOS: { label: "Videos", icon: "video" },
  MY_DOCTOR_NOTES: { label: "Doctor Notes", icon: "book-open" },
  AGENCY_POC: { label: "Agency POC", icon: "layout-dashboard" },
  AGENCY_POC_SCRIPT: { label: "Scripts", icon: "file-text" },
  AGENCY_POC_VIDEOS: { label: "Videos", icon: "video" },
  VIDEOS: { label: "Videos", icon: "video" },
  CONTENT_APPROVER_SCRIPTS: { label: "Content Approver Scripts", icon: "shield-check" },
  CONTENT_APPROVER_SCRIPTS_NEW: { label: "Scripts", icon: "file-text" },
  CONTENT_APPROVER_VIDEOS: { label: "Videos", icon: "video" },
  AGENCY_POC_PACKAGES: { label: "Final packages", icon: "package" },
  MEDICAL_AFFAIRS_PACKAGES: { label: "Final packages", icon: "package" },
  CONTENT_BRAND_PACKAGES: { label: "Final packages", icon: "package" },
  CONTENT_APPROVER_PACKAGES: { label: "Final packages", icon: "package" },
  PUBLISHER: { label: "Publisher", icon: "layout-dashboard" },
  // DOCTOR_PROFILE: { label: "Doctor Profile", icon: "user" },
  CONTENT_LIBRARY: { label: "Content Library", icon: "folder-open" },
}
