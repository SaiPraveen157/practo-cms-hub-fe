"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useAuthStore } from "@/store"
import { listScripts, getMyReviews } from "@/lib/scripts-api"
import { getScriptStatusClassName } from "@/lib/script-status-styles"
import type { Script, ScriptStatus } from "@/types/script"
import { ScriptListSkeleton } from "@/components/loading/script-list-skeleton"
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

type TabKey = "all" | "approved" | "rejected"

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

export default function ContentApproverScriptNewPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<TabKey>("all")
  const [scripts, setScripts] = useState<Script[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isContentApprover = user?.role === "CONTENT_APPROVER"

  useEffect(() => {
    if (!token) return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true)
        setError(null)
      }
    })
    if (tab === "all") {
      listScripts(token, {
        page,
        limit: PAGE_SIZE,
        status: "CONTENT_APPROVER_REVIEW",
      })
        .then((res) => {
          if (!cancelled && res.scripts) {
            setScripts(res.scripts)
            setTotal(res.total ?? 0)
            setTotalPages(res.totalPages ?? 1)
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load scripts")
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    } else {
      getMyReviews(token, {
        decision: tab === "approved" ? "APPROVED" : "REJECTED",
        page,
        limit: PAGE_SIZE,
      })
        .then((res) => {
          if (!cancelled && res.scripts) {
            setScripts(res.scripts)
            setTotal(res.total ?? 0)
            setTotalPages(res.totalPages ?? 1)
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load scripts")
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    return () => {
      cancelled = true
    }
  }, [token, tab, page])

  if (!isContentApprover) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Only Content Approver can access this queue.</p>
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
          <h1 className="text-2xl font-semibold tracking-tight">Content Approver Scripts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scripts approved by Content/Brand. Lock a script to move it to Locked; then it can be sent to Agency for production.
          </p>
        </div>

        <div className="border-b">
          <nav className="flex gap-1" role="tablist" aria-label="Script list tabs">
            {(
              [
                { key: "all" as TabKey, label: "All" },
                { key: "approved" as TabKey, label: "Approved" },
                { key: "rejected" as TabKey, label: "Rejected" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => { setTab(key); setPage(1) }}
                className={cn(
                  "border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                  tab === key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </nav>
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
              <p className="mt-4 font-medium">
                {tab === "all" && "No scripts to lock"}
                {tab === "approved" && "No scripts you approved"}
                {tab === "rejected" && "No scripts you rejected"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tab === "all" &&
                  "Scripts that have passed Content/Brand final approval will appear here."}
                {tab === "approved" &&
                  "Scripts you locked (approved) will appear here."}
                {tab === "rejected" &&
                  "Scripts you rejected will appear here."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-4">
            {scripts.map((script) => (
              <li key={script.id}>
                <Card className="overflow-hidden shadow-sm transition-shadow hover:shadow-md">
                  <CardContent className="flex flex-col gap-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/content-approver-script-new/${script.id}`}
                        className="min-w-0 flex-1 font-semibold leading-tight hover:underline"
                      >
                        {script.title || "Untitled script"}
                      </Link>
                      <Badge
                        variant="outline"
                        className={cn("shrink-0 uppercase", getScriptStatusClassName(script.status))}
                      >
                        {STATUS_LABELS[script.status]}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {script.insight || "No insight"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ready to lock · {formatDate(script.updatedAt)}
                    </p>
                    <Button variant="outline" asChild className="w-fit text-blue-600 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-blue-500/30 dark:text-blue-500 dark:hover:bg-blue-950/50 dark:hover:text-blue-400">
                      <Link href={`/content-approver-script-new/${script.id}`}>
                        Review & lock
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
            totalPages={totalPages}
            total={total}
            limit={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  )
}
