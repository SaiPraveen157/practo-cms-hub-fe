"use client"

import { useRouter, usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { useAuthStore } from "@/store"

const LOGIN_PATH = "/login"

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const token = useAuthStore((s) => s.token)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const id = setTimeout(() => {
      const currentToken = useAuthStore.getState().token
      if (!currentToken) {
        const redirect = encodeURIComponent(pathname || "/")
        router.replace(`${LOGIN_PATH}?redirect=${redirect}`)
      }
    }, 0)
    return () => clearTimeout(id)
  }, [mounted, token, pathname, router])

  if (!mounted) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!token) {
    return null
  }

  return <>{children}</>
}
