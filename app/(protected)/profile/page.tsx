"use client"

import Link from "next/link"
import { useAuthStore } from "@/store"
import { ROLE_LABELS } from "@/lib/role-routes"
import type { UserRole } from "@/types/auth"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowLeft } from "lucide-react"

function getInitials(firstName: string, lastName: string, email: string) {
  if (firstName && lastName)
    return `${firstName[0]}${lastName[0]}`.toUpperCase()
  if (firstName) return firstName.slice(0, 2).toUpperCase()
  if (email) return email.slice(0, 2).toUpperCase()
  return "U"
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 py-5 first:pt-0 last:pb-0">
      <dt className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-base leading-relaxed text-foreground">{value}</dd>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-1">
      <h2 className="text-sm font-medium tracking-wider text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="min-h-svh p-8 md:p-10 lg:p-12">
      <div className="mx-auto max-w-3xl">
        <Button variant="ghost" size="sm" className="mb-8 -ml-2" asChild>
          <Link href="/">
            <ArrowLeft className="mr-1 size-4" />
            Back
          </Link>
        </Button>

        <div className="space-y-12 md:space-y-16">
          {/* Hero / identity block */}
          <div className="flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:gap-10">
            <div className="size-24 shrink-0 md:size-28">
              <Avatar className="size-full! ring-2 ring-border" size="lg">
                <AvatarFallback className="text-2xl md:text-3xl">
                  {user
                    ? getInitials(user.firstName, user.lastName, user.email)
                    : "?"}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="min-w-0 space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                {user
                  ? [user.firstName, user.lastName].filter(Boolean).join(" ") ||
                    user.email ||
                    "Account"
                  : "Account"}
              </h1>
              <p className="text-base text-muted-foreground md:text-lg">
                {user?.email ?? "—"}
              </p>
              {user && (
                <p className="text-sm text-muted-foreground">
                  {ROLE_LABELS[user.role as UserRole] ?? user.role} ·{" "}
                  {user.status}
                </p>
              )}
            </div>
          </div>

          {user ? (
            <div className="border-t border-border pt-10 md:pt-14">
              <Section title="Identity">
                <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:gap-x-16 md:gap-y-6">
                  <DetailRow
                    label="Name"
                    value={
                      [user.firstName, user.lastName]
                        .filter(Boolean)
                        .join(" ") || "—"
                    }
                  />
                  <DetailRow
                    label="Email"
                    value={<span className="break-all">{user.email}</span>}
                  />
                  <DetailRow
                    label="Role"
                    value={ROLE_LABELS[user.role as UserRole] ?? user.role}
                  />
                  <DetailRow label="Status" value={user.status ?? "ACTIVE"} />
                </dl>
              </Section>
            </div>
          ) : (
            <p className="border-t border-border pt-10 text-muted-foreground md:pt-14">
              No user data available. Sign in again if needed.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
