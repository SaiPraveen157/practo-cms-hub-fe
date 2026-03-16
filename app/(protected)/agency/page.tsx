"use client"

import Link from "next/link"
import { useAuthStore } from "@/store"
import { ROLE_LABELS } from "@/lib/role-routes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText } from "lucide-react"

export default function AgencyHomePage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="min-h-svh p-6 md:p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {ROLE_LABELS.AGENCY_POC} Dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ""}.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>
              Refine approved scripts and submit revisions for Medical Affairs review. TAT 24 hours.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You see scripts in Agency Production. Edit and submit your revision; Medical Affairs will review and can approve or send back with feedback. Once locked by Content Approver, the script is ready for production.
            </p>
            <Button asChild>
              <Link href="/agency-poc">
                <FileText className="mr-2 size-4" />
                Open production queue
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
