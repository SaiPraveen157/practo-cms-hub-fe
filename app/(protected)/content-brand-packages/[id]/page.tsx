"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
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
import { approvePackage, getPackage, rejectPackage } from "@/lib/packages-api"
import type {
  FinalPackage,
  PackageAsset,
  PackageItemFeedbackEntry,
  PackageItemFeedbackField,
  PackageStatus,
} from "@/types/package"
import type { UserRole } from "@/types/auth"
import {
  PACKAGE_STATUS_LABELS,
  TRACK_STATUS_LABELS,
  assetsOfType,
  formatPackageDate,
  formatPackageFileSize,
  packageStatusBadgeClass,
  thumbnailsForVideo,
  videoAssets,
} from "@/lib/package-ui"
import { PackageTatCard } from "@/components/packages/package-tat-card"
import { PackageInlineVideoCard } from "@/components/packages/package-inline-video-card"
import { PackageListTabNav } from "@/components/packages/package-list-tab-nav"
import { TrackStatusCallout } from "@/components/packages/track-status-callout"
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle,
  CheckCircle2,
  Clapperboard,
  ExternalLink,
  FileText,
  Hash,
  ImageIcon,
  Info,
  Loader2,
  Smartphone,
  User,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  parseAgencyDeliverableBlockBody,
  videoDeliverableBlocksFromPackage,
} from "@/lib/package-composed-description"

type PerVideoRejectDraft = {
  title: string
  description: string
  tags: string
  thumbnail: string
  video: string
}

const EMPTY_PER_VIDEO_REJECT: PerVideoRejectDraft = {
  title: "",
  description: "",
  tags: "",
  thumbnail: "",
  video: "",
}

function initialRejectDraftsForAssets(
  assets: PackageAsset[]
): Record<string, PerVideoRejectDraft> {
  const o: Record<string, PerVideoRejectDraft> = {}
  for (const v of assets) {
    o[v.id] = { ...EMPTY_PER_VIDEO_REJECT }
  }
  return o
}

/** Brand sign-off on full video package (Postman: BRAND_REVIEW stage). */
function contentBrandCanSignOffVideos(
  pkg: FinalPackage,
  canAccess: boolean
): boolean {
  if (!canAccess) return false
  if (pkg.status === "BRAND_REVIEW") return true
  return (
    pkg.status === "MEDICAL_REVIEW" &&
    pkg.videoTrackStatus === "APPROVED" &&
    pkg.metadataTrackStatus === "APPROVED"
  )
}

