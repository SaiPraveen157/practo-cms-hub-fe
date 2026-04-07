import type { UserRole } from "@/types/auth"
import { ROUTES } from "./routes"
import { ROUTE_META, type RouteKey } from "./routes"
import { getRouteKeysForRole } from "./role-access"

export type SidebarNavIcon =
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

export interface SidebarNavItem {
  label: string
  href: string
  icon: SidebarNavIcon
  key: RouteKey
}

/**
 * Builds sidebar nav items for a role from ROLE_ACCESS and ROUTES.
 * Dynamic segments in paths (e.g. [id]) are normalized to a list path for the sidebar link.
 */
function pathForSidebar(path: string): string {
  if (path.includes("[id]")) return path.replace("/[id]", "")
  return path
}

export function getSidebarNavForRole(role: UserRole): SidebarNavItem[] {
  const keys = getRouteKeysForRole(role)
  return keys.map((key) => {
    const path = ROUTES[key]
    const meta = ROUTE_META[key]
    return {
      key,
      label: meta.label,
      href: pathForSidebar(path),
      icon: meta.icon,
    }
  })
}
