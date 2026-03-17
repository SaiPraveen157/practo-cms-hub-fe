"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  LayoutDashboard,
  FileText,
  Users,
  ClipboardList,
  History,
  ShieldCheck,
  LogOut,
  Sun,
  Moon,
  PanelLeft,
  Upload,
  Bell,
  FolderOpen,
  Video,
  BookOpen,
  User,
  Settings,
  ChevronLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { toast } from "sonner"
import { useAuthStore } from "@/store"
import { getSidebarNavForRole } from "@/lib/sidebar-nav"
import { getUnreadCount } from "@/lib/notifications-api"
import type { UserRole } from "@/types/auth"

const SIDEBAR_COLLAPSED_KEY = "practo-sidebar-collapsed"

const iconMap: Record<
  import("@/lib/sidebar-nav").SidebarNavIcon,
  React.ComponentType<{ className?: string }>
> = {
  "layout-dashboard": LayoutDashboard,
  "file-text": FileText,
  users: Users,
  "clipboard-list": ClipboardList,
  "shield-check": ShieldCheck,
  history: History,
  upload: Upload,
  bell: Bell,
  "folder-open": FolderOpen,
  video: Video,
  "book-open": BookOpen,
  user: User,
  settings: Settings,
}

function getInitials(firstName: string, lastName: string, email: string) {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase()
  if (firstName) return firstName.slice(0, 2).toUpperCase()
  if (email) return email.slice(0, 2).toUpperCase()
  return "U"
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true"
  })
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0)
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
  }, [collapsed])

  useEffect(() => {
    if (!token) {
      setUnreadNotificationCount(0)
      return
    }
    let cancelled = false
    getUnreadCount(token)
      .then((count) => {
        if (!cancelled) setUnreadNotificationCount(count)
      })
      .catch(() => {
        if (!cancelled) setUnreadNotificationCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    const refetch = () => {
      getUnreadCount(token)
        .then(setUnreadNotificationCount)
        .catch(() => setUnreadNotificationCount(0))
    }
    window.addEventListener("notifications-updated", refetch)
    return () => window.removeEventListener("notifications-updated", refetch)
  }, [token])

  const navItems = user?.role ? getSidebarNavForRole(user.role as UserRole) : []

  function handleLogout() {
    logout()
    toast.info("Logged out", { description: "You have been signed out." })
    router.replace("/login")
  }

  const sidebarWidth = collapsed ? "w-16" : "w-72"

  const roleLabel =
    user?.role === "MEDICAL_AFFAIRS"
      ? "Medical Affairs"
      : user?.role === "CONTENT_BRAND"
        ? "Content/Brand"
        : user?.role === "CONTENT_APPROVER"
          ? "Content Approver"
          : user?.role === "AGENCY_POC"
            ? "Agency POC"
            : user?.role === "SUPER_ADMIN"
              ? "Super Admin"
              : user?.role ?? "User"

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-svh shrink-0 flex-col overflow-hidden border-r border-slate-700/80 bg-[#1A202C] transition-[width] duration-200",
        sidebarWidth
      )}
    >
      {/* Header: Practo HUB CMS, Content Management, collapse */}
      <div className="flex h-14 items-center gap-2 border-b border-slate-700/80 px-3">
        {!collapsed && (
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-base font-bold tracking-tight text-white">
              Practo HUB CMS
            </span>
            <span className="truncate text-xs text-slate-400">Content Management</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "shrink-0 text-slate-400 hover:bg-slate-700/50 hover:text-white",
            collapsed && "mx-auto"
          )}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft className="size-5" />
          ) : (
            <ChevronLeft className="size-5" />
          )}
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = iconMap[item.icon] ?? LayoutDashboard
          const showUnreadBadge =
            (item.key === "NOTIFICATIONS" || item.key === "NOCIFICATIONS") &&
            unreadNotificationCount > 0
          return (
            <Link
              key={item.key}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
              )}
            >
              <span className="relative shrink-0">
                <Icon className="size-5" />
                {showUnreadBadge && (
                  <span
                    className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white"
                    aria-label={`${unreadNotificationCount} unread notifications`}
                  >
                    {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                  </span>
                )}
              </span>
              {!collapsed && (
                <>
                  <span className="truncate">{item.label}</span>
                  {showUnreadBadge && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-medium text-white">
                      {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                    </span>
                  )}
                </>
              )}
            </Link>
          )
        })}
        {collapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="mt-1 size-8 w-full shrink-0 justify-center text-slate-400 hover:bg-slate-700/50 hover:text-white"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          >
            <Sun className="size-5 dark:hidden" />
            <Moon className="hidden size-5 dark:block" />
          </Button>
        )}
        <button
          type="button"
          onClick={handleLogout}
          title="Log out"
          className={cn(
            "mt-1 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-slate-700/50 hover:text-red-300",
            collapsed && "justify-center px-2"
          )}
        >
          <LogOut className="size-5 shrink-0" />
          {!collapsed && <span className="truncate">Logout</span>}
        </button>
      </nav>

      {/* User block: avatar (teal), name, role */}
      <div className="border-t border-slate-700/80 p-3">
        <Link
          href="/profile"
          className={cn(
            "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-slate-700/50",
            collapsed && "justify-center"
          )}
          title="View profile"
        >
          <Avatar size="sm" className="size-9 shrink-0">
            <AvatarFallback className="bg-teal-500 text-xs font-medium text-white">
              {user
                ? getInitials(user.firstName, user.lastName, user.email)
                : "?"}
            </AvatarFallback>
          </Avatar>
          {!collapsed && user && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user.firstName || user.lastName
                  ? [user.firstName, user.lastName].filter(Boolean).join(" ")
                  : user.email}
              </p>
              <p className="truncate text-xs text-slate-400">{roleLabel}</p>
            </div>
          )}
        </Link>
      </div>
    </aside>
  )
}
