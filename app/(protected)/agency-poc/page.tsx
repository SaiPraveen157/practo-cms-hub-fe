"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useAuthStore } from "@/store"
import { getScriptQueue } from "@/lib/scripts-api"
import { getScriptDisplayInfo } from "@/lib/script-status-styles"
import type { Script, ScriptStatus } from "@/types/script"
import { ScriptListSkeleton } from "@/components/loading/script-list-skeleton"
import { ScriptTatBar } from "@/components/script-tat-bar"
import { ScriptListPagination } from "@/components/ui/pagination"
import { FileText } from "lucide-react"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10

const STATUS_LABELS: Record<ScriptStatus, string> = {
  DRAFT: "Draft",
  CONTENT_BRAND_REVIEW: "Content/Brand Review",
  AGENCY_PRODUCTION: "Agency Production",
  MEDICAL_REVIEW: "Medical Review",
  CONTENT_BRAND_APPROVAL: "Content/Brand Approval",
  CONTENT_APPROVER_REVIEW: "Content Approver Review",
  LOCKED: "Locked",
}

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return s
  }
}

export default function AgencyPocPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [scripts, setScripts] = useState<Script[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isAgencyPoc = user?.role === "AGENCY_POC"

  const displayedScripts = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return scripts.slice(start, start + PAGE_SIZE)
  }, [page, scripts])

  const paginationTotalPages = Math.max(1, Math.ceil(scripts.length / PAGE_SIZE))

  useEffect(() => {
    if (!token) return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true)
        setError(null)
      }
    })
    getScriptQueue(token)
      .then((res) => {
        if (!cancelled) {
          const combined = [...(res.available ?? []), ...(res.myReviews ?? [])]
          setScripts(combined)
          setTotal(res.total ?? combined.length)
          setTotalPages(Math.max(1, Math.ceil((res.total ?? combined.length) / PAGE_SIZE)))
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load scripts")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (!isAgencyPoc) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Only Agency POC can access this queue.</p>
            <Button variant="outline" className="mt-4" onClick={() => router.back()}>
              Go back
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agency Production</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scripts approved by Content/Brand. Edit and submit your revision for Medical Affairs review. TAT 24 hours. Email will be sent to mapped Medical Affairs IDs.
          </p>
        </div>

        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <ScriptListSkeleton />
        ) : scripts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="size-12 text-muted-foreground" />
              <p className="mt-4 font-medium">No scripts in production</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Scripts approved by Content/Brand will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-4">
            {displayedScripts.map((script) => (
              <li key={script.id}>
                <Card className="overflow-hidden shadow-sm transition-shadow hover:shadow-md">
                  <CardContent className="flex flex-col gap-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/agency-poc/${script.id}`}
                        className="min-w-0 flex-1 font-semibold leading-tight hover:underline"
                      >
                        {script.title || "Untitled script"}
                      </Link>
                      <Badge
                        variant="outline"
                        className={cn("shrink-0 uppercase", getScriptDisplayInfo(script).className)}
                      >
                        {getScriptDisplayInfo(script).label}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {script.insight || "No insight"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sent for production · {formatDate(script.updatedAt)}
                    </p>
                    <ScriptTatBar script={script} />
                    <Button asChild className="w-fit">
                      <Link href={`/agency-poc/${script.id}`}>
                        Edit & submit revision
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {!loading && scripts.length > 0 && (
          <ScriptListPagination
            page={page}
            totalPages={paginationTotalPages}
            total={scripts.length}
            limit={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  )
}
