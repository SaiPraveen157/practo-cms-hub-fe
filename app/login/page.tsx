"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useAuthStore } from "@/store"
import { login as loginApi, loginWithGoogle, getMe } from "@/lib/auth-api"
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
  const [loadingGoogle, setLoadingGoogle] = useState(false)

  const user = useAuthStore((s) => s.user)

  const handleGoogleCredential = useCallback(
    async (idToken: string) => {
      setError(null)
      setLoadingGoogle(true)
      try {
        const res = await loginWithGoogle(idToken)
        if (!res.token) throw new Error("No token received")
        let userData = res.user ?? null
        if (!userData) {
          try {
            userData = await getMe(res.token)
          } catch {
            // optional
          }
        }
        setAuth(res.token, userData)
        toast.success("Login successful", { description: "Redirecting to your dashboard." })
        const roleHome = userData?.role ? getHomePathForRole(userData.role as UserRole) : "/"
        router.replace(roleHome)
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : "Google sign-in failed"
        setError(message)
        toast.error("Google sign-in failed", { description: message })
      } finally {
        setLoadingGoogle(false)
      }
    },
    [setAuth, router]
  )

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""

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
    <GoogleOAuthProvider clientId={googleClientId}>
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
                className="h-11 rounded-lg border-gray-300 bg-gray-50/80 px-4 text-black focus:border-blue-500 focus:ring-blue-500/20"
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
                  className="h-11 rounded-lg border-gray-300 bg-gray-50/80 pr-11 px-4 text-black focus:border-blue-500 focus:ring-blue-500/20"
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
              className="h-12 w-full rounded-lg bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-base font-semibold text-white shadow-md transition-opacity hover:opacity-95 cursor-pointer border-0"
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

          <div className="flex flex-col items-center gap-2">
            {loadingGoogle && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="size-4 animate-spin" />
                Signing in with Google…
              </div>
            )}
            <GoogleLogin
              onSuccess={(credentialResponse) => {
                const token = credentialResponse.credential
                if (token) void handleGoogleCredential(token)
              }}
              onError={() => {
                setError("Google sign-in was cancelled or failed")
                toast.error("Google sign-in failed")
              }}
              theme="outline"
              size="large"
              text="continue_with"
              width="100%"
              shape="rectangular"
            />
          </div>
        </div>

        {/* <p className="mt-6 text-center text-sm text-white/90 drop-shadow-sm">
          Use your assigned credentials. Contact your admin if you need access.
        </p> */}
        </div>
      </div>
    </GoogleOAuthProvider>
  )
}
