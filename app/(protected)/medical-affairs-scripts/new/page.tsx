"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScriptRichTextEditor } from "@/components/script-rich-text-editor"
import { toast } from "sonner"
import { useAuthStore } from "@/store"
import { createScript } from "@/lib/scripts-api"
import { ArrowLeft, Loader2 } from "lucide-react"

export default function NewMedicalAffairsScriptPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [title, setTitle] = useState("")
  const [insight, setInsight] = useState("")
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isMedicalAffairs = user?.role === "MEDICAL_AFFAIRS"

  function isEmptyHtml(html: string): boolean {
    const text = html.replace(/<[^>]*>/g, "").trim()
    return !text
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isEmptyHtml(content)) {
      setError("Script content is required.")
      return
    }
    if (!token || !isMedicalAffairs) return
    setError(null)
    setLoading(true)
    try {
      const res = await createScript(token, {
        title: title.trim() || undefined,
        insight: insight.trim() || undefined,
        content,
      })
      const id = res.script?.id
      toast.success("Script created", { description: "Saved as draft. You can edit and submit when ready." })
      if (id) {
        router.push(`/medical-affairs-scripts/${id}`)
      } else {
        router.push("/medical-affairs-scripts")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create script"
      setError(message)
      toast.error("Could not create script", { description: message })
    } finally {
      setLoading(false)
    }
  }

  if (!isMedicalAffairs) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">Only Medical Affairs can create scripts.</p>
        <Button variant="link" asChild className="mt-2 pl-0">
          <Link href="/medical-affairs-scripts">Back to scripts</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link href="/medical-affairs-scripts">
              <ArrowLeft className="mr-1 size-4" />
              Back to scripts
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Create script</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Title/Topic, insight, and script in English. No doctor&apos;s notes required.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>New script</CardTitle>
              <CardDescription>
                This script will be saved as a draft. You can edit and submit to Content/Brand when ready.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="title">Title / Topic</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Diabetes Management in Adults"
                  className="h-10"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="insight">Insight</Label>
                <Textarea
                  id="insight"
                  value={insight}
                  onChange={(e) => setInsight(e.target.value)}
                  placeholder="e.g. Patients often misunderstand insulin resistance. This script should clarify the basics in simple language."
                  rows={3}
                  className="resize-y min-h-[80px]"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Script (English) <span className="text-destructive">*</span>
                </Label>
                <ScriptRichTextEditor
                  initialContent=""
                  onChange={setContent}
                  placeholder="Enter the full script content..."
                  minHeight="280px"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Create draft
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/medical-affairs-scripts">Cancel</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  )
}
