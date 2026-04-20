"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScriptRichTextEditor } from "@/components/script-rich-text-editor"
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
import { SCRIPT_TITLE_REQUIRED_MESSAGE } from "@/lib/script-title"
import { useAuthStore } from "@/store"
import {
  getScriptQueue,
  updateScript,
  submitScript,
  approveScript,
  rejectScript,
} from "@/lib/scripts-api"
import type {
  Script,
  ScriptComment,
  ScriptFeedbackSticker,
  ScriptStatus,
} from "@/types/script"
import {
  mergeStickersFromQueuePayload,
  recordFromStickerArray,
  scriptCommentsListFromScript,
} from "@/lib/feedback-sticker-sync"
import { useScriptCommentsRemoteSync } from "@/hooks/use-script-comments-remote-sync"
import type { ScriptCommentsMergeMeta } from "@/hooks/use-script-comments-remote-sync"
import {
  getScriptDisplayInfo,
  scriptIsInRejectedState,
} from "@/lib/script-status-styles"
import { ScriptDetailSkeleton } from "@/components/loading/script-detail-skeleton"
import { ScriptRejectionFeedback } from "@/components/script-rejection-feedback"
import { ScriptTatBar } from "@/components/script-tat-bar"
import { ScriptStickerVersionToolbar } from "@/components/script-sticker-version-toolbar"
import { useScriptStickerVersionView } from "@/hooks/use-script-sticker-version-view"
import { getVersionedScriptEditorDisplay } from "@/lib/script-sticker-version-editor-display"
import { ArrowLeft, CheckCircle, Loader2, Send, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const STATUS_LABELS: Record<ScriptStatus, string> = {
  DRAFT: "Draft",
  CONTENT_BRAND_REVIEW: "With Content/Brand",
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

export default function MedicalAffairsScriptDetailPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [script, setScript] = useState<Script | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [approveComments, setApproveComments] = useState("")
  const [rejectComments, setRejectComments] = useState("")
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const isMedicalAffairs = user?.role === "MEDICAL_AFFAIRS"
  const isDraft = script?.status === "DRAFT"
  const isMedicalReview = script?.status === "MEDICAL_REVIEW"
  const showSubmitFromQuery = searchParams.get("submit") === "1"
  const reviewActionFromQuery = searchParams.get("action")

  const [editTitle, setEditTitle] = useState("")
  const [editInsight, setEditInsight] = useState("")
  const [editContent, setEditContent] = useState("")
  const [feedbackStickers, setFeedbackStickers] = useState<
    Record<string, ScriptFeedbackSticker>
  >({})

  /** Medical Review: cannot approve while any inline sticker thread is still open. */
  const hasPendingStickerComments = useMemo(() => {
    if (!isMedicalReview) return false
    return Object.values(feedbackStickers).some((s) => s.resolved !== true)
  }, [feedbackStickers, isMedicalReview])

  const scriptRef = useRef<Script | null>(null)
  useLayoutEffect(() => {
    scriptRef.current = script
  }, [script])

  const commentsMergeHandlerRef = useRef<
    (list: ScriptFeedbackSticker[], meta?: ScriptCommentsMergeMeta) => void
  >(() => {})

  const onCommentsMergeFromApiStable = useCallback(
    (list: ScriptFeedbackSticker[], meta?: ScriptCommentsMergeMeta) => {
      commentsMergeHandlerRef.current(list, meta)
    },
    []
  )

  const onAfterCommentMutation = useCallback((c: ScriptComment) => {
    setFeedbackStickers((prev) => ({
      ...prev,
      [c.id]: { ...prev[c.id], ...c },
    }))
  }, [])

  const commentsHistoryEnabled = Boolean(
    isMedicalAffairs &&
    token &&
    id &&
    (script == null ||
      script.status !== "DRAFT" ||
      scriptIsInRejectedState(script))
  )

  const stickerPermissionContext = script
    ? {
        scriptStatus: script.status,
        currentUserId: user?.id ?? null,
        currentUserRole: user?.role ?? null,
      }
    : null

  const versionView = useScriptStickerVersionView({
    token,
    scriptId: id,
    enabled: commentsHistoryEnabled,
    refreshKey: script?.version,
  })

  const { syncBaseline, notifyStickersChanged } = useScriptCommentsRemoteSync({
    token,
    scriptId: id,
    // Include rejected drafts: queue is DRAFT but Brand stickers live on GET /comments only.
    fetchEnabled: Boolean(
      isMedicalAffairs &&
      token &&
      id &&
      (script == null ||
        script.status !== "DRAFT" ||
        scriptIsInRejectedState(script))
    ),
    // Persist stickers at Medical review; resolve-only at rejected DRAFT (recipient).
    pushEnabled: Boolean(
      isMedicalAffairs &&
      token &&
      id &&
      (script?.status === "MEDICAL_REVIEW" ||
        (script?.status === "DRAFT" &&
          script &&
          scriptIsInRejectedState(script)))
    ),
    commentsRefetchKey: script?.version,
    onMergeFromServer: onCommentsMergeFromApiStable,
    onAfterCommentMutation,
  })

  const onCommentsMergedFromApi = useCallback(
    (list: ScriptFeedbackSticker[], _meta?: ScriptCommentsMergeMeta) => {
      const fromApi = recordFromStickerArray(list)
      if (Object.keys(fromApi).length > 0) {
        setFeedbackStickers(fromApi)
        syncBaseline(fromApi)
        return
      }
      const s = scriptRef.current
      const fromScript = s
        ? recordFromStickerArray(scriptCommentsListFromScript(s))
        : {}
      if (Object.keys(fromScript).length > 0) {
        setFeedbackStickers(fromScript)
        syncBaseline(fromScript)
      } else {
        setFeedbackStickers({})
        syncBaseline({})
      }
    },
    [syncBaseline]
  )

  useLayoutEffect(() => {
    commentsMergeHandlerRef.current = onCommentsMergedFromApi
  }, [onCommentsMergedFromApi])

  const handleFeedbackStickersChange = useCallback(
    (next: Record<string, ScriptFeedbackSticker>) => {
      setFeedbackStickers(next)
      notifyStickersChanged(next)
    },
    [notifyStickersChanged]
  )

  const hasUnsavedChanges =
    !!script &&
    (editTitle !== (script.title ?? "") ||
      editInsight !== (script.insight ?? "") ||
      editContent !== (script.content ?? ""))

  function refetchScript() {
    if (!token || !id) return
    getScriptQueue(token)
      .then((queueRes) => {
        const s = [
          ...(queueRes.available ?? []),
          ...(queueRes.myReviews ?? []),
        ].find((q) => q.id === id)
        if (s) {
          setScript(s)
          setEditTitle(s.title ?? "")
          setEditInsight(s.insight ?? "")
          setEditContent(s.content ?? "")
          setFeedbackStickers((prev) => {
            const next = mergeStickersFromQueuePayload(prev, s)
            syncBaseline(next)
            return next
          })
        }
      })
      .catch(() => {})
  }

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
        setEditTitle(s.title ?? "")
        setEditInsight(s.insight ?? "")
        setEditContent(s.content ?? "")
        setFeedbackStickers((prev) => {
          const next = mergeStickersFromQueuePayload(prev, s)
          syncBaseline(next)
          return next
        })
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

  useEffect(() => {
    if (showSubmitFromQuery && script?.status === "DRAFT")
      setSubmitDialogOpen(true)
  }, [showSubmitFromQuery, script?.status])

  /** Open approve/reject dialog when arriving from list card shortcuts; then drop query. */
  useEffect(() => {
    if (!script || script.status !== "MEDICAL_REVIEW" || loading) return
    if (reviewActionFromQuery === "approve") {
      setApproveDialogOpen(true)
      router.replace(`/medical-affairs-scripts/${id}`, { scroll: false })
    } else if (reviewActionFromQuery === "reject") {
      setRejectDialogOpen(true)
      router.replace(`/medical-affairs-scripts/${id}`, { scroll: false })
    }
  }, [script?.id, script?.status, loading, reviewActionFromQuery, id, router])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !id || !isDraft) return
    if (!editTitle.trim()) {
      setError(SCRIPT_TITLE_REQUIRED_MESSAGE)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const stickerList = Object.values(feedbackStickers)
      await updateScript(token, id, {
        title: editTitle.trim(),
        insight: editInsight.trim() || undefined,
        content: editContent,
        ...(stickerList.length > 0 ? { comments: stickerList } : {}),
      })
      refetchScript()
      toast.success("Changes saved", { description: "Draft updated." })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save"
      setError(message)
      toast.error("Could not save", { description: message })
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmSubmit() {
    if (!token || !id) return
    if (hasUnsavedChanges) {
      toast.error("Please save your changes before submitting.", {
        description: "Click Save changes, then submit to Content/Brand.",
      })
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await submitScript(token, id)
      refetchScript()
      setSubmitDialogOpen(false)
      toast.success("Sent to Content/Brand", {
        description: "Script is now in review. TAT 24 hours.",
      })
      const submittedTitle = script?.title?.trim()
      router.push(
        submittedTitle
          ? `/medical-affairs-scripts/submitted?title=${encodeURIComponent(submittedTitle)}`
          : "/medical-affairs-scripts/submitted"
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit"
      setError(message)
      toast.error("Could not submit", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleApproveRevision() {
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
      toast.success("Revision approved", {
        description: "Script moved to Content/Brand approval.",
      })
      router.push("/medical-affairs-scripts")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to approve"
      setError(message)
      toast.error("Could not approve", { description: message })
    } finally {
      setApproving(false)
    }
  }

  async function handleRejectRevision() {
    if (!token || !id) return
    const comments = rejectComments.trim()
    if (!comments) {
      setError("Please provide feedback for the Agency.")
      return
    }
    setError(null)
    setRejecting(true)
    try {
      await rejectScript(token, id, { comments })
      setRejectDialogOpen(false)
      setRejectComments("")
      toast.warning("Sent back to Agency", {
        description: "Feedback sent. Agency can revise and resubmit.",
      })
      router.push("/medical-affairs-scripts")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reject"
      setError(message)
      toast.error("Could not send feedback", { description: message })
    } finally {
      setRejecting(false)
    }
  }

  if (!isMedicalAffairs) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">
          Only Medical Affairs can edit or submit this script.
        </p>
        <Button variant="link" asChild className="mt-2 pl-0">
          <Link href="/medical-affairs-scripts">Back to scripts</Link>
        </Button>
      </div>
    )
  }

  if (loading || !script) {
    return <ScriptDetailSkeleton />
  }

  const draftVersionDisp = getVersionedScriptEditorDisplay(
    versionView,
    editContent,
    feedbackStickers
  )
  const scriptViewDisp = getVersionedScriptEditorDisplay(
    versionView,
    script.content ?? "",
    feedbackStickers
  )

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link href="/medical-affairs-scripts">
              <ArrowLeft className="mr-1 size-4" />
              Back to scripts
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

        {isDraft ? (
          <form onSubmit={handleSave} className="">
            <Card>
              <CardHeader>
                <CardTitle>Edit script</CardTitle>
                <CardDescription>
                  Update and save. When ready, submit to send to Content/Brand
                  (TAT 24 hours).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="edit-title">Title / Topic</Label>
                  <Input
                    id="edit-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Title or topic"
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-insight">Insight</Label>
                  <Textarea
                    id="edit-insight"
                    value={editInsight}
                    onChange={(e) => setEditInsight(e.target.value)}
                    placeholder="Insight"
                    rows={3}
                    className="min-h-[80px] resize-y"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Script (English)</Label>
                  {versionView.listError ? (
                    <p className="text-xs text-destructive">
                      {versionView.listError}
                    </p>
                  ) : null}
                  <ScriptStickerVersionToolbar
                    showToolbar={versionView.showToolbar}
                    listLoading={versionView.listLoading}
                    selectValue={versionView.selectValue}
                    onSelectValueChange={versionView.onSelectValueChange}
                    versionOptions={versionView.versionOptions}
                    isViewingSnapshot={versionView.isViewingSnapshot}
                    snapshotLoading={versionView.snapshotLoading}
                    id="ma-draft-version-select"
                  />
                  {draftVersionDisp.mode === "loading" ? (
                    <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20">
                      <Loader2 className="size-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : draftVersionDisp.mode === "error" ? (
                    <p className="text-sm text-destructive">
                      {draftVersionDisp.message}
                    </p>
                  ) : (
                    <>
                      {draftVersionDisp.mode === "snapshot" &&
                      draftVersionDisp.contentMissing ? (
                        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                          Script content for this version was not archived
                          (legacy data). Comments still appear in the sidebar.
                        </p>
                      ) : null}
                      <ScriptRichTextEditor
                        key={`${script.id}-draft-${versionView.selectValue || "live"}`}
                        initialContent={
                          draftVersionDisp.mode === "live"
                            ? editContent
                            : draftVersionDisp.html
                        }
                        contentSyncKey={`${script.version}-${versionView.selectValue || "live"}`}
                        onChange={
                          draftVersionDisp.mode === "live"
                            ? setEditContent
                            : undefined
                        }
                        placeholder="Enter the full script content..."
                        minHeight="280px"
                        disabled={draftVersionDisp.mode !== "live"}
                        feedbackStickers={draftVersionDisp.stickers}
                        {...(draftVersionDisp.mode === "snapshot" ||
                        (draftVersionDisp.mode === "live" &&
                          scriptIsInRejectedState(script))
                          ? {
                              feedbackCommentsSidebar: true,
                              onFeedbackStickersChange:
                                draftVersionDisp.mode === "live"
                                  ? handleFeedbackStickersChange
                                  : undefined,
                              stickerPermissionContext:
                                draftVersionDisp.mode === "live"
                                  ? stickerPermissionContext
                                  : undefined,
                            }
                          : { feedbackCommentsSidebar: false })}
                      />
                    </>
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={saving || versionView.isViewingSnapshot}
                  variant="outline"
                >
                  {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Save changes
                </Button>
              </CardContent>
            </Card>
          </form>
        ) : null}
        {isDraft && (
          <div className="flex flex-wrap gap-2 border-t pt-6">
            <Button
              onClick={() => {
                if (versionView.isViewingSnapshot) {
                  toast.message("Switch to current version", {
                    description:
                      "Select the current version in the dropdown to submit.",
                  })
                  return
                }
                if (hasUnsavedChanges) {
                  toast.error("Please save your changes before submitting.", {
                    description:
                      "Click Save changes, then submit to Content/Brand.",
                  })
                  return
                }
                setSubmitDialogOpen(true)
              }}
              variant="outline"
              className="text-green-600 focus-visible:ring-green-500/30"
              disabled={versionView.isViewingSnapshot}
            >
              <Send className="mr-2 size-4" />
              Submit to Content/Brand
            </Button>
          </div>
        )}
        {!isDraft && (
          <>
            <Card className="overflow-visible">
              <CardHeader>
                <CardTitle>Script content</CardTitle>
                <CardDescription>
                  {isMedicalReview
                    ? "Agency submitted a revision for your review. Add inline comments on the script as needed. Approve to send to Content/Brand approval, or reject with feedback so Agency can revise and resubmit. TAT 24 hours."
                    : "This script is with Content/Brand or later in the workflow. Editing is only allowed for drafts."}
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
                    <p className="text-xs text-destructive">
                      {versionView.listError}
                    </p>
                  ) : null}
                  <ScriptStickerVersionToolbar
                    showToolbar={versionView.showToolbar}
                    listLoading={versionView.listLoading}
                    selectValue={versionView.selectValue}
                    onSelectValueChange={versionView.onSelectValueChange}
                    versionOptions={versionView.versionOptions}
                    isViewingSnapshot={versionView.isViewingSnapshot}
                    snapshotLoading={versionView.snapshotLoading}
                    id="ma-view-version-select"
                  />
                  {scriptViewDisp.mode === "loading" ? (
                    <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20">
                      <Loader2 className="size-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : scriptViewDisp.mode === "error" ? (
                    <p className="text-sm text-destructive">
                      {scriptViewDisp.message}
                    </p>
                  ) : (
                    <>
                      {scriptViewDisp.mode === "snapshot" &&
                      scriptViewDisp.contentMissing ? (
                        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                          Script content for this version was not archived
                          (legacy data). Comments still appear in the sidebar.
                        </p>
                      ) : null}
                      <ScriptRichTextEditor
                        key={`${script.id}-view-${versionView.selectValue || "live"}-${script.updatedAt}`}
                        initialContent={
                          scriptViewDisp.mode === "live"
                            ? (script.content ?? "")
                            : scriptViewDisp.html
                        }
                        minHeight="200px"
                        className="mt-1"
                        feedbackStickers={scriptViewDisp.stickers}
                        stickerPermissionContext={
                          scriptViewDisp.mode === "live"
                            ? stickerPermissionContext
                            : undefined
                        }
                        {...(scriptViewDisp.mode !== "live"
                          ? {
                              disabled: true,
                              feedbackCommentsSidebar: true,
                            }
                          : isMedicalReview
                            ? {
                                contentReadOnly: true,
                                feedbackCommentsSidebar: true,
                                onFeedbackStickersChange:
                                  handleFeedbackStickersChange,
                                feedbackStickerToolbar: true,
                                feedbackStickerAuthorId: user?.id ?? null,
                              }
                            : {
                                disabled: true,
                                feedbackCommentsSidebar: true,
                              })}
                      />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
            {isMedicalReview && (
              <div className="space-y-3 border-t pt-6">
                {hasPendingStickerComments ? (
                  <p className="text-sm text-amber-800 dark:text-amber-200/90">
                    You have open inline comments. Resolve or delete each one in
                    the editor before you can approve.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500/30 dark:text-red-500 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                    onClick={() => setRejectDialogOpen(true)}
                    disabled={versionView.isViewingSnapshot}
                  >
                    <XCircle className="mr-2 size-4" />
                    Changes needed
                  </Button>
                  <Button
                    variant="outline"
                    className="text-green-600 hover:bg-green-50 hover:text-green-700 focus-visible:ring-green-500/30 dark:text-green-500 dark:hover:bg-green-950/50 dark:hover:text-green-400"
                    onClick={() => setApproveDialogOpen(true)}
                    disabled={
                      versionView.isViewingSnapshot || hasPendingStickerComments
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
          </>
        )}

        <ScriptRejectionFeedback script={script} />
      </div>

      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="gap-6 p-6 sm:max-w-lg sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Submit to Content/Brand ?
            </DialogTitle>
            <DialogDescription className="max-w-[42ch] text-sm leading-relaxed">
              This will move the script from Draft to Content/Brand Review. They
              have a 24-hour TAT. An email will be sent to all mapped Medical
              Affairs IDs. You cannot edit the script after submitting.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="-mx-6 -mb-6 gap-3 px-6 pb-6 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setSubmitDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSubmit}
              disabled={submitting || hasUnsavedChanges}
              title={hasUnsavedChanges ? "Save your changes first" : undefined}
              className="border-0 bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-white hover:opacity-90"
            >
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Medical Review: Approve revision */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="gap-6 p-6 sm:max-w-lg sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Approve revision
            </DialogTitle>
            <DialogDescription className="max-w-[42ch] text-sm leading-relaxed">
              The script will move to Content/Brand Approval. You can add
              optional comments for the record.
            </DialogDescription>
            {hasPendingStickerComments ? (
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
              placeholder="e.g. Agency version looks medically accurate."
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
              onClick={handleApproveRevision}
              disabled={approving || hasPendingStickerComments}
              className="text-green-600 hover:bg-green-50 hover:text-green-700 focus-visible:ring-green-500/30 dark:text-green-500 dark:hover:bg-green-950/50 dark:hover:text-green-400"
            >
              {approving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Medical Review: Reject revision */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="gap-6 p-6 sm:max-w-lg sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Send back to Agency
            </DialogTitle>
            <DialogDescription className="max-w-[42ch] text-sm leading-relaxed">
              The script will return to Agency Production. Agency can revise and
              resubmit. Please provide feedback. TAT 24 hours.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-comments">Feedback (required)</Label>
            <Textarea
              id="reject-comments"
              value={rejectComments}
              onChange={(e) => setRejectComments(e.target.value)}
              placeholder="e.g. The medication dosage mentioned is incorrect. Please correct and resubmit."
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
              onClick={handleRejectRevision}
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
