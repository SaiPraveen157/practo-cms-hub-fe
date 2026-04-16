"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
import { getScriptQueue, approveScript, rejectScript } from "@/lib/scripts-api"
import type {
  Script,
  ScriptComment,
  ScriptFeedbackSticker,
  ScriptStatus,
} from "@/types/script"
import { ScriptRichTextEditor } from "@/components/script-rich-text-editor"
import {
  recordFromStickerArray,
  scriptCommentsListFromScript,
} from "@/lib/feedback-sticker-sync"
import { useScriptCommentsRemoteSync } from "@/hooks/use-script-comments-remote-sync"
import { getScriptDisplayInfo } from "@/lib/script-status-styles"
import { ScriptDetailSkeleton } from "@/components/loading/script-detail-skeleton"
import { ScriptRejectionFeedback } from "@/components/script-rejection-feedback"
import { ScriptTatBar } from "@/components/script-tat-bar"
import { ScriptStickerVersionToolbar } from "@/components/script-sticker-version-toolbar"
import { useScriptStickerVersionView } from "@/hooks/use-script-sticker-version-view"
import { getVersionedScriptEditorDisplay } from "@/lib/script-sticker-version-editor-display"
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
  const [feedbackStickers, setFeedbackStickers] = useState<
    Record<string, ScriptFeedbackSticker>
  >({})

  const isContentBrand = user?.role === "CONTENT_BRAND"
  const canReview = script?.status === "CONTENT_BRAND_REVIEW"
  const canFinalApprove = script?.status === "CONTENT_BRAND_APPROVAL"
  const canTakeAction = canReview || canFinalApprove

  /** Open stickers gate approval whenever Brand must clear threads before approve. */
  const hasPendingStickerComments = useMemo(() => {
    if (!canReview && !canFinalApprove) return false
    return Object.values(feedbackStickers).some((s) => s.resolved !== true)
  }, [feedbackStickers, canReview, canFinalApprove])

  const onCommentsMergedFromApi = useCallback(
    (list: ScriptFeedbackSticker[]) => {
      setFeedbackStickers(recordFromStickerArray(list))
    },
    []
  )

  const onAfterCommentMutation = useCallback((c: ScriptComment) => {
    setFeedbackStickers((prev) => ({
      ...prev,
      [c.id]: { ...prev[c.id], ...c },
    }))
  }, [])

  const stickerPermissionContext = script
    ? {
        scriptStatus: script.status,
        currentUserId: user?.id ?? null,
        currentUserRole: user?.role ?? null,
      }
    : null

  const commentsApiActive = Boolean(
    token && id && (canReview || canFinalApprove)
  )

  const versionView = useScriptStickerVersionView({
    token,
    scriptId: id,
    enabled: Boolean(isContentBrand && token && id && commentsApiActive),
    refreshKey: script?.version,
  })

  const { notifyStickersChanged, syncBaseline } = useScriptCommentsRemoteSync({
    token,
    scriptId: id,
    fetchEnabled: commentsApiActive,
    pushEnabled: commentsApiActive,
    commentsRefetchKey: script?.version,
    onMergeFromServer: onCommentsMergedFromApi,
    onAfterCommentMutation,
  })

  const handleFeedbackStickersChange = useCallback(
    (next: Record<string, ScriptFeedbackSticker>) => {
      setFeedbackStickers(next)
      notifyStickersChanged(next)
    },
    [notifyStickersChanged]
  )

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
        const stickerMap = recordFromStickerArray(
          scriptCommentsListFromScript(s)
        )
        setFeedbackStickers(stickerMap)
        syncBaseline(stickerMap)
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
  }, [token, id, syncBaseline])

  async function handleApprove() {
    if (!token || !id) return
    if (hasPendingStickerComments) {
      toast.error("Resolve or remove all inline comments first", {
        description:
          "Mark each comment thread as resolved in the editor, or delete it, before approving.",
      })
      return
    }
    setError(null)
    setApproving(true)
    try {
      await approveScript(token, id, {
        comments: approveComments.trim() || undefined,
      })
      setApproveDialogOpen(false)
      setApproveComments("")
      toast.success(
        canFinalApprove ? "Final approval sent" : "Script approved",
        {
          description: canFinalApprove
            ? "Moved to Content Approver for lock."
            : "Moved to Agency Production.",
        }
      )
      router.push("/content-brand-reviewer")
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
      setError(
        canFinalApprove
          ? "Rejection reason is required so Agency knows what to fix."
          : "Please provide feedback for the Medical Affairs team."
      )
      return
    }
    setError(null)
    setRejecting(true)
    try {
      await rejectScript(token, id, { comments })
      setRejectDialogOpen(false)
      setRejectComments("")
      if (canFinalApprove) {
        toast.warning("Sent back to Agency", {
          description:
            "Script is now in Agency Production. Agency can revise and resubmit. TAT 24 hours.",
        })
      } else {
        toast.warning("Sent back for changes", {
          description: "Medical Affairs will be notified. TAT 24 hours.",
        })
      }
      router.push("/content-brand-reviewer")
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
        <p className="text-muted-foreground">
          Only Content/Brand can review scripts here.
        </p>
        <Button variant="link" asChild className="mt-2 pl-0">
          <Link href="/content-brand-reviewer">Back to review queue</Link>
        </Button>
      </div>
    )
  }

  if (loading || !script) {
    return <ScriptDetailSkeleton />
  }

  const brandViewDisp = getVersionedScriptEditorDisplay(
    versionView,
    script.content ?? "",
    feedbackStickers
  )

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
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

        {!canTakeAction && (
          <Card className="border-muted">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                This script is not in a stage you can act on. It may be in
                Review, Final Approval, or another stage.
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
                ? "Approved by Medical Affairs. Use inline comments for specific feedback; resolve or remove each thread before approving. Approve to send to Content Approver for lock, or reject to return the script to Agency Production with a required reason. Optional notes can be added in the approve dialog."
                : canTakeAction
                  ? "Submitted by Medical Affairs for your review. Use inline comments on the script for specific feedback; approve to send to Agency Production, or reject with a summary so they can revise and resubmit."
                  : "Submitted by Medical Affairs for your review. Approve to send to Agency Production, or reject with feedback so they can revise and resubmit."}
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
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Script
              </p>
              {versionView.listError ? (
                <p className="text-xs text-destructive">{versionView.listError}</p>
              ) : null}
              <ScriptStickerVersionToolbar
                showToolbar={versionView.showToolbar}
                listLoading={versionView.listLoading}
                selectValue={versionView.selectValue}
                onSelectValueChange={versionView.onSelectValueChange}
                versionOptions={versionView.versionOptions}
                isViewingSnapshot={versionView.isViewingSnapshot}
                snapshotLoading={versionView.snapshotLoading}
                id="cb-version-select"
              />
              {brandViewDisp.mode === "loading" ? (
                <div className="flex min-h-[min(480px,55vh)] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
              ) : brandViewDisp.mode === "error" ? (
                <p className="text-sm text-destructive">{brandViewDisp.message}</p>
              ) : (
                <>
                  {brandViewDisp.mode === "snapshot" &&
                  brandViewDisp.contentMissing ? (
                    <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      Script content for this version was not archived (legacy
                      data). Comments still appear in the sidebar.
                    </p>
                  ) : null}
                  <ScriptRichTextEditor
                    key={`${script.id}-cb-${versionView.selectValue || "live"}-${script.updatedAt}`}
                    initialContent={
                      brandViewDisp.mode === "live"
                        ? script.content ?? ""
                        : brandViewDisp.html
                    }
                    minHeight="min(480px, 55vh)"
                    className="mt-1"
                    hideInlineCommentPresentation={
                      brandViewDisp.mode === "live" && !canTakeAction
                    }
                    stickerPermissionContext={
                      brandViewDisp.mode === "live"
                        ? stickerPermissionContext
                        : undefined
                    }
                    {...(brandViewDisp.mode !== "live"
                      ? {
                          disabled: true,
                          feedbackStickers: brandViewDisp.stickers,
                          feedbackCommentsSidebar: true,
                          commentsSidebarEmptyHint:
                            "No comments on this version snapshot.",
                        }
                      : canTakeAction
                        ? {
                            feedbackStickers: brandViewDisp.stickers,
                            feedbackCommentsSidebar: true,
                            commentsSidebarEmptyHint: "No comments available.",
                            contentReadOnly: true,
                            onFeedbackStickersChange:
                              handleFeedbackStickersChange,
                            feedbackStickerToolbar: true,
                            feedbackStickerAuthorId: user?.id ?? null,
                          }
                        : {
                            disabled: true,
                            feedbackStickers: brandViewDisp.stickers,
                            feedbackCommentsSidebar: false,
                          })}
                  />
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {canTakeAction && (
          <div className="space-y-3 border-t pt-6">
            {hasPendingStickerComments ? (
              <p className="text-sm text-amber-800 dark:text-amber-200/90">
                You have open inline comments. Resolve or delete each one in the
                editor before you can approve.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {(canReview || canFinalApprove) && (
                <Button
                  variant="outline"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500/30 dark:text-red-500 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                  onClick={() => setRejectDialogOpen(true)}
                  disabled={versionView.isViewingSnapshot}
                  title={
                    versionView.isViewingSnapshot
                      ? "Select the current version in the dropdown to reject"
                      : undefined
                  }
                >
                  <XCircle className="mr-2 size-4" />
                  {canFinalApprove ? "Reject" : "Needs changes"}
                </Button>
              )}
              <Button
                variant="outline"
                className="text-green-600 hover:bg-green-50 hover:text-green-700 focus-visible:ring-green-500/30 dark:text-green-500 dark:hover:bg-green-950/50 dark:hover:text-green-400"
                onClick={() => setApproveDialogOpen(true)}
                disabled={
                  hasPendingStickerComments || versionView.isViewingSnapshot
                }
                title={
                  versionView.isViewingSnapshot
                    ? "Select the current version in the dropdown to approve"
                    : hasPendingStickerComments
                      ? "Resolve or remove all open inline comments before approving"
                      : undefined
                }
              >
                <CheckCircle className="mr-2 size-4" />
                Approve
              </Button>
            </div>
          </div>
        )}

        <ScriptRejectionFeedback script={script} />
      </div>

      {/* Approve dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="gap-6 p-6 sm:max-w-lg sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              {/* {canFinalApprove ? "Final approve" : "Approve script"} */}
              Approve
            </DialogTitle>
            <DialogDescription className="max-w-[42ch] text-sm leading-relaxed">
              {canFinalApprove
                ? "The script will move to Content Approver Review. Content Approver can then lock it for production. You can add optional comments."
                : "The script will move to Agency Production. Medical Affairs will no longer edit this version. You can add optional comments for the record."}
            </DialogDescription>
            {canTakeAction && hasPendingStickerComments ? (
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200/90">
                Approve is blocked until every inline comment is resolved or
                removed.
              </p>
            ) : null}
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="approve-comments">Comments (optional)</Label>
            <Textarea
              id="approve-comments"
              value={approveComments}
              onChange={(e) => setApproveComments(e.target.value)}
              placeholder="e.g. Script looks good. Sending to Agency for production."
              rows={3}
              className="resize-y"
            />
          </div>
          <DialogFooter className="-mx-6 -mb-6 gap-3 px-6 pb-6 sm:flex-row sm:justify-end">
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
              disabled={approving || hasPendingStickerComments}
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
        <DialogContent className="gap-6 p-6 sm:max-w-lg sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              {canFinalApprove
                ? "Reject — send back to Agency"
                : "Send back for changes"}
            </DialogTitle>
            <DialogDescription className="max-w-[42ch] text-sm leading-relaxed">
              {canFinalApprove ? (
                <>
                  The script will move to Agency Production. Agency can fix and
                  resubmit; it will go through Medical Affairs and Content/Brand
                  again. Enter a rejection reason below (required). TAT 24 hours.
                </>
              ) : (
                <>
                  The script will return to Draft. Medical Affairs will be
                  notified and can revise and resubmit. Add inline comments in
                  the script above for specific passages, and summarize below so
                  they know what to change. TAT 24 hours.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-comments">
              {canFinalApprove ? "Rejection reason (required)" : "Feedback (required)"}
            </Label>
            <Textarea
              id="reject-comments"
              value={rejectComments}
              onChange={(e) => setRejectComments(e.target.value)}
              placeholder={
                canFinalApprove
                  ? "e.g. Agency needs to fix the medical claims section before final approval."
                  : "e.g. Script needs more clarity on the medication section. Please revise."
              }
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
              {canFinalApprove ? "Reject" : "Reject & send feedback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
