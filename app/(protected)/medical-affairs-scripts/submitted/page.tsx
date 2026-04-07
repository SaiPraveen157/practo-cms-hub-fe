"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ArrowRight, CheckCircle2 } from "lucide-react"

export default function MedicalAffairsScriptSubmittedPage() {
  const searchParams = useSearchParams()
  const title = searchParams.get("title")?.trim()

  return (
    <div className="flex min-h-[min(100dvh,100vh)] flex-col items-center justify-center p-6 md:p-8">
      <Card className="w-full max-w-lg border-green-600/20 bg-green-500/5 shadow-md dark:border-green-500/30 dark:bg-green-500/10">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-green-600/15 text-green-700 dark:bg-green-500/20 dark:text-green-400">
            <CheckCircle2 className="size-8" aria-hidden />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-xl font-semibold tracking-tight sm:text-2xl">
              Submitted successfully
            </CardTitle>
            <CardDescription className="text-base leading-relaxed">
              Your script has been sent to Content/Brand for review (24-hour
              TAT). You cannot edit it while it is in review.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pb-8 flex justify-center">
          <Button asChild className="w-auto" size="lg" variant="outline">
            <Link href="/medical-affairs-scripts">
              Back to scripts
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
