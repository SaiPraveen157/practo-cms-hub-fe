"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
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
import { useAuthStore } from "@/store"
import type { UserRole } from "@/types/auth"
import {
  approveLanguageVideo,
  getLanguagePackage,
  rejectLanguageVideo,
  reviewLanguageThumbnail,
} from "@/lib/language-packages-api"
import {
  getCurrentLanguageVideoAsset,
  mergeLanguageVideoIntoPackage,
  languageVideosSorted,
} from "@/lib/language-package-video-helpers"
import type {
  LanguageItemFeedbackEntry,
  LanguagePackage,
  LanguageVideo,
  LanguageVideoAsset,
} from "@/types/language-package"
import {
  formatLanguageLabel,
  languageDetailShellClass,
  languageVideoStatusBadgeClass,
  LANGUAGE_VIDEO_STATUS_LABELS,
} from "@/lib/language-package-ui"
import { TagPillList } from "@/components/packages/tag-pill-list"
import { languageVideoAwaitingAgencyAfterBrandRejectOnCurrentAsset } from "@/lib/language-phase-gates"
import { formatPackageDate } from "@/lib/package-ui"
import { ArrowLeft, ImageIcon, Loader2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const VIDEO_CLASS =
  "h-auto w-full max-w-full object-contain max-h-[min(85vh,40rem)]"

type LangRejectFieldState = { flag: boolean; comment: string }

/** Same shape as Phase 6 metadata reject thumbnails (`MetaRejectThumbState`). */
type LangRejectThumbRow = { reject: boolean; comment: string }

type LangRejectDraft = {
  overallComments: string
  video: LangRejectFieldState
  title: LangRejectFieldState
  description: LangRejectFieldState
  tags: LangRejectFieldState
  thumbs: Record<string, LangRejectThumbRow>
}

function emptyLangRejectDraft(
  asset?: LanguageVideoAsset | null
): LangRejectDraft {
  const thumbs: Record<string, LangRejectThumbRow> = {}
  for (const t of asset?.thumbnails ?? []) {
    thumbs[t.id] = { reject: false, comment: "" }
  }
  return {
    overallComments: "",
    video: { flag: false, comment: "" },
    title: { flag: false, comment: "" },
    description: { flag: false, comment: "" },
    tags: { flag: false, comment: "" },
    thumbs,
  }
}

export default function ContentBrandLanguagePackageDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const role = user?.role as UserRole | undefined
  const canBrand = role === "CONTENT_BRAND" || role === "SUPER_ADMIN"

  const [pkg, setPkg] = useState<LanguagePackage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)
  const [approveVideoId, setApproveVideoId] = useState<string | null>(null)
  const [approveComment, setApproveComment] = useState("")
  const [approveBusy, setApproveBusy] = useState(false)

  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectTargetVideo, setRejectTargetVideo] =
    useState<LanguageVideo | null>(null)
  const [rejectDraft, setRejectDraft] = useState<LangRejectDraft>(() =>
    emptyLangRejectDraft(undefined)
  )
  const [rejectBusy, setRejectBusy] = useState(false)

  /**
   * GET payloads sometimes omit `reviews`; after reject, hide actions until
   * `reviews` includes the rejection or Agency bumps `currentVersion`.
   */
  const [brandRejectedAssetVersion, setBrandRejectedAssetVersion] = useState<
    Record<string, number>
  >({})

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

  useEffect(() => {
    if (!pkg?.videos?.length) return
    setBrandRejectedAssetVersion((prev) => {
      const next = { ...prev }
      let changed = false
      for (const vid of Object.keys(next)) {
        const v = pkg.videos?.find((x) => x.id === vid)
        if (!v) {
          delete next[vid]
          changed = true
          continue
        }
        if (v.currentVersion !== next[vid]) {
          delete next[vid]
          changed = true
          continue
        }
        if (languageVideoAwaitingAgencyAfterBrandRejectOnCurrentAsset(v)) {
          delete next[vid]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [pkg])

  const sorted = useMemo(
    () => (pkg ? languageVideosSorted(pkg) : []),
    [pkg]
  )

  const rejectAsset = useMemo(
    () =>
      rejectTargetVideo
        ? getCurrentLanguageVideoAsset(rejectTargetVideo)
        : undefined,
    [rejectTargetVideo]
  )

  const approveTargetLabel = useMemo(() => {
    if (!approveVideoId) return ""
    const v = sorted.find((x) => x.id === approveVideoId)
    const a = v ? getCurrentLanguageVideoAsset(v) : undefined
    return a?.title?.trim() || a?.fileName || approveVideoId.slice(0, 8)
  }, [sorted, approveVideoId])

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

  function openApproveDialog(videoId: string) {
    setApproveVideoId(videoId)
    setApproveOpen(true)
  }

  async function submitApprove() {
    if (!token || !approveVideoId) return
    setApproveBusy(true)
    try {
      const video =
        sorted.find((x) => x.id === approveVideoId) ??
        pkg?.videos?.find((x) => x.id === approveVideoId)
      const asset = video ? getCurrentLanguageVideoAsset(video) : undefined
      const thumbs = asset?.thumbnails ?? []
      for (const t of thumbs) {
        if (t.status === "APPROVED") continue
        await reviewLanguageThumbnail(token, t.id, { status: "APPROVED" })
      }

      const res = await approveLanguageVideo(token, approveVideoId, {
        overallComments: approveComment.trim() || undefined,
      })
      setPkg((p) =>
        p ? mergeLanguageVideoIntoPackage(p, res.data) : p
      )
      setBrandRejectedAssetVersion((prev) => {
        if (!approveVideoId || !(approveVideoId in prev)) return prev
        const next = { ...prev }
        delete next[approveVideoId]
        return next
      })
      toast.success("Sent to final approval")
      setApproveOpen(false)
      setApproveVideoId(null)
      setApproveComment("")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed")
    } finally {
      setApproveBusy(false)
    }
  }

  function openRejectDialog(video: LanguageVideo) {
    const a = getCurrentLanguageVideoAsset(video)
    if (!a) return
    setRejectTargetVideo(video)
    setRejectDraft(emptyLangRejectDraft(a))
    setRejectOpen(true)
  }

  async function submitReject() {
    if (!token || !rejectTargetVideo) return
    const asset = getCurrentLanguageVideoAsset(rejectTargetVideo)
    if (!asset?.id) return
    const d = rejectDraft
    const itemFeedback: LanguageItemFeedbackEntry[] = []

    const pushField = (
      field: "video" | "title" | "description" | "tags",
      state: LangRejectFieldState
    ) => {
      if (!state.flag) return
      if (!state.comment.trim()) {
        throw new Error(
          field === "video"
            ? "Add a comment for the video file."
            : field === "title"
              ? "Add a comment for the title."
              : field === "description"
                ? "Add a comment for the description."
                : "Add a comment for the tags."
        )
      }
      itemFeedback.push({
        videoAssetId: asset.id,
        field,
        hasIssue: true,
        comment: state.comment.trim(),
      })
    }

    try {
      pushField("video", d.video)
      pushField("title", d.title)
      pushField("description", d.description)
      pushField("tags", d.tags)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid feedback")
      return
    }

    const thumbList = asset.thumbnails ?? []
    for (const t of thumbList) {
      const row = d.thumbs[t.id]
      if (row?.reject && !row.comment.trim()) {
        toast.error(
          `Add a rejection comment for thumbnail${t.fileName ? ` “${t.fileName}”` : ""}.`
        )
        return
      }
      if (row?.reject) {
        itemFeedback.push({
          videoAssetId: asset.id,
          thumbnailId: t.id,
          field: "thumbnail",
          hasIssue: true,
          comment: row.comment.trim(),
        })
      }
    }

    if (itemFeedback.length === 0) {
      toast.error(
        "Flag at least one of video, title, description, or tags, or reject at least one thumbnail — each flagged item needs a comment."
      )
      return
    }

    const overall =
      d.overallComments.trim() ||
      "Language video rejected — see itemized feedback below."

    setRejectBusy(true)
    try {
      for (const t of thumbList) {
        const row = d.thumbs[t.id] ?? { reject: false, comment: "" }
        await reviewLanguageThumbnail(
          token,
          t.id,
          row.reject
            ? { status: "REJECTED", comment: row.comment.trim() }
            : { status: "APPROVED" }
        )
      }
      const res = await rejectLanguageVideo(token, rejectTargetVideo.id, {
        overallComments: overall,
        itemFeedback,
      })
      const vid = rejectTargetVideo.id
      const ver = rejectTargetVideo.currentVersion
      setBrandRejectedAssetVersion((prev) => ({ ...prev, [vid]: ver }))
      setPkg((p) =>
        p ? mergeLanguageVideoIntoPackage(p, res.data) : p
      )
      toast.warning(res.message ?? "Video rejected — Agency can resubmit")
      setRejectOpen(false)
      setRejectTargetVideo(null)
      setRejectDraft(emptyLangRejectDraft(undefined))
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed")
    } finally {
      setRejectBusy(false)
    }
  }

  if (!canBrand) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Content/Brand or Super Admin only.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link href="/content-brand-language-packages">
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
              <p className="text-sm text-muted-foreground">No videos in package.</p>
            ) : (
              <div className="space-y-10">
                {sorted.map((video, index) => {
                  const va = getCurrentLanguageVideoAsset(video)
                  if (!va) return null
                  const brandActionsBlocked =
                    languageVideoAwaitingAgencyAfterBrandRejectOnCurrentAsset(
                      video
                    ) ||
                    brandRejectedAssetVersion[video.id] === video.currentVersion
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
                        {video.status === "BRAND_REVIEW" ? (
                          brandActionsBlocked ? (
                            <p className="text-sm text-muted-foreground">
                              You&apos;ve sent rejection feedback for this
                              version. Approve/reject will be available again
                              after Agency resubmits (new version).
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              Approve this video when ready, or open Reject to
                              send feedback (check any thumbnails to reject
                              there, Phase 6 style). Thumbnails below are for
                              preview only.
                            </p>
                          )
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Not in Content/Brand review (
                            {LANGUAGE_VIDEO_STATUS_LABELS[video.status]}).
                          </p>
                        )}

                        {va.fileUrl ? (
                          <div className={languageDetailShellClass()}>
                            <video
                              src={va.fileUrl}
                              controls
                              playsInline
                              preload="metadata"
                              className={VIDEO_CLASS}
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
                              Thumbnails (reference)
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
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No thumbnails for this video.
                          </p>
                        )}

                        {video.status === "BRAND_REVIEW" &&
                        !brandActionsBlocked ? (
                          <div className="flex flex-wrap gap-2 border-t pt-4">
                            <Button
                              type="button"
                              onClick={() => openApproveDialog(video.id)}
                              className="bg-green-600 text-white hover:bg-green-700"
                            >
                              Approve package
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => openRejectDialog(video)}
                              className="text-destructive hover:bg-destructive/10"
                            >
                              Reject package
                            </Button>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      <Dialog
        open={approveOpen}
        onOpenChange={(open) => {
          setApproveOpen(open)
          if (!open) {
            setApproveVideoId(null)
            setApproveComment("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve language video</DialogTitle>
            {approveTargetLabel ? (
              <DialogDescription>
                Confirm approval for: {approveTargetLabel}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ac">Comments (optional)</Label>
            <Textarea
              id="ac"
              value={approveComment}
              onChange={(e) => setApproveComment(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApproveOpen(false)
                setApproveVideoId(null)
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={approveBusy || !approveVideoId}
              onClick={() => void submitApprove()}
            >
              {approveBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open)
          if (!open) {
            setRejectTargetVideo(null)
            setRejectDraft(emptyLangRejectDraft(undefined))
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="flex max-h-[min(90vh,44rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        >
          {rejectTargetVideo && rejectAsset ? (
            <RejectLanguageVideoDialogBody
              asset={rejectAsset}
              videoLabel={
                rejectAsset.title?.trim() ||
                rejectAsset.fileName ||
                `Video ${rejectTargetVideo.id.slice(0, 8)}`
              }
              draft={rejectDraft}
              setDraft={setRejectDraft}
              onCancel={() => {
                setRejectOpen(false)
                setRejectTargetVideo(null)
                setRejectDraft(emptyLangRejectDraft(undefined))
              }}
              onSubmit={() => void submitReject()}
              isPending={rejectBusy}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RejectLanguageVideoDialogBody({
  asset,
  videoLabel,
  draft,
  setDraft,
  onCancel,
  onSubmit,
  isPending,
}: {
  asset: LanguageVideoAsset
  videoLabel: string
  draft: LangRejectDraft
  setDraft: Dispatch<SetStateAction<LangRejectDraft>>
  onCancel: () => void
  onSubmit: () => void
  isPending: boolean
}) {
  const titlePreview = (asset.title ?? "").trim() || "—"
  const descPreview = (asset.description ?? "").trim() || "—"
  const fileLabel = asset.fileName?.trim() || "Encoded video file"

  return (
    <>
      <DialogHeader className="shrink-0 space-y-2 border-b border-border px-6 py-4 pr-14">
        <DialogTitle>Reject language video</DialogTitle>
        <DialogDescription>
          <span className="font-medium text-foreground">{videoLabel}</span> —
          Flag each problem area and add a comment. For thumbnails, check only the
          images to reject and add a comment for each (same as Phase 6). At least
          one issue is required. Thumbnail reviews are saved first, then the
          video rejection is sent.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="lang-reject-overall">Overall summary (optional)</Label>
            <Textarea
              id="lang-reject-overall"
              value={draft.overallComments}
              onChange={(e) =>
                setDraft((d) => ({ ...d, overallComments: e.target.value }))
              }
              rows={2}
              placeholder="High-level note for the rejection record…"
              className="resize-y"
            />
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Video file
            </p>
            <label className="flex cursor-pointer gap-3 rounded-md border border-transparent p-2 hover:bg-muted/40 has-checked:border-border has-checked:bg-background">
              <input
                type="checkbox"
                checked={draft.video.flag}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    video: { ...d.video, flag: e.target.checked },
                  }))
                }
                className="mt-1 size-4 shrink-0 rounded border-input"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <span className="text-sm font-medium">Encoded video / playback</span>
                <p className="text-xs text-muted-foreground">{fileLabel}</p>
                {draft.video.flag ? (
                  <Textarea
                    value={draft.video.comment}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        video: { ...d.video, comment: e.target.value },
                      }))
                    }
                    rows={3}
                    placeholder="e.g. Audio sync, branding, length, compression…"
                    className="resize-y text-sm"
                  />
                ) : null}
              </div>
            </label>
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Title, description & tags
            </p>

            <label className="flex cursor-pointer gap-3 rounded-md border border-transparent p-2 hover:bg-muted/40 has-checked:border-border has-checked:bg-background">
              <input
                type="checkbox"
                checked={draft.title.flag}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    title: { ...d.title, flag: e.target.checked },
                  }))
                }
                className="mt-1 size-4 shrink-0 rounded border-input"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <span className="text-sm font-medium">Title</span>
                <p className="text-xs text-muted-foreground line-clamp-3">
                  {titlePreview}
                </p>
                {draft.title.flag ? (
                  <Textarea
                    value={draft.title.comment}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        title: { ...d.title, comment: e.target.value },
                      }))
                    }
                    rows={2}
                    placeholder="What should change in the title?"
                    className="resize-y text-sm"
                  />
                ) : null}
              </div>
            </label>

            <label className="flex cursor-pointer gap-3 rounded-md border border-transparent p-2 hover:bg-muted/40 has-checked:border-border has-checked:bg-background">
              <input
                type="checkbox"
                checked={draft.description.flag}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    description: {
                      ...d.description,
                      flag: e.target.checked,
                    },
                  }))
                }
                className="mt-1 size-4 shrink-0 rounded border-input"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <span className="text-sm font-medium">Description</span>
                <p className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                  {descPreview}
                </p>
                {draft.description.flag ? (
                  <Textarea
                    value={draft.description.comment}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        description: {
                          ...d.description,
                          comment: e.target.value,
                        },
                      }))
                    }
                    rows={3}
                    placeholder="What should change in the description?"
                    className="resize-y text-sm"
                  />
                ) : null}
              </div>
            </label>

            <label className="flex cursor-pointer gap-3 rounded-md border border-transparent p-2 hover:bg-muted/40 has-checked:border-border has-checked:bg-background">
              <input
                type="checkbox"
                checked={draft.tags.flag}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    tags: { ...d.tags, flag: e.target.checked },
                  }))
                }
                className="mt-1 size-4 shrink-0 rounded border-input"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <span className="text-sm font-medium">Tags</span>
                <TagPillList
                  tags={asset.tags ?? []}
                  emptyLabel={
                    <span className="text-xs text-muted-foreground">—</span>
                  }
                />
                {draft.tags.flag ? (
                  <Textarea
                    value={draft.tags.comment}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        tags: { ...d.tags, comment: e.target.value },
                      }))
                    }
                    rows={2}
                    placeholder="What should change in the tags?"
                    className="resize-y text-sm"
                  />
                ) : null}
              </div>
            </label>
          </div>

          {(asset.thumbnails?.length ?? 0) > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Thumbnails
              </p>
              <p className="text-xs text-muted-foreground">
                Check thumbnails to include in this rejection and add a comment for
                each selected image. Unchecked thumbnails are marked approved when
                you submit.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {(asset.thumbnails ?? []).map((t) => {
                  const row = draft.thumbs[t.id] ?? {
                    reject: false,
                    comment: "",
                  }
                  return (
                    <div
                      key={t.id}
                      className="overflow-hidden rounded-lg border border-border bg-card"
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
                          alt={t.fileName ?? "Thumbnail"}
                          className="size-full object-cover"
                        />
                      </a>
                      <div className="space-y-2 p-3">
                        <p className="truncate text-xs text-muted-foreground">
                          {t.fileName ?? t.id.slice(0, 8)}
                        </p>
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={row.reject}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                thumbs: {
                                  ...d.thumbs,
                                  [t.id]: {
                                    reject: e.target.checked,
                                    comment: e.target.checked
                                      ? d.thumbs[t.id]?.comment ?? ""
                                      : "",
                                  },
                                },
                              }))
                            }
                            className="size-4 shrink-0 rounded border-input"
                          />
                          Reject this thumbnail
                        </label>
                        {row.reject ? (
                          <Textarea
                            value={row.comment}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                thumbs: {
                                  ...d.thumbs,
                                  [t.id]: {
                                    ...row,
                                    comment: e.target.value,
                                  },
                                },
                              }))
                            }
                            rows={2}
                            placeholder="What is wrong with this thumbnail?"
                            className="resize-y text-xs"
                          />
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <DialogFooter className="mx-0 mb-0 shrink-0 border-t border-border bg-muted/30 px-6 py-4 sm:mx-0">
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onSubmit} disabled={isPending}>
          {isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <XCircle className="mr-2 size-4" />
          )}
          Reject & send feedback
        </Button>
      </DialogFooter>
    </>
  )
}
