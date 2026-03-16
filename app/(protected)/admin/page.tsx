"use client"

import { useAuthStore } from "@/store"
import { ROLE_LABELS } from "@/lib/role-routes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function AdminHomePage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="min-h-svh p-6 md:p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {ROLE_LABELS.SUPER_ADMIN} Dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ""}.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>
              Manage users, view all scripts across statuses, and unlock scripts in emergencies.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            From here you can access user management, audit logs, and full script visibility.
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
