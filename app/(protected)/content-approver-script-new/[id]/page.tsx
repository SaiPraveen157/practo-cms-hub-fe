"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useAuthStore } from "@/store"
import { getScript, getScriptQueue, lockScript } from "@/lib/scripts-api"
import type { Script, ScriptStatus } from "@/types/script"
import { getScriptDisplayInfo } from "@/lib/script-status-styles"
import { ScriptDetailSkeleton } from "@/components/loading/script-detail-skeleton"
import { ScriptRejectionFeedback } from "@/components/script-rejection-feedback"
import { ScriptTatBar } from "@/components/script-tat-bar"
import { ArrowLeft, Loader2, Lock } from "lucide-react"
import { cn } from "@/lib/utils"

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
    return new Date(s).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return s
  }
}

export default function ContentApproverScriptDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [script, setScript] = useState<Script | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lockDialogOpen, setLockDialogOpen] = useState(false)
  const [locking, setLocking] = useState(false)

  const isContentApprover = user?.role === "CONTENT_APPROVER"
  const canLock = script?.status === "CONTENT_APPROVER_REVIEW"

  useEffect(() => {
    if (!token || !id) return
    let cancelled = false
    setLoading(true)
    Promise.all([getScript(token, id), getScriptQueue(token)])
      .then(([scriptRes, queueRes]) => {
        if (cancelled) return
        const s = scriptRes.script
        if (!s) return
        const inQueue = [...(queueRes.available ?? []), ...(queueRes.myReviews ?? [])].find(
          (q) => q.id === id
        )
        setScript({
          ...s,
          ...(inQueue?.tat && { tat: inQueue.tat }),
          ...(inQueue?.latestRejection != null && { latestRejection: inQueue.latestRejection }),
        })
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load script")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, id])

  async function handleLock() {
    if (!token || !id) return
    setError(null)
    setLocking(true)
    try {
      const res = await lockScript(token, id)
      if (res.script) {
        setScript(res.script)
        setLockDialogOpen(false)
        toast.success("Script locked", { description: "Ready to send to Agency for production." })
        router.push("/content-approver-script-new")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to lock"
      setError(message)
      toast.error("Could not lock script", { description: message })
    } finally {
      setLocking(false)
    }
  }

  if (!isContentApprover) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">Only Content Approver can lock scripts here.</p>
        <Button variant="link" asChild className="mt-2 pl-0">
          <Link href="/content-approver-script-new">Back to queue</Link>
        </Button>
      </div>
    )
  }

  if (loading || !script) {
    return <ScriptDetailSkeleton />
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link href="/content-approver-script-new">
              <ArrowLeft className="mr-1 size-4" />
              Back to queue
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {script.title || "Untitled script"}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn("uppercase", getScriptDisplayInfo(script).className)}
              >
                {getScriptDisplayInfo(script).label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Updated {formatDate(script.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        <ScriptTatBar script={script} />

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!canLock && (
          <Card className="border-muted">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                This script is not in Content Approver Review. Only scripts that have passed Content/Brand final approval can be locked.
              </p>
              <Button asChild variant="link" className="mt-2 pl-0">
                <Link href="/content-approver-script-new">Back to queue</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Script content</CardTitle>
            <CardDescription>
              Final review. Lock the script to move it to Locked; then it can be sent to Agency for production.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {script.insight && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Insight</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{script.insight}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Script</p>
              <div
                className="mt-1 rounded-lg bg-muted/50 p-4 text-sm leading-relaxed [&_p]:mb-2 [&_ul]:list-disc [&_ol]:list-decimal [&_a]:text-primary [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: script.content ?? "" }}
              />
            </div>
          </CardContent>
        </Card>

        {canLock && (
          <div className="flex flex-wrap gap-2 border-t pt-6">
            <Button
              variant="outline"
              onClick={() => setLockDialogOpen(true)}
              className="text-blue-600 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-blue-500/30 dark:text-blue-500 dark:hover:bg-blue-950/50 dark:hover:text-blue-400"
            >
              <Lock className="mr-2 size-4" />
              Lock script
            </Button>
          </div>
        )}

        <ScriptRejectionFeedback script={script} />
      </div>

      <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
        <DialogContent className="sm:max-w-lg gap-6 p-6 sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Lock script
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed max-w-[42ch]">
              The script will move to Locked. It can then be sent to Agency for production. This is the final step in the script workflow.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-3 -mx-6 -mb-6 px-6 pb-6 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setLockDialogOpen(false)}
              disabled={locking}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleLock}
              disabled={locking}
              className="text-blue-600 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-blue-500/30 dark:text-blue-500 dark:hover:bg-blue-950/50 dark:hover:text-blue-400"
            >
              {locking && <Loader2 className="mr-2 size-4 animate-spin" />}
              Lock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
