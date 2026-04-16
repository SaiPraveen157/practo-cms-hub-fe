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
import type { Script, ScriptComment, ScriptFeedbackSticker } from "@/types/script"
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
import { ArrowLeft, Loader2, Lock, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

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
  const [feedbackStickers, setFeedbackStickers] = useState<
    Record<string, ScriptFeedbackSticker>
  >({})

  const isContentApprover = user?.role === "CONTENT_APPROVER"
  const canLock = script?.status === "CONTENT_APPROVER_REVIEW"

  const hasPendingStickerComments = useMemo(() => {
    if (!canLock) return false
    return Object.values(feedbackStickers).some((s) => s.resolved !== true)
  }, [feedbackStickers, canLock])

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

  const commentsApiActive = Boolean(token && id && canLock)

  const versionView = useScriptStickerVersionView({
    token,
    scriptId: id,
    enabled: Boolean(isContentApprover && token && id && commentsApiActive),
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

  async function handleLock() {
    if (!token || !id) return
    if (hasPendingStickerComments) {
      toast.error("Resolve or remove all inline comments first", {
        description:
          "Mark each comment thread as resolved in the editor, or delete it, before locking.",
      })
      return
    }
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

  const editorDisp = getVersionedScriptEditorDisplay(
    versionView,
    script.content ?? "",
    feedbackStickers
  )

  return (
    <div className="min-w-0 overflow-x-hidden px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl min-w-0 space-y-6">
        <div className="space-y-4">
          <Button variant="ghost" size="sm" className="-ml-1 sm:-ml-2" asChild>
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

        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Script content</CardTitle>
            <CardDescription>
              {canLock
                ? "Final review. Use inline comments for specific feedback; resolve or remove each thread before locking. Lock to finalize the script for production, or reject to send it back to Agency with a required reason."
                : "Final review. Lock to send to Agency for production, or reject with feedback when the script is in your queue."}
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 space-y-4 overflow-x-hidden">
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
            <div className="min-w-0 space-y-2">
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
                id="ca-version-select"
              />
              {editorDisp.mode === "loading" ? (
                <div className="flex min-h-[min(480px,55vh)] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
              ) : editorDisp.mode === "error" ? (
                <p className="text-sm text-destructive">{editorDisp.message}</p>
              ) : (
                <>
                  {editorDisp.mode === "snapshot" && editorDisp.contentMissing ? (
                    <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      Script content for this version was not archived (legacy
                      data). Comments still appear in the sidebar.
                    </p>
                  ) : null}
                  <ScriptRichTextEditor
                    key={`${script.id}-ca-${versionView.selectValue || "live"}-${script.updatedAt}`}
                    initialContent={
                      editorDisp.mode === "live"
                        ? script.content ?? ""
                        : editorDisp.html
                    }
                    minHeight="min(480px, 55vh)"
                    className="mt-1"
                    hideInlineCommentPresentation={
                      editorDisp.mode === "live"
                    }
                    stickerPermissionContext={
                      editorDisp.mode === "live"
                        ? stickerPermissionContext
                        : undefined
                    }
                    {...(editorDisp.mode !== "live"
                      ? {
                          disabled: true,
                          feedbackStickers: editorDisp.stickers,
                          feedbackCommentsSidebar: true,
                          commentsSidebarEmptyHint:
                            "No comments on this version snapshot.",
                        }
                      : canLock
                        ? {
                            feedbackStickers: editorDisp.stickers,
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
                            feedbackStickers: editorDisp.stickers,
                            feedbackCommentsSidebar: false,
                          })}
                  />
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {canLock && (
          <div className="w-full min-w-0 space-y-3 border-t border-border pt-6">
            {hasPendingStickerComments ? (
              <p className="text-sm text-amber-800 dark:text-amber-200/90">
                You have open inline comments. Resolve or delete each one in the
                editor before you can lock the script.
              </p>
            ) : null}
            <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                variant="outline"
                className="w-full shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500/30 sm:w-auto dark:text-red-500 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                onClick={() => setRejectDialogOpen(true)}
                disabled={versionView.isViewingSnapshot}
                title={
                  versionView.isViewingSnapshot
                    ? "Select the current version in the dropdown to reject"
                    : undefined
                }
              >
                <XCircle className="mr-2 size-4" />
                Reject
              </Button>
              <Button
                variant="outline"
                onClick={() => setLockDialogOpen(true)}
                disabled={
                  hasPendingStickerComments || versionView.isViewingSnapshot
                }
                className="w-full shrink-0 text-green-600 hover:bg-green-50 hover:text-green-700 focus-visible:ring-green-500/30 sm:w-auto dark:text-green-500 dark:hover:bg-green-950/50 dark:hover:text-green-400"
                title={
                  versionView.isViewingSnapshot
                    ? "Select the current version in the dropdown to lock"
                    : hasPendingStickerComments
                      ? "Resolve or remove all open inline comments before locking"
                      : undefined
                }
              >
                <Lock className="mr-2 size-4" />
                Lock script
              </Button>
            </div>
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
            {canLock && hasPendingStickerComments ? (
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200/90">
                Lock is blocked until every inline comment is resolved or
                removed.
              </p>
            ) : null}
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
              disabled={locking || hasPendingStickerComments}
              className="text-green-600 hover:bg-green-50 hover:text-green-700 focus-visible:ring-green-500/30 dark:text-green-500 dark:hover:bg-green-950/50 dark:hover:text-green-400"
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
              Reject — send back to Agency
            </DialogTitle>
            <DialogDescription className="max-w-[42ch] text-sm leading-relaxed">
              The script will return to Agency Production. Agency can revise and
              resubmit; the script will go through Medical Affairs and
              Content/Brand again until approved. Please provide feedback so
              Agency knows what to change. TAT 24 hours.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-comments">Rejection reason (required)</Label>
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
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
