"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
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
import { useAuthStore } from "@/store"
import {
  approvePackageVideo,
  getPackage,
  rejectPackageVideo,
  reviewPackageThumbnail,
} from "@/lib/packages-api"
import {
  contentBrandPlaybackQualityActionsAvailable,
  deliverableLabelsByVideoId,
  getCurrentVideoAsset,
  mergeVideoIntoPackage,
  packageVideosSorted,
  thumbnailsOnAsset,
  videoAssetToPackageAsset,
} from "@/lib/package-video-helpers"
import type {
  FinalPackage,
  PackageItemFeedbackEntry,
  PackageThumbnailRecord,
  PackageVideo,
} from "@/types/package"
import type { UserRole } from "@/types/auth"
import {
  TRACK_STATUS_LABELS,
  VIDEO_STATUS_LABELS,
  formatPackageDate,
  videoStatusBadgeClass,
} from "@/lib/package-ui"
import { PackageVideoTatInline } from "@/components/packages/package-video-tat-inline"
import { PackageVideoMetadataProminent } from "@/components/packages/package-video-metadata-prominent"
import { PackageInlineVideoCard } from "@/components/packages/package-inline-video-card"
import { TagPillList } from "@/components/packages/tag-pill-list"
import { TrackStatusCallout } from "@/components/packages/track-status-callout"
import { PackageListTabNav } from "@/components/packages/package-list-tab-nav"
import {
  ArrowLeft,
  CheckCircle2,
  Clapperboard,
  ImageIcon,
  Info,
  Loader2,
  Smartphone,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

type BrandReviewTab = "videos" | "metadata"

type MetaRejectFieldState = { flag: boolean; comment: string }
type MetaRejectThumbState = { reject: boolean; comment: string }

type MetaRejectDraft = {
  overallComments: string
  title: MetaRejectFieldState
  description: MetaRejectFieldState
  tags: MetaRejectFieldState
  thumbs: Record<string, MetaRejectThumbState>
}

function emptyMetaRejectDraft(): MetaRejectDraft {
  return {
    overallComments: "",
    title: { flag: false, comment: "" },
    description: { flag: false, comment: "" },
    tags: { flag: false, comment: "" },
    thumbs: {},
  }
}

function thumbBadgeClass(s: PackageThumbnailRecord["status"]) {
  switch (s) {
    case "APPROVED":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
    case "REJECTED":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
    default:
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
  }
}

function usePendingMap() {
  const ref = useRef<Set<string>>(new Set())
  const [, bump] = useState(0)
  const snapshot = () => bump((n) => n + 1)

  const run = useCallback(async (key: string, fn: () => Promise<void>) => {
    if (ref.current.has(key)) return
    ref.current.add(key)
    snapshot()
    try {
      await fn()
    } finally {
      ref.current.delete(key)
      snapshot()
    }
  }, [])

  const isPending = useCallback((key: string) => ref.current.has(key), [])

  return { run, isPending }
}

export default function ContentBrandPackageDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const role = user?.role as UserRole | undefined
  const isBrand = role === "CONTENT_BRAND"
  const isSuper = role === "SUPER_ADMIN"
  const canAccess = isBrand || isSuper

  const [pkg, setPkg] = useState<FinalPackage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewTab, setReviewTab] = useState<BrandReviewTab>("metadata")
  const defaultTabAppliedForPkgId = useRef<string | null>(null)
  const { run, isPending } = usePendingMap()

  const [metaRejectVideo, setMetaRejectVideo] = useState<PackageVideo | null>(
    null
  )
  const [metaRejectDraft, setMetaRejectDraft] = useState<MetaRejectDraft>(
    emptyMetaRejectDraft
  )

  const [brandRejectVideo, setBrandRejectVideo] = useState<PackageVideo | null>(
    null
  )
  const [brandRejectComment, setBrandRejectComment] = useState("")

  const [metaApproveVideo, setMetaApproveVideo] = useState<PackageVideo | null>(
    null
  )
  const [metaApproveComment, setMetaApproveComment] = useState("")

  const [brandApproveVideo, setBrandApproveVideo] =
    useState<PackageVideo | null>(null)
  const [brandApproveComment, setBrandApproveComment] = useState("")

  const load = useCallback(async () => {
    if (!token || !id) return
    setLoading(true)
    setError(null)
    try {
      const res = await getPackage(token, id)
      setPkg(res.package)
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
    if (!metaRejectVideo) {
      setMetaRejectDraft(emptyMetaRejectDraft())
      return
    }
    const asset = getCurrentVideoAsset(metaRejectVideo)
    const thumbs = thumbnailsOnAsset(asset)
    setMetaRejectDraft({
      overallComments: "",
      title: { flag: false, comment: "" },
      description: { flag: false, comment: "" },
      tags: { flag: false, comment: "" },
      thumbs: Object.fromEntries(
        thumbs.map((t) => [t.id, { reject: false, comment: "" }])
      ),
    })
  }, [metaRejectVideo])

  const sortedVideos = useMemo(
    () => (pkg ? packageVideosSorted(pkg) : []),
    [pkg]
  )

  const metaQueueCount = useMemo(
    () =>
      sortedVideos.filter(
        (v) =>
          v.status === "MEDICAL_REVIEW" && v.metadataTrackStatus === "PENDING"
      ).length,
    [sortedVideos]
  )

  const videoQualityCount = useMemo(
    () => sortedVideos.filter(contentBrandPlaybackQualityActionsAvailable).length,
    [sortedVideos]
  )

  const deliverableLabels = useMemo(
    () => deliverableLabelsByVideoId(sortedVideos),
    [sortedVideos]
  )

  useEffect(() => {
    defaultTabAppliedForPkgId.current = null
  }, [id])

  useEffect(() => {
    const q = searchParams.get("tab")
    if (q === "videos" || q === "metadata") {
      setReviewTab(q)
      return
    }
    if (!pkg?.id) return
    if (defaultTabAppliedForPkgId.current === pkg.id) return
    defaultTabAppliedForPkgId.current = pkg.id
    if (videoQualityCount > 0) setReviewTab("videos")
    else setReviewTab("metadata")
  }, [searchParams, pkg?.id, videoQualityCount, metaQueueCount])

  async function handleApproveMetadata() {
    if (!token || !metaApproveVideo) return
    const asset = getCurrentVideoAsset(metaApproveVideo)
    if (!asset) return
    const thumbs = thumbnailsOnAsset(asset)
    if (thumbs.some((t) => t.status === "REJECTED")) {
      toast.error(
        "A thumbnail is already rejected. Reject the metadata track (or wait for Agency) before you can approve."
      )
      return
    }
    const pending = thumbs.filter((t) => t.status === "PENDING")
    await run(`meta-approve-${metaApproveVideo.id}`, async () => {
      for (const t of pending) {
        await reviewPackageThumbnail(token, t.id, {
          status: "APPROVED",
        })
      }
      const res = await approvePackageVideo(token, metaApproveVideo.id, {
        comments: metaApproveComment.trim() || "Metadata approved.",
      })
      setPkg((p) => (p ? mergeVideoIntoPackage(p, res.video) : p))
      setMetaApproveVideo(null)
      setMetaApproveComment("")
      toast.success(res.message ?? "Metadata approved")
      await load()
    })
  }

  async function handleRejectMetadata() {
    if (!token || !metaRejectVideo) return
    const asset = getCurrentVideoAsset(metaRejectVideo)
    if (!asset?.id) return

    const d = metaRejectDraft
    const itemFeedback: PackageItemFeedbackEntry[] = []

    const pushField = (
      field: "TITLE" | "DESCRIPTION" | "TAGS",
      state: MetaRejectFieldState
    ) => {
      if (!state.flag) return
      if (!state.comment.trim()) {
        throw new Error(
          `Add a comment for ${field === "TITLE" ? "title" : field === "DESCRIPTION" ? "description" : "tags"}.`
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
      pushField("TITLE", d.title)
      pushField("DESCRIPTION", d.description)
      pushField("TAGS", d.tags)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid feedback")
      return
    }

    for (const t of thumbnailsOnAsset(asset)) {
      const row = d.thumbs[t.id]
      if (!row?.reject) continue
      if (!row.comment.trim()) {
        toast.error(
          `Add a rejection comment for thumbnail${t.fileName ? ` “${t.fileName}”` : ""}.`
        )
        return
      }
      itemFeedback.push({
        videoAssetId: asset.id,
        thumbnailId: t.id,
        field: "THUMBNAIL",
        hasIssue: true,
        comment: row.comment.trim(),
      })
    }

    if (itemFeedback.length === 0) {
      toast.error(
        "Flag at least one of title, description, or tags, or mark at least one thumbnail for rejection — each needs a comment."
      )
      return
    }

    const overall =
      d.overallComments.trim() ||
      "Metadata track rejected — details are in the itemized feedback below."

    await run(`meta-reject-${metaRejectVideo.id}`, async () => {
      const res = await rejectPackageVideo(token, metaRejectVideo.id, {
        overallComments: overall,
        itemFeedback,
      })
      setPkg((p) => (p ? mergeVideoIntoPackage(p, res.video) : p))
      setMetaRejectVideo(null)
      setMetaRejectDraft(emptyMetaRejectDraft())
      toast.warning(res.message ?? "Metadata rejected")
      await load()
    })
  }

  async function handleApproveBrandVideo() {
    if (!token || !brandApproveVideo) return
    await run(`brand-approve-${brandApproveVideo.id}`, async () => {
      const res = await approvePackageVideo(token, brandApproveVideo.id, {
        comments: brandApproveComment.trim() || "Video quality approved.",
      })
      setPkg((p) => (p ? mergeVideoIntoPackage(p, res.video) : p))
      setBrandApproveVideo(null)
      setBrandApproveComment("")
      toast.success(res.message ?? "Approved")
      await load()
    })
  }

  async function handleRejectBrandVideo() {
    if (!token || !brandRejectVideo || !brandRejectComment.trim()) {
      toast.error("Add feedback for the video.")
      return
    }
    const asset = getCurrentVideoAsset(brandRejectVideo)
    if (!asset?.id) return
    await run(`brand-reject-${brandRejectVideo.id}`, async () => {
      const res = await rejectPackageVideo(token, brandRejectVideo.id, {
        overallComments: brandRejectComment.trim(),
        itemFeedback: [
          {
            videoAssetId: asset.id,
            field: "VIDEO",
            hasIssue: true,
            comment: brandRejectComment.trim(),
          },
        ],
      })
      setPkg((p) => (p ? mergeVideoIntoPackage(p, res.video) : p))
      setBrandRejectVideo(null)
      setBrandRejectComment("")
      toast.warning(res.message ?? "Sent back for Medical video review")
      await load()
    })
  }

  const reviewTabs = useMemo(
    () =>
      [
        {
          key: "videos" as const,
          label:
            videoQualityCount > 0 ? `Videos (${videoQualityCount})` : "Videos",
        },
        {
          key: "metadata" as const,
          label:
            metaQueueCount > 0 ? `Metadata (${metaQueueCount})` : "Metadata",
        },
      ] as const,
    [videoQualityCount, metaQueueCount]
  )

  if (!canAccess) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">Access denied.</p>
        <Button variant="link" asChild className="pl-0">
          <Link href="/content-brand-reviewer">Back</Link>
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading package…</p>
      </div>
    )
  }

  if (error || !pkg) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-destructive">{error ?? "Not found"}</p>
        <Button variant="link" asChild className="pl-0">
          <Link href="/content-brand-packages">Back</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Button variant="ghost" size="sm" className="mb-8 -ml-2" asChild>
          <Link href="/content-brand-packages">
            <ArrowLeft className="mr-2 size-4" />
            Content/Brand queue
          </Link>
        </Button>

        <header className="mb-8 space-y-3 border-b border-border pb-8">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Phase 6 · Content/Brand
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {pkg.name ?? pkg.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                Script:{" "}
                <span className="font-medium text-foreground">
                  {pkg.script?.title ?? "—"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Updated {formatPackageDate(pkg.updatedAt)}
              </p>
            </div>
            <Badge variant="secondary" className="w-fit shrink-0 font-normal">
              {sortedVideos.length} deliverable
              {sortedVideos.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            <strong>Metadata</strong> holds title, description, tags, and all
            thumbnails for every deliverable. <strong>Video quality</strong> is
            only the playable file and approve/reject for brand playback review.
            Each deliverable is independent — you can work across them at the
            same time.
          </p>
        </header>

        <section
          aria-label="Content Brand review workspace"
          className="space-y-4"
        >
          <Card className="border-blue-200/60 bg-blue-50/60 shadow-none dark:border-blue-900/40 dark:bg-blue-950/25">
            <CardContent className="flex gap-4 py-5 sm:py-6">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-700 dark:text-blue-300">
                <Info className="size-5" />
              </div>
              <div className="min-w-0 space-y-2 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">
                  How this page is organized
                </p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>
                    <span className="font-medium text-foreground">
                      Metadata
                    </span>{" "}
                    — Title, description, tags, and thumbnails. Reject metadata
                    (including specific thumbnails) from the rejection flow;
                    approving metadata auto-approves any still-pending thumbnails
                    first. Parallel with Medical while the deliverable is in
                    Medical review.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">
                      Video quality
                    </span>{" "}
                    — Video file only (no thumbnails here). Approve or reject
                    playback once <strong>this</strong> deliverable is in Brand
                    quality review (both tracks approved for that deliverable).
                    Other deliverables never block this one.
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-muted/20 px-1">
              <PackageListTabNav<BrandReviewTab>
                tabs={reviewTabs}
                active={reviewTab}
                onChange={(k) => {
                  setReviewTab(k)
                  router.replace(
                    `/content-brand-packages/${id}?tab=${encodeURIComponent(k)}`,
                    { scroll: false }
                  )
                }}
                ariaLabel="Metadata and video quality review"
              />
            </div>
            <div className="space-y-6 p-4 sm:p-6">
              {reviewTab === "metadata" ? (
                <BrandMetadataPanel
                  sortedVideos={sortedVideos}
                  deliverableLabels={deliverableLabels}
                  canAccess={canAccess}
                  setMetaApproveVideo={setMetaApproveVideo}
                  setMetaRejectVideo={setMetaRejectVideo}
                  isPending={isPending}
                />
              ) : (
                <BrandVideoQualityPanel
                  sortedVideos={sortedVideos}
                  deliverableLabels={deliverableLabels}
                  canAccess={canAccess}
                  setBrandApproveVideo={setBrandApproveVideo}
                  setBrandRejectVideo={setBrandRejectVideo}
                  isPending={isPending}
                />
              )}
            </div>
          </div>
        </section>
      </div>

      <Dialog
        open={metaApproveVideo != null}
        onOpenChange={() => setMetaApproveVideo(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve metadata track</DialogTitle>
            <DialogDescription>
              Any thumbnails still pending will be approved first (same as the
              per-thumbnail approve API), then the metadata track is approved.
              Thumbnails already marked rejected on this version cannot be
              approved here.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={metaApproveComment}
            onChange={(e) => setMetaApproveComment(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetaApproveVideo(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleApproveMetadata()}
              disabled={
                !metaApproveVideo ||
                isPending(`meta-approve-${metaApproveVideo.id}`)
              }
            >
              {metaApproveVideo &&
                isPending(`meta-approve-${metaApproveVideo.id}`) && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={metaRejectVideo != null}
        onOpenChange={(open) => {
          if (!open) setMetaRejectVideo(null)
        }}
      >
        <DialogContent
          showCloseButton
          className="flex max-h-[min(90vh,44rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        >
          {metaRejectVideo ? (
            <RejectMetadataDialogBody
              video={metaRejectVideo}
              draft={metaRejectDraft}
              setDraft={setMetaRejectDraft}
              deliverableLabel={
                deliverableLabels.get(metaRejectVideo.id) ?? "Deliverable"
              }
              onCancel={() => setMetaRejectVideo(null)}
              onSubmit={() => void handleRejectMetadata()}
              isPending={isPending(`meta-reject-${metaRejectVideo.id}`)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={brandApproveVideo != null}
        onOpenChange={() => setBrandApproveVideo(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve video</DialogTitle>
            <DialogDescription>
              If approved, this deliverable will move to content approver for finalreview.
              <br />
              Comments are optional.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={brandApproveComment}
            onChange={(e) => setBrandApproveComment(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBrandApproveVideo(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleApproveBrandVideo()}
              disabled={
                !brandApproveVideo ||
                isPending(`brand-approve-${brandApproveVideo.id}`)
              }
            >
              {brandApproveVideo &&
                isPending(`brand-approve-${brandApproveVideo.id}`) && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={brandRejectVideo != null}
        onOpenChange={() => setBrandRejectVideo(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject video</DialogTitle>
            <DialogDescription>
              Add a comment to send the video back to Agency for changes.
              <br />
              Comments are required.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={brandRejectComment}
            onChange={(e) => setBrandRejectComment(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBrandRejectVideo(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleRejectBrandVideo()}
              disabled={
                !brandRejectVideo ||
                isPending(`brand-reject-${brandRejectVideo.id}`)
              }
            >
              {brandRejectVideo &&
                isPending(`brand-reject-${brandRejectVideo.id}`) && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
              Reject & send feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RejectMetadataDialogBody({
  video,
  draft,
  setDraft,
  deliverableLabel,
  onCancel,
  onSubmit,
  isPending,
}: {
  video: PackageVideo
  draft: MetaRejectDraft
  setDraft: Dispatch<SetStateAction<MetaRejectDraft>>
  deliverableLabel: string
  onCancel: () => void
  onSubmit: () => void
  isPending: boolean
}) {
  const asset = getCurrentVideoAsset(video)
  const thumbs = thumbnailsOnAsset(asset)
  const titlePreview = (asset?.title ?? "").trim() || "—"
  const descPreview = (asset?.description ?? "").trim() || "—"
  return (
    <>
      <DialogHeader className="shrink-0 space-y-2 border-b border-border px-6 py-4 pr-14">
        <DialogTitle>Reject metadata track</DialogTitle>
        <DialogDescription>
          {deliverableLabel} — flag each problem area and add a comment. The API
          needs at least one issue with a comment. Submitting rejects the whole
          metadata track for Agency to resubmit.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="meta-reject-overall">Overall summary (optional)</Label>
            <Textarea
              id="meta-reject-overall"
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
              Metadata fields
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
                  tags={asset?.tags ?? []}
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

          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Thumbnails
            </p>
            <p className="text-xs text-muted-foreground">
              Check thumbnails to include in this rejection and add a comment for
              each selected image.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {thumbs.map((t) => {
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
          Reject metadata track
        </Button>
      </DialogFooter>
    </>
  )
}

function BrandMetadataPanel({
  sortedVideos,
  deliverableLabels,
  canAccess,
  setMetaApproveVideo,
  setMetaRejectVideo,
  isPending,
}: {
  sortedVideos: PackageVideo[]
  deliverableLabels: Map<string, string>
  canAccess: boolean
  setMetaApproveVideo: (v: PackageVideo | null) => void
  setMetaRejectVideo: (v: PackageVideo | null) => void
  isPending: (key: string) => boolean
}) {
  return (
    <div className="space-y-8">
      {sortedVideos.map((video) => {
        const asset = getCurrentVideoAsset(video)
        if (!asset) return null
        const label = deliverableLabels.get(video.id) ?? "Deliverable"
        const thumbs = thumbnailsOnAsset(asset)
        const anyRejected = thumbs.some((t) => t.status === "REJECTED")
        const pendingThumbCount = thumbs.filter(
          (t) => t.status === "PENDING"
        ).length
        const canMeta =
          video.status === "MEDICAL_REVIEW" &&
          video.metadataTrackStatus === "PENDING" &&
          canAccess
        const inMetaStage = video.status === "MEDICAL_REVIEW"

        return (
          <Card
            key={video.id}
            id={`video-${video.id}-metadata`}
            className="scroll-mt-24 overflow-hidden border-border shadow-sm"
          >
            <CardHeader className="border-b border-border bg-muted/15 py-5 sm:py-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">
                    {label}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Title, description, tags & thumbnails —{" "}
                    {VIDEO_STATUS_LABELS[video.status]}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Badge
                    variant="outline"
                    className={videoStatusBadgeClass(video.status)}
                  >
                    {VIDEO_STATUS_LABELS[video.status]}
                  </Badge>
                  <Badge variant="secondary" className="text-xs font-normal">
                    Meta: {TRACK_STATUS_LABELS[video.metadataTrackStatus]}
                  </Badge>
                </div>
              </div>
              <PackageVideoTatInline
                video={video}
                className="border-t border-border/60 pt-4"
              />
            </CardHeader>
            <CardContent className="space-y-6 px-4 py-6 sm:px-6">
              <PackageVideoMetadataProminent
                variant="embedded"
                deliverableLabel={label}
                title={asset.title}
                description={asset.description}
                tags={asset.tags ?? undefined}
              />

              {!inMetaStage && (
                <p className="rounded-lg border border-dashed border-border bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
                  Thumbnails and copy stay on this tab for reference. Open the{" "}
                  <strong>Video quality</strong> tab to play the file and
                  approve or reject video quality when this deliverable is in
                  brand video review.
                </p>
              )}

              {inMetaStage && (
                <TrackStatusCallout
                  status={video.metadataTrackStatus}
                  title="Metadata & thumbnails"
                >
                  <p>
                    Use <strong>Reject metadata</strong> to flag copy and/or
                    thumbnails in one place. <strong>Approve metadata</strong>{" "}
                    approves any pending thumbnails automatically, then the
                    metadata track.
                  </p>
                  {!canMeta && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No metadata action from you on this version (already
                      approved or not pending).
                    </p>
                  )}
                </TrackStatusCallout>
              )}

              <div>
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <ImageIcon className="size-4" />
                  Thumbnails
                  {(!inMetaStage || !canMeta) && (
                    <span className="font-normal text-muted-foreground normal-case">
                      (read-only)
                    </span>
                  )}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {thumbs.map((t) => (
                    <Card key={t.id} className="overflow-hidden">
                      <a
                        href={t.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block aspect-video bg-muted"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={t.fileUrl}
                          alt={t.fileName}
                          className="size-full object-cover"
                        />
                      </a>
                      <CardContent className="space-y-2 p-3">
                        <Badge
                          className={thumbBadgeClass(t.status)}
                          variant="secondary"
                        >
                          {t.status}
                        </Badge>
                        {t.status === "REJECTED" && t.comment && (
                          <p className="text-xs text-destructive">
                            {t.comment}
                          </p>
                        )}
                        {t.status === "PENDING" && canMeta ? (
                          <p className="text-xs text-muted-foreground">
                            Will be approved when you confirm{" "}
                            <span className="font-medium text-foreground">
                              Approve metadata
                            </span>
                            .
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {inMetaStage && (
                <div className="space-y-3 border-t border-border pt-5">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={
                        !canMeta ||
                        anyRejected ||
                        isPending(`meta-approve-${video.id}`)
                      }
                      className="bg-green-600 text-white hover:bg-green-700"
                      onClick={() => setMetaApproveVideo(video)}
                    >
                      {isPending(`meta-approve-${video.id}`) ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 size-4" />
                      )}
                      Approve metadata
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      disabled={
                        !canMeta || isPending(`meta-reject-${video.id}`)
                      }
                      onClick={() => setMetaRejectVideo(video)}
                    >
                      {isPending(`meta-reject-${video.id}`) ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <XCircle className="mr-2 size-4" />
                      )}
                      Reject metadata
                    </Button>
                  </div>
                  {anyRejected && (
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Rejected thumbnails block metadata approval — reject the
                      metadata track so Agency can resubmit.
                    </p>
                  )}
                  {canMeta && !anyRejected && pendingThumbCount > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {pendingThumbCount} thumbnail
                      {pendingThumbCount === 1 ? "" : "s"} still pending — they
                      are approved automatically when you use Approve metadata.
                    </p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function BrandVideoQualityPanel({
  sortedVideos,
  deliverableLabels,
  canAccess,
  setBrandApproveVideo,
  setBrandRejectVideo,
  isPending,
}: {
  sortedVideos: PackageVideo[]
  deliverableLabels: Map<string, string>
  canAccess: boolean
  setBrandApproveVideo: (v: PackageVideo | null) => void
  setBrandRejectVideo: (v: PackageVideo | null) => void
  isPending: (key: string) => boolean
}) {
  return (
    <div className="space-y-8">
      {sortedVideos.map((video) => {
        const asset = getCurrentVideoAsset(video)
        if (!asset) return null
        const pa = videoAssetToPackageAsset(asset)
        const label = deliverableLabels.get(video.id) ?? "Deliverable"
        const icon: ReactNode =
          video.type === "LONG_FORM" ? (
            <Clapperboard className="size-5" />
          ) : (
            <Smartphone className="size-5" />
          )
        const showQualityUi = contentBrandPlaybackQualityActionsAvailable(video)
        const canBrandQuality = showQualityUi && canAccess
        const waitingMetaForBrandQuality =
          video.status === "MEDICAL_REVIEW" &&
          video.videoTrackStatus === "APPROVED" &&
          video.metadataTrackStatus === "PENDING"

        return (
          <Card
            key={video.id}
            id={`video-${video.id}-quality`}
            className="scroll-mt-24 overflow-hidden border-border shadow-sm"
          >
            <CardHeader className="border-b border-border bg-muted/15 py-5 sm:py-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">
                    {label}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Video file only — thumbnails and copy are on the Metadata
                    tab.
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className={videoStatusBadgeClass(video.status)}
                >
                  {VIDEO_STATUS_LABELS[video.status]}
                </Badge>
              </div>
              <PackageVideoTatInline
                video={video}
                className="border-t border-border/60 pt-4"
              />
            </CardHeader>
            <CardContent className="space-y-6 px-4 py-6 sm:px-6">
              {!showQualityUi && (
                <p className="rounded-lg border border-dashed border-border bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
                  Preview the file below for context. Playback-quality
                  approve/reject uses the same API as Brand quality review and is
                  only available per deliverable once it reaches that stage.
                  {!waitingMetaForBrandQuality ? (
                    <>
                      {" "}
                      Stage: {VIDEO_STATUS_LABELS[video.status]}.
                    </>
                  ) : (
                    <>
                      {" "}
                      Medical has approved the video file for this deliverable;
                      approve the metadata track on the <strong>Metadata</strong>{" "}
                      tab (thumbnails and copy) so this deliverable can move to
                      Brand quality review. Other deliverables in the package do
                      not block this one.
                    </>
                  )}
                </p>
              )}

              {showQualityUi ? (
                <TrackStatusCallout
                  status="PENDING"
                  title="Video quality"
                  appearanceStatus="PENDING"
                  badgeLabel={
                    video.status === "MEDICAL_REVIEW"
                      ? "Ready for playback review (recovered)"
                      : "Both tracks approved"
                  }
                  headerDescription="Review playback and technical quality before final approver."
                >
                  <p>
                    Approve to send to Content Approver, or reject to return to
                    Medical / Agency for a new file.
                  </p>
                  {!canBrandQuality && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      You do not have permission to act on this deliverable.
                    </p>
                  )}
                </TrackStatusCallout>
              ) : null}

              <PackageInlineVideoCard
                asset={pa}
                label={label}
                icon={icon}
                videoOnly
              />

              {showQualityUi ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 text-white hover:bg-green-700"
                    disabled={
                      !canBrandQuality || isPending(`brand-approve-${video.id}`)
                    }
                    onClick={() => setBrandApproveVideo(video)}
                  >
                    {isPending(`brand-approve-${video.id}`) ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 size-4" />
                    )}
                    Approve video
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10"
                    disabled={
                      !canBrandQuality || isPending(`brand-reject-${video.id}`)
                    }
                    onClick={() => setBrandRejectVideo(video)}
                  >
                    {isPending(`brand-reject-${video.id}`) ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <XCircle className="mr-2 size-4" />
                    )}
                    Reject video
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
