"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { getScript, updateScript, submitRevision } from "@/lib/scripts-api"
import type { Script, ScriptStatus } from "@/types/script"
import { getScriptStatusClassName } from "@/lib/script-status-styles"
import { ScriptDetailSkeleton } from "@/components/loading/script-detail-skeleton"
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

  const isAgencyPoc = user?.role === "AGENCY_POC"
  const canEdit = script?.status === "AGENCY_PRODUCTION"

  useEffect(() => {
    if (!token || !id) return
    let cancelled = false
    setLoading(true)
    getScript(token, id)
      .then((res) => {
        if (!cancelled && res.script) {
          setScript(res.script)
          setEditTitle(res.script.title ?? "")
          setEditInsight(res.script.insight ?? "")
          setEditContent(res.script.content ?? "")
        }
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !id || !canEdit) return
    setError(null)
    setSaving(true)
    try {
      const res = await updateScript(token, id, {
        title: editTitle.trim() || undefined,
        insight: editInsight.trim() || undefined,
        content: editContent,
      })
      if (res.script) setScript(res.script)
      toast.success("Changes saved", { description: "You can submit revision when ready." })
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
    setError(null)
    setSubmitting(true)
    try {
      const res = await submitRevision(token, id, { content: editContent })
      if (res.script) {
        setScript(res.script)
        setSubmitDialogOpen(false)
        toast.success("Revision submitted", { description: "Medical Affairs will review. TAT 24 hours." })
        router.push("/agency-poc")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit revision"
      setError(message)
      toast.error("Could not submit revision", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAgencyPoc) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">Only Agency POC can edit and submit revisions here.</p>
        <Button variant="link" asChild className="mt-2 pl-0">
          <Link href="/agency-poc">Back to queue</Link>
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
                className={cn("uppercase", getScriptStatusClassName(script.status))}
              >
                {STATUS_LABELS[script.status]}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Updated {formatDate(script.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {canEdit ? (
          <>
            <form onSubmit={handleSave}>
              <Card>
                <CardHeader>
                  <CardTitle>Edit script</CardTitle>
                  <CardDescription>
                    Make your changes. Save to update, then submit revision to send to Medical Affairs for review. TAT 24 hours; they can approve or request changes.
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
                    <ScriptRichTextEditor
                      key={script.id}
                      initialContent={script.content ?? ""}
                      onChange={setEditContent}
                      placeholder="Enter the full script content..."
                      minHeight="280px"
                    />
                  </div>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Save changes
                  </Button>
                </CardContent>
              </Card>
            </form>
            <div className="flex flex-wrap gap-2 border-t pt-6">
              <Button onClick={() => setSubmitDialogOpen(true)}>
                <Send className="mr-2 size-4" />
                Submit revision to Medical Affairs
              </Button>
            </div>
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Script content</CardTitle>
              <CardDescription>
                This script is not in Agency Production. Editing and submitting revisions are only allowed when the script is with Agency.
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
        )}
      </div>

      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="sm:max-w-lg gap-6 p-6 sm:p-8" showCloseButton>
          <DialogHeader className="gap-3 space-y-1">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Submit revision
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed max-w-[42ch]">
              The script will move to Medical Review. Medical Affairs will be notified and can approve or send back with feedback. TAT 24 hours. You can revise and resubmit if they request changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-3 -mx-6 -mb-6 px-6 pb-6 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setSubmitDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmitRevision} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Submit revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
