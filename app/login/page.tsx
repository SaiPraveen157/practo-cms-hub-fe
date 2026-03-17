"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useAuthStore } from "@/store"
import { login as loginApi, getMe } from "@/lib/auth-api"
import { getHomePathForRole } from "@/lib/role-routes"
import type { UserRole } from "@/types/auth"
import { Eye, EyeOff, Loader2 } from "lucide-react"


const LOGIN_BG_IMAGE = "/HomeBackground.jpg"

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const token = useAuthStore((s) => s.token)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!token) return
    const roleHome = user?.role ? getHomePathForRole(user.role as UserRole) : "/"
    router.replace(roleHome)
  }, [token, user?.role, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await loginApi({ email, password })
      if (!res.token) throw new Error("No token received")
      let user = res.user ?? null
      if (!user) {
        try {
          user = await getMe(res.token)
        } catch {
          // optional: store token only, user can be fetched later
        }
      }
      setAuth(res.token, user)
      toast.success("Login successful", { description: "Redirecting to your dashboard." })
      const roleHome = user?.role ? getHomePathForRole(user.role as UserRole) : "/"
      router.replace(roleHome)
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed"
      setError(message)
      toast.error("Login failed", { description: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-12"
      style={{
        backgroundImage: `url(${LOGIN_BG_IMAGE})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#e5e7eb",
      }}
    >

      <div className="relative z-10 w-full max-w-[460px]">
        <div className="rounded-2xl bg-transparent p-8 sm:p-10">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Welcome Back
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Sign in to continue to your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-800">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="medical.affairs@practo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={loading}
                className="h-11 rounded-lg border-gray-300 bg-gray-50/80 px-4 text-base focus:border-blue-500 focus:ring-blue-500/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-800">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  className="h-11 rounded-lg border-gray-300 bg-gray-50/80 pr-11 px-4 text-base focus:border-blue-500 focus:ring-blue-500/20"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 size-9 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="size-5" />
                  ) : (
                    <Eye className="size-5" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                  className="size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500/20"
                />
                <span className="text-sm text-gray-700">Remember me</span>
              </label>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
              >
                Forgot Password?
              </Link>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-lg bg-gradient-to-r from-[#518dcd] to-[#7ac0ca] text-base font-semibold text-white shadow-md transition-opacity hover:opacity-95 cursor-pointer border-0"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-5 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Log In"
              )}
            </Button>
          </form>

          <div className="relative my-8 flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200" />
            <span className="text-sm text-gray-500">OR</span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-12 w-full rounded-lg border-gray-300 bg-white text-base font-medium text-gray-800 hover:bg-gray-50 cursor-pointer"
            disabled
          >
            <svg className="mr-2 size-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </Button>
        </div>

        {/* <p className="mt-6 text-center text-sm text-white/90 drop-shadow-sm">
          Use your assigned credentials. Contact your admin if you need access.
        </p> */}
      </div>
    </div>
  )
}
