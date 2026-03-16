"use client"

import { useAuthStore } from "@/store"
import { ROLE_LABELS } from "@/lib/role-routes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function MedicalAffairsHomePage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="min-h-svh p-6 md:p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {ROLE_LABELS.MEDICAL_AFFAIRS} Dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ""}.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>
              Create scripts, submit for Content/Brand review, and review Agency revisions.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You can create new scripts (title, insight, content), submit drafts for review, and approve or reject Agency revisions at the Medical Review stage.
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
