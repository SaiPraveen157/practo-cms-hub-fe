"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { forgotPassword } from "@/lib/auth-api"
import { ArrowLeft, Loader2 } from "lucide-react"
import { GsapFadeIn } from "@/components/motion"

const LOGIN_BG_IMAGE = "/HomeBackground.jpg"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await forgotPassword(email)
      setSubmitted(true)
      const message =
        res.message ?? "If the email exists, a reset link has been sent."
      toast.success("Email sent", { description: message })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed"
      setError(message)
      toast.error("Could not send reset link", { description: message })
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
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
          <GsapFadeIn>
            <div className="rounded-2xl p-8  sm:p-10">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                Check your email
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                If an account exists for <strong>{email}</strong>, we’ve sent a
                link to reset your password.
              </p>
            </div>
            <Link href="/login">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-lg border-gray-300 bg-white text-base font-medium text-gray-800 hover:bg-gray-50"
              >
                <ArrowLeft className="mr-2 size-5" />
                Back to Log In
              </Button>
            </Link>
            </div>
          </GsapFadeIn>
        </div>
      </div>
    )
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
        <GsapFadeIn>
          <div className="rounded-2xl  sm:p-10">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Forgot Password
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Enter your email and we’ll send you a link to reset your password.
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

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-lg bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-base font-semibold text-white shadow-md transition-opacity hover:opacity-95 cursor-pointer border-0"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-5 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send reset link"
              )}
            </Button>
          </form>

          <p className="mt-6 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              <ArrowLeft className="size-4" />
              Back to Log In
            </Link>
          </p>
          </div>
        </GsapFadeIn>
      </div>
    </div>
  )
}
