"use client"

import Link from "next/link"
import { useAuthStore } from "@/store"
import { ROLE_LABELS } from "@/lib/role-routes"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText } from "lucide-react"

export default function ContentBrandHomePage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="min-h-svh p-6 md:p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {ROLE_LABELS.CONTENT_BRAND} Dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ""}.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>
              Review and approve scripts from Medical Affairs, and give final
              approval before Content Approver locks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You see scripts in Content/Brand Review and Content/Brand
              Approval. Approve to send to Agency or to Content Approver; reject
              to send back with feedback. TAT 24 hours.
            </p>
            <Button
              asChild
              className="border-0 bg-gradient-to-r from-[#518dcd] to-[#7ac0ca] text-white hover:opacity-90"
            >
              <Link href="/content-brand-reviewer">
                <FileText className="mr-2 size-4" />
                Open review queue
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
