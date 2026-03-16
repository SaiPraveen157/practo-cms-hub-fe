"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
import { getScript, getScriptQueue, approveScript, rejectScript } from "@/lib/scripts-api"
import type { Script, ScriptStatus } from "@/types/script"
import { getScriptDisplayInfo } from "@/lib/script-status-styles"
import { ScriptDetailSkeleton } from "@/components/loading/script-detail-skeleton"
import { ScriptRejectionFeedback } from "@/components/script-rejection-feedback"
import { ScriptTatBar } from "@/components/script-tat-bar"
import { ArrowLeft, CheckCircle, Loader2, XCircle } from "lucide-react"
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

export default function ContentBrandReviewerScriptPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [script, setScript] = useState<Script | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [approveComments, setApproveComments] = useState("")
  const [rejectComments, setRejectComments] = useState("")
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const isContentBrand = user?.role === "CONTENT_BRAND"
  const canReview = script?.status === "CONTENT_BRAND_REVIEW"
  const canFinalApprove = script?.status === "CONTENT_BRAND_APPROVAL"
  const canTakeAction = canReview || canFinalApprove

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

  async function handleApprove() {
    if (!token || !id) return
    setError(null)
    setApproving(true)
    try {
      const res = await approveScript(token, id, {
        comments: approveComments.trim() || undefined,
      })
      if (res.script) {
        setScript(res.script)
        setApproveDialogOpen(false)
        setApproveComments("")
        toast.success(canFinalApprove ? "Final approval sent" : "Script approved", {
          description: canFinalApprove ? "Moved to Content Approver for lock." : "Moved to Agency Production.",
        })
        router.push("/content-brand-reviewer")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to approve"
      setError(message)
      toast.error("Could not approve", { description: message })
    } finally {
      setApproving(false)
    }
  }

  async function handleReject() {
    if (!token || !id) return
    const comments = rejectComments.trim()
    if (!comments) {
      setError("Please provide feedback for the Medical Affairs team.")
      return
    }
    setError(null)
    setRejecting(true)
    try {
      const res = await rejectScript(token, id, { comments })
      if (res.script) {
        setScript(res.script)
        setRejectDialogOpen(false)
        setRejectComments("")
        toast.warning("Sent back for changes", { description: "Medical Affairs will be notified. TAT 24 hours." })
        router.push("/content-brand-reviewer")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reject"
      setError(message)
      toast.error("Could not send feedback", { description: message })
    } finally {
      setRejecting(false)
    }
  }

  if (!isContentBrand) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">Only Content/Brand can review scripts here.</p>
        <Button variant="link" asChild className="mt-2 pl-0">
          <Link href="/content-brand-reviewer">Back to review queue</Link>
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
            <Link href="/content-brand-reviewer">
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

        {!canTakeAction && (
          <Card className="border-muted">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                This script is not in a stage you can act on. It may be in Review, Final Approval, or another stage.
              </p>
              <Button asChild variant="link" className="mt-2 pl-0">
                <Link href="/content-brand-reviewer">Back to review queue</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Script content</CardTitle>
            <CardDescription>
              {canFinalApprove
                ? "Approved by Medical Affairs. Final approve to send to Content Approver for lock."
                : "Submitted by Medical Affairs for your review. Approve to send to Agency Production, or reject with feedback so they can revise and resubmit."}
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

        {canTakeAction && (
          <div className="flex flex-wrap gap-2 border-t pt-6">
            {canReview && (
              <Button
                variant="outline"
                className="text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500/30 dark:text-red-500 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                onClick={() => setRejectDialogOpen(true)}
              >
                <XCircle className="mr-2 size-4" />
                Needs changes
              </Button>
            )}
            <Button
              variant="outline"
              className="text-green-600 hover:bg-green-50 hover:text-green-700 focus-visible:ring-green-500/30 dark:text-green-500 dark:hover:bg-green-950/50 dark:hover:text-green-400"
              onClick={() => setApproveDialogOpen(true)}
            >
              <CheckCircle className="mr-2 size-4" />
              {canFinalApprove ? "Final approve" : "Approve"}
            </Button>
          </div>
        )}

        <ScriptRejectionFeedback script={script} />
      </div>

      {/* Approve dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="sm:max-w-lg gap-6 p-6 sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              {canFinalApprove ? "Final approve" : "Approve script"}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed max-w-[42ch]">
              {canFinalApprove
                ? "The script will move to Content Approver Review. Content Approver can then lock it for production. You can add optional comments."
                : "The script will move to Agency Production. Medical Affairs will no longer edit this version. You can add optional comments for the record."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="approve-comments">Comments (required)</Label>
            <Textarea
              id="approve-comments"
              value={approveComments}
              onChange={(e) => setApproveComments(e.target.value)}
              placeholder="e.g. Script looks good. Sending to Agency for production."
              rows={3}
              className="resize-y"
            />
          </div>
          <DialogFooter className="gap-3 -mx-6 -mb-6 px-6 pb-6 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setApproveDialogOpen(false)}
              disabled={approving}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleApprove}
              disabled={approving}
              className="text-green-600 hover:bg-green-50 hover:text-green-700 focus-visible:ring-green-500/30 dark:text-green-500 dark:hover:bg-green-950/50 dark:hover:text-green-400"
            >
              {approving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-lg gap-6 p-6 sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Send back for changes
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed max-w-[42ch]">
              The script will return to Draft. Medical Affairs will be notified and can revise and resubmit. Please provide feedback so they know what to change. TAT 24 hours.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-comments">Feedback (required)</Label>
            <Textarea
              id="reject-comments"
              value={rejectComments}
              onChange={(e) => setRejectComments(e.target.value)}
              placeholder="e.g. Script needs more clarity on the medication section. Please revise."
              rows={4}
              className="resize-y"
              required
            />
          </div>
          <DialogFooter className="gap-3 -mx-6 -mb-6 px-6 pb-6 sm:flex-row sm:justify-end">
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
