"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/store"
import { getHomePathForRole } from "@/lib/role-routes"
import type { UserRole } from "@/types/auth"

export default function ProtectedHomeRedirect() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    const roleHome = user?.role ? getHomePathForRole(user.role as UserRole) : "/admin"
    router.replace(roleHome)
  }, [user?.role, router])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Redirecting…</p>
    </div>
  )
}
