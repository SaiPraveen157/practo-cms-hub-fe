"use client"

import { useState, useEffect, useLayoutEffect, useRef } from "react"
import gsap from "gsap"
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
  Package,
  BookOpen,
  User,
  Settings,
  ChevronLeft,
} from "lucide-react"
import { GSAP_DURATION, GSAP_EASE, prefersReducedMotion } from "@/lib/gsap-motion"
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
  package: Package,
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
  const displayUnreadCount = token ? unreadNotificationCount : 0

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
  }, [collapsed])

  useEffect(() => {
    if (!token) return
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
  const navRef = useRef<HTMLElement>(null)
  const didStaggerNav = useRef(false)

  useLayoutEffect(() => {
    if (didStaggerNav.current || !user?.role || navItems.length === 0) return
    const nav = navRef.current
    if (!nav) return
    if (prefersReducedMotion()) {
      didStaggerNav.current = true
      return
    }
    const items = nav.querySelectorAll<HTMLElement>(":scope > a, :scope > button")
    if (items.length === 0) return
    didStaggerNav.current = true
    gsap.fromTo(
      items,
      { opacity: 0.35, x: -14 },
      {
        opacity: 1,
        x: 0,
        duration: GSAP_DURATION.navItem,
        stagger: 0.055,
        ease: GSAP_EASE,
      }
    )
  }, [user?.role, navItems.length])

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
      <div className="flex items-center gap-2 border-b border-slate-700/80 px-3">
        {!collapsed && (
          <div className="flex min-w-0 flex-1 flex-col my-5 px-2">
            <span className="truncate bg-linear-to-r from-[#518dcd] to-[#7ac0ca] bg-clip-text font-bold tracking-tight text-transparent text-xl">
              Practo HUB CMS
            </span>
            <span className="truncate text-md text-slate-400">Content Management</span>
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
      <nav
        ref={navRef}
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
      >
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = iconMap[item.icon] ?? LayoutDashboard
          const showUnreadBadge =
            (item.key === "NOTIFICATIONS" || item.key === "NOCIFICATIONS") &&
            displayUnreadCount > 0
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
                    aria-label={`${displayUnreadCount} unread notifications`}
                  >
                    {displayUnreadCount > 99 ? "99+" : displayUnreadCount}
                  </span>
                )}
              </span>
              {!collapsed && (
                <>
                  <span className="truncate">{item.label}</span>
                  {showUnreadBadge && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-medium text-white">
                      {displayUnreadCount > 99 ? "99+" : displayUnreadCount}
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
