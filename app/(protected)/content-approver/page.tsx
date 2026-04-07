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
import { ShieldCheck } from "lucide-react"

export default function ContentApproverHomePage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="min-h-svh p-6 md:p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {ROLE_LABELS.CONTENT_APPROVER} Dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ""}.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>
              Final sign-off: lock scripts so they can be sent to Agency for
              production.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You see scripts in Content Approver Review (approved by
              Content/Brand). Lock a script to move it to Locked; then the
              Agency can use it for production.
            </p>
            <Button
              asChild
              className="border-0 bg-gradient-to-r from-[#518dcd] to-[#7ac0ca] text-white hover:opacity-90"
            >
              <Link href="/content-approver-script-new">
                <ShieldCheck className="mr-2 size-4" />
                Open script queue
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
