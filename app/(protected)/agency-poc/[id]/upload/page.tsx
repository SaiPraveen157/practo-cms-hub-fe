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
import { useAuthStore } from "@/store"
import { getScriptQueue } from "@/lib/scripts-api"
import {
  getUploadUrl,
  uploadFileToPresignedUrl,
  submitVideo,
} from "@/lib/videos-api"
import type { Script } from "@/types/script"
import type { VideoPhase } from "@/types/video"
import { ScriptDetailSkeleton } from "@/components/loading/script-detail-skeleton"
import { ArrowLeft, Loader2, Send, Upload } from "lucide-react"
import { toast } from "sonner"

const PHASE_FIRST_LINE_UP: VideoPhase = "FIRST_LINE_UP"

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

export default function AgencyPocUploadPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [script, setScript] = useState<Script | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [uploadStep, setUploadStep] = useState<"idle" | "url" | "put">("idle")
  const [uploading, setUploading] = useState(false)
  const [uploadedMeta, setUploadedMeta] = useState<{
    fileUrl: string
    fileName: string
    fileType: string
    fileSize: number
  } | null>(null)
  const [sending, setSending] = useState(false)

  const isAgencyPoc = user?.role === "AGENCY_POC"
  const isLocked = script?.status === "LOCKED"

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
        if (s.status !== "LOCKED") {
          setError(
            "Only locked scripts can have videos uploaded. This script is not locked."
          )
          setScript(s)
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

  async function handleUploadFile() {
    if (!token || !script || !file) return
    setError(null)
    setUploading(true)
    setUploadStep("url")
    try {
      const { uploadUrl, fileUrl } = await getUploadUrl(token, {
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
      })
      setUploadStep("put")
      await uploadFileToPresignedUrl(uploadUrl, file)
      setUploadedMeta({
        fileUrl,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
      })
      setFile(null)
      toast.success("File uploaded", {
        description: "Send to Medical Affairs when ready.",
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed"
      setError(msg)
      toast.error("Upload failed", { description: msg })
    } finally {
      setUploading(false)
      setUploadStep("idle")
    }
  }

  async function handleSendForReview() {
    if (!token || !script || !uploadedMeta) return
    setError(null)
    setSending(true)
    try {
      await submitVideo(token, {
        scriptId: script.id,
        phase: PHASE_FIRST_LINE_UP,
        fileUrl: uploadedMeta.fileUrl,
        fileName: uploadedMeta.fileName,
        fileType: uploadedMeta.fileType,
        fileSize: uploadedMeta.fileSize,
      })
      toast.success("Sent for review", {
        description: "Medical Affairs will review. TAT 24 hours.",
      })
      router.push("/agency-poc-videos")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to submit"
      setError(msg)
      toast.error("Could not send for review", { description: msg })
    } finally {
      setSending(false)
    }
  }

  if (!isAgencyPoc) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">
          Only Agency POC can upload videos here.
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

  if (!isLocked) {
    return (
      <div className="p-6 md:p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link href={`/agency-poc/${id}`}>
              <ArrowLeft className="mr-1 size-4" />
              Back to script
            </Link>
          </Button>
          <Card className="border-amber-200 dark:border-amber-800">
            <CardContent className="pt-6">
              <p className="text-muted-foreground">{error}</p>
              <Button variant="outline" className="mt-4" asChild>
                <Link href="/agency-poc">Back to queue</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link href={`/agency-poc/${id}`}>
              <ArrowLeft className="mr-1 size-4" />
              Back to script
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Upload video — First Line Up
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload media for this locked script, then send to Medical Affairs
              for review. TAT 24 hours.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Script details</CardTitle>
            <CardDescription>
              Locked script — video production (Phase 4)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Title</p>
              <p className="mt-1 font-medium">
                {script.title || "Untitled script"}
              </p>
            </div>
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
            <div className="flex items-center gap-2 pt-2">
              <Badge variant="secondary">Locked</Badge>
              <span className="text-xs text-muted-foreground">
                Updated {formatDate(script.updatedAt ?? script.createdAt ?? "")}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upload media</CardTitle>
            <CardDescription>
              Choose a video or file. Upload to the server, then send to Medical
              Affairs for review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/x-msvideo,application/pdf,image/jpeg,image/png"
                className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground file:hover:bg-primary/90"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={uploading}
              />
              {uploading && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {uploadStep === "url" && "Getting upload URL…"}
                  {uploadStep === "put" && "Uploading file…"}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleUploadFile}
                disabled={!file || uploading}
                className="gap-1.5 border-0 bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-white hover:opacity-90"
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Upload file
              </Button>
              {uploadedMeta && (
                <Button
                  onClick={handleSendForReview}
                  disabled={sending}
                  className="gap-1.5 bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Send to Medical Affairs for review
                </Button>
              )}
            </div>
            {uploadedMeta && !sending && (
              <p className="text-sm text-muted-foreground">
                File uploaded: <strong>{uploadedMeta.fileName}</strong>. Click
                &quot;Send to Medical Affairs for review&quot; to submit.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
