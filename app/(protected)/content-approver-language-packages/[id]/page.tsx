"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuthStore } from "@/store"
import type { UserRole } from "@/types/auth"
import {
  approveLanguageVideo,
  getLanguagePackage,
  getLanguageVideoComments,
} from "@/lib/language-packages-api"
import {
  getCurrentLanguageVideoAsset,
  mergeLanguageVideoIntoPackage,
  languageVideosSorted,
} from "@/lib/language-package-video-helpers"
import type { LanguagePackage } from "@/types/language-package"
import { LanguageVideoPlayerWithThread } from "@/components/language-packages/language-video-player-with-thread"
import { TagPillList } from "@/components/packages/tag-pill-list"
import {
  formatLanguageLabel,
  languageDetailShellClass,
  languageVideoStatusBadgeClass,
  LANGUAGE_VIDEO_STATUS_LABELS,
} from "@/lib/language-package-ui"
import { formatPackageDate } from "@/lib/package-ui"
import { ArrowLeft, ImageIcon, Loader2 } from "lucide-react"
import {
  VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION,
  videoThreadBlocksApprove,
} from "@/lib/video-comment"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const VIDEO_CLASS =
  "h-auto w-full max-w-full object-contain max-h-[min(85vh,40rem)]"

export default function ContentApproverLanguagePackageDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const role = user?.role as UserRole | undefined
  const canAccess = role === "CONTENT_APPROVER" || role === "SUPER_ADMIN"

  const [pkg, setPkg] = useState<LanguagePackage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)
  const [approveComment, setApproveComment] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!token || !id) return
    setLoading(true)
    setError(null)
    try {
      const res = await getLanguagePackage(token, id)
      setPkg(res.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [token, id])

  useEffect(() => {
    load()
  }, [load])

  const sorted = useMemo(() => (pkg ? languageVideosSorted(pkg) : []), [pkg])

  /** Optional deep link: ?video=uuid scrolls that card into view. */
  useEffect(() => {
    const q = (searchParams.get("video") ?? "").trim()
    if (!q) return
    const t = window.setTimeout(() => {
      document.getElementById(`lang-video-${q}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }, 100)
    return () => window.clearTimeout(t)
  }, [searchParams, sorted.length, id])

  const awaitingApproverVideos = useMemo(
    () => sorted.filter((v) => v.status === "AWAITING_APPROVER"),
    [sorted]
  )
  const blockingBrandReview = useMemo(
    () => sorted.filter((v) => v.status === "BRAND_REVIEW"),
    [sorted]
  )
  const canFinalApprovePackage =
    awaitingApproverVideos.length > 0 && blockingBrandReview.length === 0
  const allVideosTerminal = useMemo(
    () =>
      sorted.length > 0 &&
      sorted.every((v) => v.status === "APPROVED" || v.status === "WITHDRAWN"),
    [sorted]
  )

  async function finalApprove() {
    if (!token) return
    const targets = sorted.filter((v) => v.status === "AWAITING_APPROVER")
    if (targets.length === 0) return
    setBusy(true)
    const overallComments = approveComment.trim() || undefined
    try {
      for (const v of targets) {
        const list = await getLanguageVideoComments(token, v.id)
        if (videoThreadBlocksApprove(list, v.currentVersion)) {
          toast.error("Cannot approve yet", {
            description: VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION,
          })
          setBusy(false)
          return
        }
      }
      for (const v of targets) {
        const res = await approveLanguageVideo(token, v.id, {
          overallComments,
        })
        setPkg((p) => (p ? mergeLanguageVideoIntoPackage(p, res.data) : p))
      }
      toast.success(
        targets.length === 1
          ? "Language video approved"
          : `${targets.length} videos approved — package finalized`
      )
      setApproveOpen(false)
      setApproveComment("")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed")
    } finally {
      setBusy(false)
    }
  }

  if (!canAccess) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Content Approver or Super Admin only.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link href="/content-approver-language-packages">
            <ArrowLeft className="size-4" />
            Language packages
          </Link>
        </Button>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : error || !pkg ? (
          <p className="text-destructive">{error ?? "Not found"}</p>
        ) : (
          <>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {formatLanguageLabel(String(pkg.language))}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Updated {formatPackageDate(pkg.updatedAt)}
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight">
                {pkg.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {pkg.script?.title ?? "Script"}
              </p>
              {sorted.length > 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {sorted.length} video{sorted.length === 1 ? "" : "s"} in this
                  package — scroll to review each.
                </p>
              ) : null}
            </div>

            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No videos in package.
              </p>
            ) : (
              <div className="space-y-10">
                {sorted.map((video, index) => {
                  const va = getCurrentLanguageVideoAsset(video)
                  if (!va) return null
                  return (
                    <Card
                      key={video.id}
                      id={`lang-video-${video.id}`}
                      className="scroll-mt-24 shadow-sm"
                    >
                      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 border-b bg-muted/20 py-4">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            Video {index + 1} of {sorted.length}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                languageVideoStatusBadgeClass(video.status)
                              )}
                            >
                              {LANGUAGE_VIDEO_STATUS_LABELS[video.status]}
                            </Badge>
                          </div>
                          <CardTitle className="mt-2 text-lg">
                            {va.title?.trim() || va.fileName}
                          </CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-6">
                        {video.status === "AWAITING_APPROVER" ? (
                          <p className="text-sm text-muted-foreground">
                            Final sign-off — approve when this localized
                            deliverable is ready for publication.
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            This video is not awaiting final approval (
                            {LANGUAGE_VIDEO_STATUS_LABELS[video.status]}).
                          </p>
                        )}

                        {va.fileUrl ? (
                          <div className={languageDetailShellClass()}>
                            <LanguageVideoPlayerWithThread
                              languageVideo={video}
                              fileUrl={va.fileUrl}
                              mediaKey={va.id}
                              videoClassName={VIDEO_CLASS}
                            />
                          </div>
                        ) : null}

                        {va.description ? (
                          <p className="text-sm">{va.description}</p>
                        ) : null}

                        {(va.tags?.length ?? 0) > 0 ? (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              Tags
                            </p>
                            <TagPillList tags={va.tags} />
                          </div>
                        ) : null}

                        {(va.thumbnails?.length ?? 0) > 0 ? (
                          <div>
                            <p className="mb-2 flex items-center gap-1 text-sm font-medium text-muted-foreground">
                              <ImageIcon className="size-4" />
                              Thumbnails
                            </p>
                            <ul className="grid gap-3 sm:grid-cols-2">
                              {(va.thumbnails ?? []).map((t) => (
                                <li
                                  key={t.id}
                                  className="overflow-hidden rounded-lg border bg-card"
                                >
                                  <a
                                    href={t.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block aspect-video bg-muted"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={t.fileUrl}
                                      alt=""
                                      className="size-full object-cover"
                                    />
                                  </a>
                                  <p className="truncate p-2 text-xs text-muted-foreground">
                                    {t.fileName ?? t.id.slice(0, 8)}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}

            {sorted.length > 0 ? (
              <Card className="border-primary/25 bg-muted/20 shadow-sm">
                <CardHeader className="border-b bg-muted/30 py-4">
                  <CardTitle className="text-lg">
                    Package final approval
                  </CardTitle>
                  <p className="text-sm font-normal text-muted-foreground">
                    One action finalizes every video that is ready for your
                    sign-off. The API approves each video in sequence.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  {allVideosTerminal ? (
                    <p className="text-sm text-muted-foreground">
                      Every video in this package is already approved or
                      withdrawn.
                    </p>
                  ) : canFinalApprovePackage ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {awaitingApproverVideos.length} video
                        {awaitingApproverVideos.length === 1 ? "" : "s"} ready
                        for final approval.
                      </p>
                      <Button
                        type="button"
                        onClick={() => setApproveOpen(true)}
                        className="bg-green-600 text-white hover:bg-green-700"
                      >
                        Final approve package
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Final approval unlocks when every video has left
                      Content/Brand review.{" "}
                      {blockingBrandReview.length > 0
                        ? `${blockingBrandReview.length} still in brand review.`
                        : null}
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </div>

      <Dialog
        open={approveOpen}
        onOpenChange={(open) => {
          setApproveOpen(open)
          if (!open) setApproveComment("")
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Final approve package</DialogTitle>
            <DialogDescription>
              This will approve {awaitingApproverVideos.length} video
              {awaitingApproverVideos.length === 1 ? "" : "s"} in &ldquo;
              {pkg?.name ?? "this package"}&rdquo; for publication. Optional
              comments are applied to each approval request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="fc">Comments (optional)</Label>
            <Textarea
              id="fc"
              value={approveComment}
              onChange={(e) => setApproveComment(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void finalApprove()}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Approve package"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
