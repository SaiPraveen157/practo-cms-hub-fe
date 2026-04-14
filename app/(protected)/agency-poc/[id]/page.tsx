"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
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
import { useAuthStore } from "@/store"
import { toast } from "sonner"
import { getScriptQueue, updateScript, submitRevision } from "@/lib/scripts-api"
import { SCRIPT_TITLE_REQUIRED_MESSAGE } from "@/lib/script-title"
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
import { getScriptDisplayInfo } from "@/lib/script-status-styles"
import { ScriptDetailSkeleton } from "@/components/loading/script-detail-skeleton"
import { ScriptRejectionFeedback } from "@/components/script-rejection-feedback"
import { ScriptTatBar } from "@/components/script-tat-bar"
import { ScriptStickerVersionToolbar } from "@/components/script-sticker-version-toolbar"
import { useScriptStickerVersionView } from "@/hooks/use-script-sticker-version-view"
import { getVersionedScriptEditorDisplay } from "@/lib/script-sticker-version-editor-display"
import { ArrowLeft, Loader2, Send } from "lucide-react"
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

export default function AgencyPocScriptPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [script, setScript] = useState<Script | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [editTitle, setEditTitle] = useState("")
  const [editInsight, setEditInsight] = useState("")
  const [editContent, setEditContent] = useState("")
  const [feedbackStickers, setFeedbackStickers] = useState<
    Record<string, ScriptFeedbackSticker>
  >({})

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

  const isAgencyPoc = user?.role === "AGENCY_POC"
  const canEdit = script?.status === "AGENCY_PRODUCTION"

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

  const commentsVersionEnabled = Boolean(
    isAgencyPoc && token && id && script?.status === "AGENCY_PRODUCTION"
  )

  const versionView = useScriptStickerVersionView({
    token,
    scriptId: id,
    enabled: commentsVersionEnabled,
    refreshKey: script?.version,
  })

  const { syncBaseline, notifyStickersChanged } = useScriptCommentsRemoteSync({
    token,
    scriptId: id,
    fetchEnabled: Boolean(
      isAgencyPoc &&
      token &&
      id &&
      (script == null || script.status === "AGENCY_PRODUCTION")
    ),
    pushEnabled: Boolean(
      isAgencyPoc && token && id && script?.status === "AGENCY_PRODUCTION"
    ),
    commentsRefetchKey: script?.version,
    onMergeFromServer: onCommentsMergeFromApiStable,
    onAfterCommentMutation,
  })

  const handleFeedbackStickersChange = useCallback(
    (next: Record<string, ScriptFeedbackSticker>) => {
      setFeedbackStickers(next)
      notifyStickersChanged(next)
    },
    [notifyStickersChanged]
  )

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !id || !canEdit) return
    if (versionView.isViewingSnapshot) {
      toast.message("Switch to current version", {
        description:
          "Select the current version in the dropdown to save changes.",
      })
      return
    }
    if (!editTitle.trim()) {
      setError(SCRIPT_TITLE_REQUIRED_MESSAGE)
      return
    }
    setError(null)
    setSaving(true)
    try {
      await updateScript(token, id, {
        title: editTitle.trim(),
        insight: editInsight.trim() || undefined,
        content: editContent,
      })
      refetchScript()
      toast.success("Changes saved", {
        description: "You can submit revision when ready.",
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save"
      setError(message)
      toast.error("Could not save", { description: message })
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitRevision() {
    if (!token || !id) return
    if (versionView.isViewingSnapshot) {
      toast.message("Switch to current version", {
        description:
          "Select the current version in the dropdown to submit a revision.",
      })
      return
    }
    if (hasUnsavedChanges) {
      toast.error("Please save your changes before submitting.", {
        description: "Click Save changes, then submit revision.",
      })
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await submitRevision(token, id, { content: editContent })
      setSubmitDialogOpen(false)
      toast.success("Revision submitted", {
        description: "Medical Affairs will review. TAT 24 hours.",
      })
      router.push("/agency-poc")
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to submit revision"
      setError(message)
      toast.error("Could not submit revision", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAgencyPoc) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">
          Only Agency POC can edit and submit revisions here.
        </p>
        <Button variant="link" asChild className="mt-2 pl-0">
          <Link href="/agency-poc">Back to queue</Link>
        </Button>
      </div>
    )
  }

  if (loading || !script) {
    return <ScriptDetailSkeleton />
  }

  const agencyEditVersionDisp = getVersionedScriptEditorDisplay(
    versionView,
    editContent,
    feedbackStickers
  )

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link href="/agency-poc">
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

        {canEdit ? (
          <>
            <form onSubmit={handleSave}>
              <Card className="overflow-visible">
                <CardHeader>
                  <CardTitle>Edit script</CardTitle>
                  <CardDescription>
                    Review inline comments from Medical Affairs in the sidebar,
                    update the script, then save. Submit revision to send back
                    for Medical review. TAT 24 hours.
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
                      id="agency-version-select"
                    />
                    {agencyEditVersionDisp.mode === "loading" ? (
                      <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20">
                        <Loader2 className="size-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : agencyEditVersionDisp.mode === "error" ? (
                      <p className="text-sm text-destructive">
                        {agencyEditVersionDisp.message}
                      </p>
                    ) : (
                      <>
                        {agencyEditVersionDisp.mode === "snapshot" &&
                        agencyEditVersionDisp.contentMissing ? (
                          <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                            Script content for this version was not archived
                            (legacy data). Comments still appear in the sidebar.
                          </p>
                        ) : null}
                        <ScriptRichTextEditor
                          key={`${script.id}-agency-${versionView.selectValue || "live"}`}
                          initialContent={
                            agencyEditVersionDisp.mode === "live"
                              ? editContent
                              : agencyEditVersionDisp.html
                          }
                          onChange={
                            agencyEditVersionDisp.mode === "live"
                              ? setEditContent
                              : undefined
                          }
                          placeholder="Enter the full script content..."
                          minHeight="280px"
                          disabled={agencyEditVersionDisp.mode !== "live"}
                          feedbackStickers={agencyEditVersionDisp.stickers}
                          commentsSidebarEmptyHint="No inline comments from Medical Affairs yet."
                          {...(agencyEditVersionDisp.mode === "snapshot" ||
                          agencyEditVersionDisp.mode === "live"
                            ? {
                                feedbackCommentsSidebar: true,
                                onFeedbackStickersChange:
                                  agencyEditVersionDisp.mode === "live"
                                    ? handleFeedbackStickersChange
                                    : undefined,
                                stickerPermissionContext:
                                  agencyEditVersionDisp.mode === "live"
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
                    className="border-0 bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-white hover:opacity-90"
                  >
                    {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Save changes
                  </Button>
                </CardContent>
              </Card>
            </form>
            <div className="flex flex-wrap gap-2 border-t pt-6">
              <Button
                className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
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
                      description: "Click Save changes, then submit revision.",
                    })
                    return
                  }
                  setSubmitDialogOpen(true)
                }}
                title={
                  versionView.isViewingSnapshot
                    ? "Select the current version in the dropdown"
                    : hasUnsavedChanges
                      ? "Save your changes first"
                      : undefined
                }
                disabled={versionView.isViewingSnapshot}
              >
                Submit revision to Medical Affairs
                <Send className="mr-2 size-4" />
              </Button>
            </div>
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Script content</CardTitle>
              <CardDescription>
                This script is not in Agency Production. Editing and submitting
                revisions are only allowed when the script is with Agency.
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
                <ScriptRichTextEditor
                  key={`${script.id}-view-${script.updatedAt}`}
                  initialContent={script.content ?? ""}
                  disabled
                  minHeight="200px"
                  className="mt-1"
                  feedbackCommentsSidebar={false}
                />
              </div>
            </CardContent>
          </Card>
        )}

        <ScriptRejectionFeedback script={script} />
      </div>

      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="gap-6 p-6 sm:max-w-lg sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Submit revision
            </DialogTitle>
            <DialogDescription className="max-w-[42ch] text-sm leading-relaxed">
              The script will move to Medical Review. Medical Affairs will be
              notified and can approve or send back with feedback. TAT 24 hours.
              You can revise and resubmit if they request changes.
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
              onClick={handleSubmitRevision}
              disabled={
                submitting ||
                hasUnsavedChanges ||
                versionView.isViewingSnapshot
              }
              title={
                versionView.isViewingSnapshot
                  ? "Select the current version in the dropdown"
                  : hasUnsavedChanges
                    ? "Save your changes first"
                    : undefined
              }
              className="border-0 bg-gradient-to-r from-[#518dcd] to-[#7ac0ca] text-white hover:opacity-90"
            >
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Submit revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
