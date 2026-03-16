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
  PanelLeftClose,
  PanelLeft,
  Upload,
  Bell,
  FolderOpen,
  Video,
  BookOpen,
  User,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { toast } from "sonner"
import { useAuthStore } from "@/store"
import { getSidebarNavForRole } from "@/lib/sidebar-nav"
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

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
  }, [collapsed])

  const navItems = user?.role ? getSidebarNavForRole(user.role as UserRole) : []

  function handleLogout() {
    logout()
    toast.info("Logged out", { description: "You have been signed out." })
    router.replace("/login")
  }

  const sidebarWidth = collapsed ? "w-16" : "w-72"

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-svh shrink-0 flex-col overflow-hidden border-r border-border transition-[width] duration-200 dark:bg-gray-900 bg-gray-300",
        sidebarWidth
      )}
    >
      {/* Header: title, theme toggle, collapse */}
      <div className="flex h-14 items-center gap-1 border-b border-border px-2">
        {!collapsed && (
          <span className="truncate text-sm font-semibold text-foreground">
            Practo CMS
          </span>
        )}
        <div className={cn("ml-auto flex shrink-0 items-center gap-0.5", collapsed && "mx-auto flex-col")}>
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            >
              <Sun className="size-5 dark:hidden" />
              <Moon className="hidden size-5 dark:block" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-8 shrink-0", collapsed && "mt-0.5")}
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeft className="size-5" />
            ) : (
              <PanelLeftClose className="size-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = iconMap[item.icon] ?? LayoutDashboard
          return (
            <Link
              key={item.key}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}
        {collapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="mt-1 size-8 shrink-0 w-full justify-center"
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
            "mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors dark:text-red-400 cursor-pointer",
            collapsed && "justify-center px-2"
          )}
        >
          <LogOut className="size-5 shrink-0" />
          {!collapsed && <span className="truncate">Log out</span>}
        </button>
      </nav>

      {/* User block: link to profile */}
      <div className="border-t border-border p-2">
        <Link
          href="/profile"
          className={cn(
            "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted",
            collapsed && "justify-center"
          )}
          title="View profile"
        >
          <Avatar size="sm" className="size-8 shrink-0">
            <AvatarFallback className="text-xs">
              {user
                ? getInitials(user.firstName, user.lastName, user.email)
                : "?"}
            </AvatarFallback>
          </Avatar>
          {!collapsed && user && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {user.firstName || user.lastName
                  ? [user.firstName, user.lastName].filter(Boolean).join(" ")
                  : user.email}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          )}
        </Link>
      </div>
    </aside>
  )
}
