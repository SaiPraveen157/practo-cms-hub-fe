"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuthStore } from "@/store"
import { getScriptQueue, lockScript, rejectScript } from "@/lib/scripts-api"
import type { Script, ScriptStatus } from "@/types/script"
import { getScriptDisplayInfo } from "@/lib/script-status-styles"
import { ScriptDetailSkeleton } from "@/components/loading/script-detail-skeleton"
import { ScriptRejectionFeedback } from "@/components/script-rejection-feedback"
import { ScriptTatBar } from "@/components/script-tat-bar"
import { ArrowLeft, Loader2, Lock, XCircle } from "lucide-react"
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
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectComments, setRejectComments] = useState("")
  const [rejecting, setRejecting] = useState(false)

  const isContentApprover = user?.role === "CONTENT_APPROVER"
  const canLock = script?.status === "CONTENT_APPROVER_REVIEW"

  useEffect(() => {
    if (!token || !id) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getScriptQueue(token)
      .then((queueRes) => {
        if (cancelled) return
        const s = [
          ...(queueRes.available ?? []),
          ...(queueRes.myReviews ?? []),
        ].find((q) => q.id === id)
        if (!s) {
          setError("Script not found in your queue.")
          setScript(null)
          return
        }
        setScript(s)
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load script")
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
      await lockScript(token, id)
      setLockDialogOpen(false)
      toast.success("Script locked", {
        description: "Ready to send to Agency for production.",
      })
      router.push("/content-approver-script-new")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to lock"
      setError(message)
      toast.error("Could not lock script", { description: message })
    } finally {
      setLocking(false)
    }
  }

  async function handleReject() {
    if (!token || !id) return
    const comments = rejectComments.trim()
    if (!comments) {
      toast.error("Feedback required", {
        description: "Please provide feedback so Agency knows what to change.",
      })
      return
    }
    setError(null)
    setRejecting(true)
    try {
      await rejectScript(token, id, { comments })
      setRejectDialogOpen(false)
      setRejectComments("")
      toast.warning("Sent back to Agency", {
        description:
          "Script returned to Agency. They can revise and resubmit; the loop continues until approved.",
      })
      router.push("/content-approver-script-new")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reject"
      setError(message)
      toast.error("Could not send back to Agency", { description: message })
    } finally {
      setRejecting(false)
    }
  }

  if (!isContentApprover) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">
          Only Content Approver can approve or reject scripts here.
        </p>
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
                className={cn(
                  "uppercase",
                  getScriptDisplayInfo(script).className
                )}
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
                This script is not in Content Approver Review. Only scripts that
                have passed Content/Brand final approval can be approved
                (locked) or sent back to Agency.
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
              Final review. Approve (lock) to send to Agency for production, or
              send back to Agency with feedback; they can revise and resubmit
              until approved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {script.insight && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Insight
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">
                  {script.insight}
                </p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Script
              </p>
              <div
                className="mt-1 rounded-lg bg-muted/50 p-4 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:list-disc"
                dangerouslySetInnerHTML={{ __html: script.content ?? "" }}
              />
            </div>
          </CardContent>
        </Card>

        {canLock && (
          <div className="flex flex-wrap gap-2 border-t pt-6">
            <Button
              variant="outline"
              className="text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500/30 dark:text-red-500 dark:hover:bg-red-950/50 dark:hover:text-red-400"
              onClick={() => setRejectDialogOpen(true)}
            >
              <XCircle className="mr-2 size-4" />
              Send back to Agency
            </Button>
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
        <DialogContent className="gap-6 p-6 sm:max-w-lg sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Lock script
            </DialogTitle>
            <DialogDescription className="max-w-[42ch] text-sm leading-relaxed">
              The script will move to Locked. It can then be sent to Agency for
              production. This is the final step in the script workflow.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="-mx-6 -mb-6 gap-3 px-6 pb-6 sm:flex-row sm:justify-end">
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

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="gap-6 p-6 sm:max-w-lg sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Send back to Agency
            </DialogTitle>
            <DialogDescription className="max-w-[42ch] text-sm leading-relaxed">
              The script will return to Agency Production. Agency can revise and
              resubmit; the script will go through Medical Affairs and
              Content/Brand again until approved. Please provide feedback so
              Agency knows what to change. TAT 24 hours.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-comments">Feedback (required)</Label>
            <Textarea
              id="reject-comments"
              value={rejectComments}
              onChange={(e) => setRejectComments(e.target.value)}
              placeholder="e.g. Please align the closing section with brand guidelines before final lock."
              rows={4}
              className="resize-y"
              required
            />
          </div>
          <DialogFooter className="-mx-6 -mb-6 gap-3 px-6 pb-6 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={rejecting}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500/30 dark:text-red-500 dark:hover:bg-red-950/50 dark:hover:text-red-400"
              onClick={handleReject}
              disabled={rejecting || !rejectComments.trim()}
            >
              {rejecting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Reject & send feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