export default function ContentBrandPackageDetailPage() {
  const params = useParams()
  const router = useRouter()
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
  /** Video asset id → chosen thumbnail asset id (metadata approve). */
  const [thumbnailSelectionByVideoId, setThumbnailSelectionByVideoId] =
    useState<Record<string, string>>({})
  const [metaApproveOpen, setMetaApproveOpen] = useState(false)
  const [metaComments, setMetaComments] = useState("")
  const [videoApproveOpen, setVideoApproveOpen] = useState(false)
  const [videoComments, setVideoComments] = useState("")
  const [rejectOpen, setRejectOpen] = useState(false)
  /** Per video asset id — line-item feedback is not duplicated across deliverables. */
  const [rejectDraftByVideoId, setRejectDraftByVideoId] = useState<
    Record<string, PerVideoRejectDraft>
  >({})
  const [rejectMode, setRejectMode] = useState<"metadata" | "video" | null>(
    null
  )
  /** Active deliverable in the reject dialog (pill tabs). */
  const [rejectDeliverableTabIndex, setRejectDeliverableTabIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  /** Videos first, then metadata — matches agency package detail tab order. */
  const [brandPackageWorkTab, setBrandPackageWorkTab] = useState<
    "videos" | "metadata"
  >("videos")

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
    if (!pkg) return
    const videos = [...videoAssets(pkg)].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    )
    const next: Record<string, string> = {}
    for (const v of videos) {
      const tlist = thumbnailsForVideo(v)
      if (tlist.length) {
        const picked = tlist.find((t) => t.isSelected) ?? tlist[0]
        if (picked) next[v.id] = picked.id
      }
    }
    setThumbnailSelectionByVideoId(next)
    // Re-sync when opening a package or when server bumps version — not on every pkg reference change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: avoid wiping in-progress thumbnail picks
  }, [pkg?.id, pkg?.version])

  const canApproveMetadata =
    pkg?.status === "MEDICAL_REVIEW" &&
    pkg.metadataTrackStatus === "PENDING" &&
    canAccess

  const longAssets = useMemo(
    () => assetsOfType(pkg ?? ({} as FinalPackage), "LONG_FORM"),
    [pkg]
  )
  const shortAssets = useMemo(() => {
    const list = assetsOfType(pkg ?? ({} as FinalPackage), "SHORT_FORM")
    return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }, [pkg])
  const sortedVideoAssets = useMemo(() => {
    if (!pkg) return []
    return [...videoAssets(pkg)].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }, [pkg])

  const videoRejectLabelById = useMemo(() => {
    const m = new Map<string, string>()
    let shortNum = 0
    for (const v of sortedVideoAssets) {
      m.set(
        v.id,
        v.type === "LONG_FORM" ? "Long-form (main)" : `Short-form ${++shortNum}`
      )
    }
    return m
  }, [sortedVideoAssets])

  const openRejectDialog = useCallback(
    (mode: "metadata" | "video") => {
      setRejectMode(mode)
      setRejectDeliverableTabIndex(0)
      setRejectDraftByVideoId(initialRejectDraftsForAssets(sortedVideoAssets))
      setRejectOpen(true)
    },
    [sortedVideoAssets]
  )

  const patchRejectDraft = useCallback(
    (assetId: string, patch: Partial<PerVideoRejectDraft>) => {
      setRejectDraftByVideoId((prev) => ({
        ...prev,
        [assetId]: {
          ...EMPTY_PER_VIDEO_REJECT,
          ...prev[assetId],
          ...patch,
        },
      }))
    },
    []
  )

  const resetRejectDialog = useCallback(() => {
    setRejectMode(null)
    setRejectDeliverableTabIndex(0)
    setRejectDraftByVideoId({})
  }, [])

  const videoDeliverableBlocks = useMemo(
    () => (pkg ? videoDeliverableBlocksFromPackage(pkg) : []),
    [pkg]
  )

  /** Per deliverable: copy + preview thumb for stacked metadata sections. */
  const metadataRows = useMemo(() => {
    if (!pkg || sortedVideoAssets.length === 0) return []
    return sortedVideoAssets.map((v, i) => {
      const block =
        videoDeliverableBlocks.length > 1
          ? videoDeliverableBlocks[i]
          : videoDeliverableBlocks[0]
      const parsed = block
        ? parseAgencyDeliverableBlockBody(block.body)
        : { title: "", description: "", tags: [] as string[] }
      const metadataVideoTitle =
        v.title?.trim() ||
        parsed.title.trim() ||
        (videoDeliverableBlocks.length <= 1
          ? (pkg.name ?? pkg.title)
          : (block?.heading ?? "—"))
      const metadataVideoDescription =
        parsed.description.trim() ||
        (!parsed.title.trim() &&
        parsed.tags.length === 0 &&
        block?.body?.trim()
          ? block.body.trim()
          : "") ||
        (videoDeliverableBlocks.length <= 1
          ? (pkg.description?.trim() ?? "")
          : "") ||
        "—"
      const metadataVideoTags =
        parsed.tags.length > 0
          ? parsed.tags
          : videoDeliverableBlocks.length <= 1
            ? (pkg.tags ?? [])
            : []
      const thumbsForMetadataCtx = thumbnailsForVideo(v)
      const selectedThumbIdForCtx = thumbnailSelectionByVideoId[v.id]
      const thumbnailForCurrentDeliverable =
        selectedThumbIdForCtx && thumbsForMetadataCtx.length
          ? (thumbsForMetadataCtx.find((t) => t.id === selectedThumbIdForCtx) ??
            null)
          : null
      const readOnlyThumbForDeliverable = !canApproveMetadata
        ? (thumbsForMetadataCtx.find((t) => t.isSelected) ?? null)
        : null
      const previewThumbForDeliverable =
        thumbnailForCurrentDeliverable ?? readOnlyThumbForDeliverable
      return {
        id: v.id,
        blockHeading: block?.heading,
        metadataVideoTitle,
        metadataVideoDescription,
        metadataVideoTags,
        previewThumbForDeliverable,
      }
    })
  }, [
    pkg,
    sortedVideoAssets,
    videoDeliverableBlocks,
    thumbnailSelectionByVideoId,
    canApproveMetadata,
  ])

  const brandVideoReviewSteps = useMemo(() => {
    const steps: Array<{
      asset: PackageAsset
      label: string
      icon: ReactNode
    }> = []
    for (const a of longAssets) {
      steps.push({
        asset: a,
        label: "Long-form (main)",
        icon: <Clapperboard className="size-5" />,
      })
    }
    shortAssets.forEach((a, i) => {
      steps.push({
        asset: a,
        label: `Short-form ${i + 1}`,
        icon: <Smartphone className="size-5" />,
      })
    })
    return steps
  }, [longAssets, shortAssets])

  useEffect(() => {
    if (!pkg) return
    const approveMeta =
      pkg.status === "MEDICAL_REVIEW" &&
      pkg.metadataTrackStatus === "PENDING" &&
      canAccess
    const approveVideo = contentBrandCanSignOffVideos(pkg, canAccess)
    if (pkg.videoTrackStatus === "REJECTED") setBrandPackageWorkTab("videos")
    else if (pkg.metadataTrackStatus === "REJECTED")
      setBrandPackageWorkTab("metadata")
    else if (approveVideo) setBrandPackageWorkTab("videos")
    else if (approveMeta) setBrandPackageWorkTab("metadata")
    else setBrandPackageWorkTab("videos")
  }, [pkg, canAccess])

  async function handleApproveMetadata() {
    if (!token || !id) return
    if (sortedVideoAssets.length === 0) {
      toast.error("No video assets on this package")
      return
    }
    const thumbnailSelections = sortedVideoAssets.map((v) => {
      const thumbnailId = thumbnailSelectionByVideoId[v.id]
      return thumbnailId ? { assetId: v.id, thumbnailId } : null
    })
    if (thumbnailSelections.some((x) => x == null)) {
      toast.error("Select one thumbnail for each video")
      return
    }
    setBusy(true)
    try {
      const res = await approvePackage(token, id, {
        comments: metaComments.trim() || "Metadata approved.",
        thumbnailSelections: thumbnailSelections as Array<{
          assetId: string
          thumbnailId: string
        }>,
      })
      setPkg(res.package)
      setMetaApproveOpen(false)
      setMetaComments("")
      toast.success(res.message ?? "Metadata approved")
      router.push("/content-brand-packages")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleApproveVideos() {
    if (!token || !id) return
    setBusy(true)
    try {
      const res = await approvePackage(token, id, {
        comments: videoComments.trim() || "Videos approved.",
      })
      setPkg(res.package)
      setVideoApproveOpen(false)
      setVideoComments("")
      toast.success(res.message ?? "Approved — sent to Content Approver")
      router.push("/content-brand-packages")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleReject() {
    if (!token || !id) return
    const itemFeedback: PackageItemFeedbackEntry[] = []
    const pushField = (
      videoAssetId: string,
      field: PackageItemFeedbackField,
      comment: string
    ) => {
      const c = comment.trim()
      if (!c) return
      itemFeedback.push({
        videoAssetId,
        field,
        hasIssue: true,
        comment: c,
      })
    }
    if (rejectMode === "metadata") {
      for (const v of sortedVideoAssets) {
        const d = rejectDraftByVideoId[v.id] ?? EMPTY_PER_VIDEO_REJECT
        pushField(v.id, "TITLE", d.title)
        pushField(v.id, "DESCRIPTION", d.description)
        pushField(v.id, "TAGS", d.tags)
        pushField(v.id, "THUMBNAIL", d.thumbnail)
      }
    }
    if (rejectMode === "video") {
      for (const v of sortedVideoAssets) {
        const d = rejectDraftByVideoId[v.id] ?? EMPTY_PER_VIDEO_REJECT
        pushField(v.id, "VIDEO", d.video)
      }
    }
    if (itemFeedback.length === 0) {
      toast.error(
        "Add at least one comment on a deliverable — rejection is per video / field."
      )
      return
    }
    setBusy(true)
    try {
      const res = await rejectPackage(token, id, {
        overallComments: "",
        itemFeedback,
      })
      setPkg(res.package)
      setRejectOpen(false)
      resetRejectDialog()
      toast.warning(res.message ?? "Package rejected")
      router.push("/content-brand-packages")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed")
    } finally {
      setBusy(false)
    }
  }

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

  const status = pkg.status as PackageStatus

  const showBrandWorkTabs =
    status === "MEDICAL_REVIEW" || status === "BRAND_REVIEW"

  const canApproveBrandVideos = contentBrandCanSignOffVideos(pkg, canAccess)

  return (
    <div className="min-h-full bg-linear-to-b from-muted/40 via-background to-background pb-12 md:pb-16">
      <div className="mx-auto max-w-5xl space-y-10 px-4 py-6 md:px-6 md:py-8">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link href="/content-brand-packages">
            <ArrowLeft className="mr-1 size-4" />
            Final packages
          </Link>
        </Button>

        <header className="flex flex-col gap-6 border-b border-border/80 pb-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-4">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Phase 6 · Final package
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn("uppercase", packageStatusBadgeClass(status))}
              >
                {PACKAGE_STATUS_LABELS[status] ?? status}
              </Badge>
              {showBrandWorkTabs ? (
                <>
                  <Badge variant="secondary" className="font-normal">
                    Video track: {TRACK_STATUS_LABELS[pkg.videoTrackStatus]}
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    Metadata track:{" "}
                    {TRACK_STATUS_LABELS[pkg.metadataTrackStatus]}
                  </Badge>
                </>
              ) : null}
              <span className="text-xs text-muted-foreground">
                Version {pkg.version} · Updated{" "}
                {formatPackageDate(pkg.updatedAt)}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
              {pkg.name ?? pkg.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>From script</span>
              {pkg.script?.title ? (
                <Link
                  href={`/content-brand-reviewer/${pkg.scriptId}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {pkg.script.title}
                </Link>
              ) : (
                <Button variant="link" className="h-auto p-0 text-sm" asChild>
                  <Link href={`/content-brand-reviewer/${pkg.scriptId}`}>
                    Open script
                    <ExternalLink className="ml-1 size-3.5" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end" />
        </header>

        <Card className="border-blue-200/60 bg-blue-50/60 shadow-none dark:border-blue-900/40 dark:bg-blue-950/25">
          <CardContent className="flex gap-4 py-5 sm:py-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-700 dark:text-blue-300">
              <Info className="size-5" />
            </div>
            <div className="min-w-0 space-y-3 text-sm">
              <p className="font-semibold text-foreground">
                How this page is organized
              </p>
              <ul className="list-none space-y-2.5 text-muted-foreground">
                <li className="flex gap-2">
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden
                  />
                  <span>
                    <span className="font-medium text-foreground">Videos</span>{" "}
                    — Step 1: Medical Affairs reviews the{" "}
                    <strong className="font-medium text-foreground">
                      video files
                    </strong>
                    . Step 2: after metadata is approved and Medical has
                    approved the video track, Content/Brand signs off on the
                    full video package (same Videos tab — Approve / Reject
                    appears then). If the video track is rejected, the Agency
                    resubmits videos only.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden
                  />
                  <span>
                    <span className="font-medium text-foreground">
                      Metadata
                    </span>{" "}
                    — In parallel with Medical video review, Content/Brand
                    reviews{" "}
                    <strong className="font-medium text-foreground">
                      titles, descriptions, tags, and thumbnails
                    </strong>{" "}
                    (one selected thumbnail per video). If that track is
                    rejected, the Agency updates only what was flagged.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                    aria-hidden
                  />
                  <span>
                    The{" "}
                    <strong className="font-medium text-foreground">
                      timer
                    </strong>{" "}
                    under the tabs shows turnaround time (TAT) for this package.
                  </span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {status === "APPROVED" && pkg.lockedAt && (
          <Card className="border-green-600/30 bg-green-50/50 shadow-none dark:border-green-700/40 dark:bg-green-950/30">
            <CardContent className="flex items-center gap-3 py-4 text-sm text-green-900 dark:text-green-100">
              <CheckCircle2 className="size-5 shrink-0" />
              <span>
                This package is <strong>approved and locked</strong> as of{" "}
                {formatPackageDate(pkg.lockedAt)}.
              </span>
            </CardContent>
          </Card>
        )}

        {!showBrandWorkTabs ? <PackageTatCard pkg={pkg} /> : null}

        {showBrandWorkTabs ? (
          <>
            <section aria-label="Revision by track" className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Work on this package
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Pick the tab that matches what reviewers asked you to change.
                  Each tab shows status, any comments, then your files or edit
                  form.
                </p>
              </div>
              <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
                <div className="border-b border-border bg-muted/20 px-1">
                  <PackageListTabNav<"videos" | "metadata">
                    tabs={[
                      {
                        key: "videos",
                        label:
                          pkg.videoTrackStatus === "REJECTED"
                            ? "Videos — needs update"
                            : canApproveBrandVideos
                              ? "Videos (your review)"
                              : "Videos",
                      },
                      {
                        key: "metadata",
                        label:
                          pkg.metadataTrackStatus === "REJECTED"
                            ? "Metadata — needs update"
                            : "Metadata",
                      },
                    ]}
                    active={brandPackageWorkTab}
                    onChange={setBrandPackageWorkTab}
                    ariaLabel="Video and metadata review"
                  />
                </div>
                <div className="space-y-6 p-4 sm:p-6">
                  <PackageTatCard pkg={pkg} />
                  {brandPackageWorkTab === "metadata" &&
                    pkg.metadataTrackStatus === "APPROVED" && (
                      <TrackStatusCallout
                        status="APPROVED"
                        title="Metadata track (Content / Brand)"
                      >
                        <p className="text-foreground">
                          Metadata is <strong>approved</strong> for this package.
                          Titles, descriptions, tags, and thumbnail choices are
                          set for this stage — the deliverable section below is
                          read-only for reference.
                        </p>
                        {status === "MEDICAL_REVIEW" ? (
                          <p className="mt-3 text-muted-foreground">
                            Medical Affairs may still be reviewing the video
                            track. Use the{" "}
                            <strong className="font-medium text-foreground">
                              Videos
                            </strong>{" "}
                            tab to preview cuts; you&apos;ll sign off on the full
                            video package when this submission reaches Brand video
                            review.
                          </p>
                        ) : null}
                        {status === "BRAND_REVIEW" ? (
                          <p className="mt-3 text-muted-foreground">
                            Use the{" "}
                            <strong className="font-medium text-foreground">
                              Videos
                            </strong>{" "}
                            tab to approve or reject the full video package when
                            you are ready.
                          </p>
                        ) : null}
                      </TrackStatusCallout>
                    )}
                  {brandPackageWorkTab === "videos" ? (
                    <>
                      {canApproveBrandVideos && (
                        <>
                          <Card className="border-primary/25 bg-primary/5 dark:bg-primary/10">
                            <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-medium text-foreground">
                                  Full video package — action needed
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  Review one video at a time (long-form, then
                                  each short), then approve to send to Content
                                  Approver or reject with feedback.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  onClick={() => setVideoApproveOpen(true)}
                                  className="gap-1.5 bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
                                >
                                  <CheckCircle className="mr-2 size-4" />
                                  Approve videos
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => openRejectDialog("video")}
                                  className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500/30 dark:text-red-500 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                                >
                                  <XCircle className="mr-2 size-4" />
                                  Reject videos
                                </Button>
                              </div>
                            </CardContent>
                          </Card>

                          {pkg.selectedThumbnail && (
                            <Card className="overflow-hidden border-0 shadow-md ring-1 ring-border/60">
                              <CardHeader className="border-b border-border bg-muted/20">
                                <CardTitle className="text-base">
                                  Selected thumbnail (locked)
                                </CardTitle>
                                <CardDescription>
                                  Chosen at metadata approval —{" "}
                                  {pkg.selectedThumbnail.fileName}
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="p-4 sm:p-6">
                                <div className="mx-auto max-w-xl overflow-hidden rounded-xl border border-border bg-muted/20">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={pkg.selectedThumbnail.fileUrl}
                                    alt=""
                                    className="aspect-video w-full object-cover"
                                  />
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </>
                      )}

                      {status === "MEDICAL_REVIEW" &&
                        !canApproveBrandVideos && (
                          <Card className="border-muted/60 bg-muted/15 shadow-none">
                            <CardContent className="flex gap-3 py-4">
                              <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                              <div className="text-sm">
                                <p className="font-medium text-foreground">
                                  Medical Affairs is reviewing the video track
                                </p>
                                <p className="mt-1 text-muted-foreground">
                                  Preview each cut below for context. When the
                                  package reaches Brand video review,
                                  you&apos;ll approve or reject the full video
                                  package here.
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        )}

                      <section className="space-y-4">
                        <h2 className="text-base font-semibold tracking-wide text-muted-foreground uppercase">
                          {canApproveBrandVideos
                            ? "Videos to review"
                            : "Video cuts (preview)"}
                        </h2>

                        {brandVideoReviewSteps.length > 0 ? (
                          <div className="space-y-10">
                            {brandVideoReviewSteps.map((s) => (
                              <PackageInlineVideoCard
                                key={s.asset.id}
                                asset={s.asset}
                                label={s.label}
                                icon={s.icon}
                                videoOnly
                              />
                            ))}
                          </div>
                        ) : (
                          <Card>
                            <CardContent className="py-10 text-center text-sm text-muted-foreground">
                              No video assets on this package.
                            </CardContent>
                          </Card>
                        )}
                        {brandVideoReviewSteps.length > 0 ? (
                          <p className="text-center text-xs text-muted-foreground sm:text-left">
                            {canApproveBrandVideos
                              ? "Review each cut above before approving the full package."
                              : "Preview only — Medical Affairs owns the video track until Brand video review."}
                          </p>
                        ) : null}
                      </section>
                    </>
                  ) : (
                    <>
                      {canApproveMetadata && (
                        <Card className="border-primary/25 bg-primary/5 dark:bg-primary/10">
                          <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-medium text-foreground">
                                Metadata review — action needed
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Review each deliverable below, then choose one
                                thumbnail per video for publication. Approve
                                sends your choice to the API; Medical may still
                                be reviewing videos in parallel.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                onClick={() => setMetaApproveOpen(true)}
                                className="gap-1.5 bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
                              >
                                <CheckCircle className="mr-2 size-4" />
                                Approve metadata
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => openRejectDialog("metadata")}
                                className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500/30 dark:text-red-500 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                              >
                                <XCircle className="mr-2 size-4" />
                                Reject metadata
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      <div className="space-y-6">
                        <div className="rounded-lg border border-border/80 bg-muted/15 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                          {canApproveMetadata ? (
                            <>
                              Each card is one deliverable. Title, description,
                              and tags come from the Agency. After reviewing all
                              cards, pick one thumbnail per video for publication
                              (see{" "}
                              <code className="rounded bg-muted px-1 text-xs">
                                thumbnailId
                              </code>{" "}
                              in the approve API).
                            </>
                          ) : (
                            <>
                              Read-only reference — one card per deliverable.
                              Thumbnails show the option selected for publication
                              where the API marks{" "}
                              <code className="rounded bg-muted px-1 text-xs">
                                isSelected
                              </code>
                              .
                            </>
                          )}
                        </div>

                        {metadataRows.length === 0 ? (
                          <Card className="border-dashed border-border bg-muted/10">
                            <CardContent className="py-10 text-center text-sm text-muted-foreground">
                              No deliverable metadata to show.
                            </CardContent>
                          </Card>
                        ) : (
                          metadataRows.map((row) => {
                            const deliverableLabel =
                              videoRejectLabelById.get(row.id) ??
                              row.blockHeading ??
                              "Deliverable"
                            return (
                              <Card
                                key={row.id}
                                className="overflow-hidden border-0 shadow-md ring-1 ring-border/60"
                              >
                                <CardHeader className="border-b border-border bg-muted/20">
                                  <div className="flex flex-wrap items-start gap-3">
                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                      <FileText className="size-5" />
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <CardTitle className="text-lg">
                                        {deliverableLabel}
                                      </CardTitle>
                                      {row.blockHeading &&
                                      row.blockHeading !== deliverableLabel ? (
                                        <CardDescription>
                                          {row.blockHeading}
                                        </CardDescription>
                                      ) : null}
                                    </div>
                                  </div>
                                </CardHeader>
                                <CardContent className="space-y-6 p-5 sm:p-6">
                                  <section className="space-y-3">
                                    <div className="flex items-center gap-2">
                                      <FileText className="size-4 text-muted-foreground" />
                                      <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                        Video title
                                      </Label>
                                    </div>
                                    <p className="text-xl leading-snug font-semibold text-foreground sm:text-2xl">
                                      {row.metadataVideoTitle}
                                    </p>
                                  </section>

                                  <section className="space-y-3 border-t border-border pt-6">
                                    <div className="flex items-center gap-2">
                                      <FileText className="size-4 text-muted-foreground" />
                                      <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                        Description
                                      </Label>
                                    </div>
                                    <div className="max-h-[min(70vh,28rem)] overflow-y-auto rounded-xl border border-border bg-muted/15 p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground sm:p-5 sm:text-base">
                                      {row.metadataVideoDescription}
                                    </div>
                                  </section>

                                  <section className="space-y-3 border-t border-border pt-6">
                                    <div className="flex items-center gap-2">
                                      <Hash className="size-4 text-muted-foreground" />
                                      <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                        Tags
                                      </Label>
                                    </div>
                                    {row.metadataVideoTags.length ? (
                                      <div className="flex flex-wrap gap-2">
                                        {row.metadataVideoTags.map((t) => (
                                          <Badge
                                            key={`${row.id}-tag-${t}`}
                                            variant="secondary"
                                            className="px-3 py-1.5 text-sm font-normal"
                                          >
                                            {t}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">
                                        {videoDeliverableBlocks.length > 1
                                          ? "No tags listed for this deliverable."
                                          : "No tags on this package."}
                                      </p>
                                    )}
                                  </section>

                                  {row.previewThumbForDeliverable ? (
                                    <section className="space-y-3 border-t border-border pt-6">
                                      <div className="flex items-center gap-2">
                                        <ImageIcon className="size-4 text-muted-foreground" />
                                        <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                          Selected thumbnail for this cut
                                        </Label>
                                      </div>
                                      <p className="text-sm text-muted-foreground">
                                        {canApproveMetadata
                                          ? "Preview of your current choice for this video."
                                          : "Thumbnail marked for publication for this deliverable (read-only)."}
                                      </p>
                                      <div className="mx-auto max-w-md overflow-hidden rounded-xl border border-border bg-muted/20">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={
                                            row.previewThumbForDeliverable
                                              .fileUrl
                                          }
                                          alt=""
                                          className="aspect-video w-full object-cover"
                                        />
                                      </div>
                                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                                        {
                                          row.previewThumbForDeliverable
                                            .fileName
                                        }
                                      </p>
                                    </section>
                                  ) : null}
                                </CardContent>
                              </Card>
                            )
                          })
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          </>
        ) : null}

        {!showBrandWorkTabs &&
          !canApproveMetadata &&
          !canApproveBrandVideos && (
            <Card className="border-dashed border-border bg-muted/10">
              <CardContent className="flex gap-3 py-6">
                <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No Content/Brand action is required for this package in its
                  current state. Return to the queue or use the reference IDs
                  below if you need support context.
                </p>
              </CardContent>
            </Card>
          )}

        {/* <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Hash className="size-5 text-muted-foreground" />
              Reference · IDs &amp; submission
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Use these when talking to Practo support or your internal team.
              They do not change when you resubmit tracks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Package ID
                </dt>
                <dd className="mt-1 font-mono text-sm break-all">{pkg.id}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Script ID
                </dt>
                <dd className="mt-1 font-mono text-sm break-all">
                  <Link
                    href={`/content-brand-reviewer/${pkg.scriptId}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {pkg.scriptId}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <Calendar className="size-3.5" />
                  Created
                </dt>
                <dd className="mt-1 text-sm">
                  {formatPackageDate(pkg.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <Calendar className="size-3.5" />
                  Last updated
                </dt>
                <dd className="mt-1 text-sm">
                  {formatPackageDate(pkg.updatedAt)}
                </dd>
              </div>
              {pkg.uploadedBy ? (
                <div className="sm:col-span-2">
                  <dt className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <User className="size-3.5" />
                    Submitted by
                  </dt>
                  <dd className="mt-1 text-sm">
                    {pkg.uploadedBy.firstName} {pkg.uploadedBy.lastName}
                    {pkg.uploadedBy.role ? ` · ${pkg.uploadedBy.role}` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card> */}
      </div>

      <Dialog open={metaApproveOpen} onOpenChange={setMetaApproveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve metadata</DialogTitle>
            <DialogDescription>
              Confirms title, description, tags, and your thumbnail selection.
              Medical Affairs may still be reviewing the video track in
              parallel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="meta-c">Comments</Label>
            <Textarea
              id="meta-c"
              value={metaComments}
              onChange={(e) => setMetaComments(e.target.value)}
              placeholder="Brand sign-off notes…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetaApproveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApproveMetadata} disabled={busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Submit approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={videoApproveOpen} onOpenChange={setVideoApproveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve full video package</DialogTitle>
            <DialogDescription>
              Sends the package to Content Approver for final sign-off.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="vid-c">Comments</Label>
            <Textarea
              id="vid-c"
              value={videoComments}
              onChange={(e) => setVideoComments(e.target.value)}
              placeholder="Video / brand alignment notes…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setVideoApproveOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleApproveVideos} disabled={busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Submit approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectOpen}
        onOpenChange={(o) => {
          setRejectOpen(o)
          if (!o) resetRejectDialog()
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="space-y-1 border-b border-border px-6 py-4">
            <DialogTitle>Reject package</DialogTitle>
            <DialogDescription>
              {rejectMode === "metadata"
                ? "Add feedback per video — comments apply only to that video."
                : rejectMode === "video"
                  ? "Add video feedback per deliverable (long-form and each short are separate)."
                  : "Add feedback below."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {(rejectMode === "metadata" || rejectMode === "video") &&
            sortedVideoAssets.length > 0 ? (
              <>
                {sortedVideoAssets.length > 1 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div
                      className="flex flex-wrap gap-2"
                      role="tablist"
                      aria-label="Deliverable for rejection feedback"
                    >
                      {sortedVideoAssets.map((v, i) => {
                        const tabLabel =
                          videoRejectLabelById.get(v.id) ?? "Video"
                        return (
                          <button
                            key={v.id}
                            type="button"
                            role="tab"
                            aria-selected={i === rejectDeliverableTabIndex}
                            className={cn(
                              "max-w-[min(100%,16rem)] truncate rounded-full px-3 py-1.5 text-left text-xs font-medium transition-colors",
                              i === rejectDeliverableTabIndex
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                            )}
                            title={tabLabel}
                            onClick={() => setRejectDeliverableTabIndex(i)}
                          >
                            {tabLabel}
                          </button>
                        )
                      })}
                    </div>
                    <Badge variant="outline" className="shrink-0 tabular-nums">
                      {rejectDeliverableTabIndex + 1} of{" "}
                      {sortedVideoAssets.length}
                    </Badge>
                  </div>
                ) : null}

                {(() => {
                  const safeIdx = Math.min(
                    rejectDeliverableTabIndex,
                    sortedVideoAssets.length - 1
                  )
                  const v = sortedVideoAssets[safeIdx]!
                  const label = videoRejectLabelById.get(v.id) ?? "Video"
                  const d = rejectDraftByVideoId[v.id] ?? EMPTY_PER_VIDEO_REJECT

                  if (rejectMode === "metadata") {
                    return (
                      <Card key={v.id} className="border-border/80 shadow-none">
                        <CardHeader className="space-y-0 pt-2 pb-2 sm:pt-4">
                          <CardTitle className="text-base">{label}</CardTitle>
                          <CardDescription className="text-xs">
                            Metadata feedback for this cut only (title,
                            description, tags, thumbnails). Switch cuts with the
                            pills above when there is more than one deliverable.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 pb-4">
                          <div className="space-y-2">
                            <Label htmlFor={`rej-title-${v.id}`}>
                              Title (optional)
                            </Label>
                            <Textarea
                              id={`rej-title-${v.id}`}
                              value={d.title}
                              onChange={(e) =>
                                patchRejectDraft(v.id, {
                                  title: e.target.value,
                                })
                              }
                              rows={2}
                              placeholder={`Issues with title for ${label}…`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`rej-desc-${v.id}`}>
                              Description (optional)
                            </Label>
                            <Textarea
                              id={`rej-desc-${v.id}`}
                              value={d.description}
                              onChange={(e) =>
                                patchRejectDraft(v.id, {
                                  description: e.target.value,
                                })
                              }
                              rows={2}
                              placeholder={`Issues with description for ${label}…`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`rej-tags-${v.id}`}>
                              Tags (optional)
                            </Label>
                            <Textarea
                              id={`rej-tags-${v.id}`}
                              value={d.tags}
                              onChange={(e) =>
                                patchRejectDraft(v.id, {
                                  tags: e.target.value,
                                })
                              }
                              rows={2}
                              placeholder={`Issues with tags for ${label}…`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`rej-thumb-${v.id}`}>
                              Thumbnails (optional)
                            </Label>
                            <Textarea
                              id={`rej-thumb-${v.id}`}
                              value={d.thumbnail}
                              onChange={(e) =>
                                patchRejectDraft(v.id, {
                                  thumbnail: e.target.value,
                                })
                              }
                              rows={2}
                              placeholder={`Issues with thumbnail options for ${label}…`}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    )
                  }

                  return (
                    <Card key={v.id} className="border-border/80 shadow-none">
                      <CardHeader className="space-y-0 pt-2 pb-2 sm:pt-4">
                        <CardTitle className="text-base">{label}</CardTitle>
                        <CardDescription className="text-xs">
                          Video file / encoding / brand quality — this
                          deliverable only. Switch cuts with the pills above
                          when there is more than one deliverable.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <div className="space-y-2">
                          <Label htmlFor={`rej-vid-${v.id}`}>
                            Video feedback (required)
                          </Label>
                          <Textarea
                            id={`rej-vid-${v.id}`}
                            value={d.video}
                            onChange={(e) =>
                              patchRejectDraft(v.id, {
                                video: e.target.value,
                              })
                            }
                            rows={3}
                            placeholder={`What must change for ${label}?`}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )
                })()}
              </>
            ) : null}
            {sortedVideoAssets.length === 0 &&
            (rejectMode === "metadata" || rejectMode === "video") ? (
              <p className="text-sm text-muted-foreground">
                No video deliverables on this package.
              </p>
            ) : null}
          </div>
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={busy}
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Reject package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
