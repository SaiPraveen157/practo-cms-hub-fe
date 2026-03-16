"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useAuthStore } from "@/store"
import { login as loginApi, getMe } from "@/lib/auth-api"
import { getHomePathForRole } from "@/lib/role-routes"
import type { UserRole } from "@/types/auth"
import { Eye, EyeOff, Loader2 } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const token = useAuthStore((s) => s.token)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
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
      const roleHome = user?.role ? getHomePathForRole(user.role) : "/"
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
    <div className="relative flex min-h-svh flex-col md:flex-row">
      {/* Left: branding (hidden on small screens, visible from md) */}
      <div className="hidden flex-1 flex-col justify-between bg-linear-to-br from-primary/10 via-muted/50 to-background p-8 md:flex md:p-10 lg:p-14">
        <div className="max-w-md">
          <div className="mb-2 inline-flex rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            Content Management
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Practo CMS Hub
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Manage scripts, reviews, and approvals in one place. Sign in to
            access your workspace.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Test accounts use password:{" "}
          <span className="font-medium text-foreground">Admin@123</span>
        </p>
      </div>

      {/* Right: form */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 md:min-h-svh md:shrink-0 md:bg-card/50 md:px-10 lg:px-16">
        <div className="w-full max-w-[400px]">
          {/* Mobile-only header */}
          <div className="mb-8 text-center md:hidden">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Practo CMS Hub
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to continue
            </p>
          </div>

          <Card className="border-border/60 shadow-xl md:shadow-2xl">
            <CardHeader className="space-y-2 px-6 pt-8 pb-4 sm:px-8 sm:pt-10">
              <CardTitle className="text-xl font-semibold tracking-tight sm:text-2xl">
                Sign in
              </CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Enter your email and password to access your account
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-5 px-6 sm:space-y-6 sm:px-8">
                {error && (
                  <div
                    className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3.5 text-sm text-destructive"
                    role="alert"
                  >
                    {error}
                  </div>
                )}
                <div className="space-y-2.5">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    disabled={loading}
                    className="h-11 rounded-lg px-4 text-base sm:h-12"
                  />
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="password" className="text-sm font-medium">
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
                      className="h-11 rounded-lg pr-11 px-4 text-base sm:h-12"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 size-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                <Button
                  type="submit"
                  className="h-11 w-full rounded-lg text-base font-medium sm:h-12 cursor-pointer"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 size-5 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </CardContent>
            </form>
          </Card>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Use your assigned credentials. Contact your admin if you need
            access.
          </p>
        </div>
      </div>
    </div>
  )
}
