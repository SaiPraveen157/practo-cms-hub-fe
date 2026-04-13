"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
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
  getPackageVideoComments,
  rejectPackageVideo,
} from "@/lib/packages-api"
import {
  deliverableLabelsByVideoId,
  getCurrentVideoAsset,
  packageVideosSorted,
  videoAssetToPackageAsset,
} from "@/lib/package-video-helpers"
import type {
  FinalPackage,
  PackageItemFeedbackEntry,
  PackageVideo,
} from "@/types/package"
import type { UserRole } from "@/types/auth"
import { PackageInlineVideoCard } from "@/components/packages/package-inline-video-card"
import {
  TRACK_STATUS_LABELS,
  VIDEO_STATUS_LABELS,
  formatPackageDate,
  videoStatusBadgeClass,
} from "@/lib/package-ui"
import { PackageVideoTatInline } from "@/components/packages/package-video-tat-inline"
import { PackageFeedbackAndRevisionsPanel } from "@/components/packages/package-detail-subtabs"
import { PackageListTabNav } from "@/components/packages/package-list-tab-nav"
import {
  ArrowLeft,
  CheckCircle,
  Clapperboard,
  Clock,
  Loader2,
  Smartphone,
  XCircle,
} from "lucide-react"
import {
  VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION,
  videoThreadBlocksApprove,
} from "@/lib/video-comment"
import { usePackageVideoThreadBlockMap } from "@/hooks/use-package-video-thread-block-map"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export default function MedicalPackageDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params.id as string
  const focusVideoId = (searchParams.get("video") ?? "").trim()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const role = user?.role as UserRole | undefined
  const isMedical = role === "MEDICAL_AFFAIRS"
  const isSuper = role === "SUPER_ADMIN"
  const canAccess = isMedical || isSuper

  const [pkg, setPkg] = useState<FinalPackage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [activeVideo, setActiveVideo] = useState<PackageVideo | null>(null)
  const [approveComments, setApproveComments] = useState("")
  const [rejectVideoTab, setRejectVideoTab] = useState<string>("")
  const [rejectCommentsByVideoId, setRejectCommentsByVideoId] = useState<
    Record<string, string>
  >({})
  const [busy, setBusy] = useState(false)

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

  /** Refresh package without full-page loading (e.g. after approve/reject one deliverable). */
  const refreshPackage = useCallback(async () => {
    if (!token || !id) return
    try {
      const res = await getPackage(token, id)
      setPkg(res.package)
    } catch {
      /* keep existing pkg */
    }
  }, [token, id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!pkg) return
    const vids = pkg.videos ?? []
    const pick =
      (focusVideoId && vids.find((v) => v.id === focusVideoId)) ||
      vids[0] ||
      null
    setActiveVideo(pick)
    if (pick) setRejectVideoTab(pick.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: avoid resetting dialog selection on in-place merges
  }, [pkg?.id, focusVideoId])

  const sortedVideos = useMemo(
    () => (pkg ? packageVideosSorted(pkg) : []),
    [pkg]
  )

  const packageVideosForThreadGate = useMemo(
    () =>
      sortedVideos.filter(
        (v) =>
          v.status === "MEDICAL_REVIEW" &&
          v.videoTrackStatus === "PENDING" &&
          canAccess
      ),
    [sortedVideos, canAccess]
  )

  const { threadBlockByVideoId, recheckThreadBlocks } =
    usePackageVideoThreadBlockMap(token, packageVideosForThreadGate)

  const approveThreadBlocked = activeVideo
    ? Boolean(threadBlockByVideoId[activeVideo.id])
    : false

  const deliverableLabels = useMemo(
    () => deliverableLabelsByVideoId(sortedVideos),
    [sortedVideos]
  )

  useEffect(() => {
    if (!focusVideoId || loading) return
    const t = window.setTimeout(() => {
      document
        .getElementById(`video-${focusVideoId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 100)
    return () => window.clearTimeout(t)
  }, [focusVideoId, loading])

  async function handleApprove() {
    if (!token || !activeVideo) return
    const list = await getPackageVideoComments(token, activeVideo.id)
    if (videoThreadBlocksApprove(list, activeVideo.currentVersion)) {
      toast.error("Cannot approve yet", {
        description: VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION,
      })
      return
    }
    setBusy(true)
    try {
      const res = await approvePackageVideo(token, activeVideo.id, {
        comments: approveComments.trim() || "Video track approved.",
      })
      setApproveOpen(false)
      setApproveComments("")
      toast.success(res.message ?? "Approved")
      await refreshPackage()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleReject() {
    if (!token || !activeVideo) return
    const comment = (rejectCommentsByVideoId[activeVideo.id] ?? "").trim()
    if (!comment) {
      toast.error("Add feedback for the selected deliverable.")
      return
    }
    const asset = getCurrentVideoAsset(activeVideo)
    if (!asset?.id) {
      toast.error("Missing video asset.")
      return
    }
    const itemFeedback: PackageItemFeedbackEntry[] = [
      {
        videoAssetId: asset.id,
        field: "VIDEO",
        hasIssue: true,
        comment,
      },
    ]
    setBusy(true)
    try {
      const res = await rejectPackageVideo(token, activeVideo.id, {
        overallComments: "",
        itemFeedback,
      })
      setRejectOpen(false)
      setRejectVideoTab("")
      toast.warning(res.message ?? "Video track rejected")
      await refreshPackage()
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
          <Link href="/medical-affairs-scripts">Back</Link>
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
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
          <Link href="/medical-affairs-packages">Back</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-full flex-1 bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <Button variant="ghost" size="sm" className="mb-8 -ml-2" asChild>
          <Link href="/medical-affairs-packages">
            <ArrowLeft className="mr-2 size-4" />
            Medical queue
          </Link>
        </Button>

        <header className="mb-10 space-y-4 border-b border-border pb-8">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Phase 6 · Medical (video track)
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
                {pkg.uploadedBy && (
                  <>
                    {" · "}
                    {pkg.uploadedBy.firstName} {pkg.uploadedBy.lastName}
                  </>
                )}
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
          <p className="max-w-2xl text-sm text-muted-foreground">
            This page shows only the <strong>video file</strong> for each
            deliverable. Title, description, tags, and thumbnails are{" "}
            <strong>not</strong> shown here — Content/Brand reviews metadata in
            their own workflow. Feedback on the video uses{" "}
            <strong>timestamp comments</strong> on the player only (no separate
            generic comment stream).
          </p>
        </header>

        <div className="space-y-10">
          <section className="space-y-8">
            {sortedVideos.map((video) => {
              const asset = getCurrentVideoAsset(video)
              if (!asset) return null
              const pa = videoAssetToPackageAsset(asset)
              const label = deliverableLabels.get(video.id) ?? "Deliverable"
              const icon =
                video.type === "LONG_FORM" ? (
                  <Clapperboard className="size-5" />
                ) : (
                  <Smartphone className="size-5" />
                )
              const canReview =
                video.status === "MEDICAL_REVIEW" &&
                video.videoTrackStatus === "PENDING" &&
                canAccess

              return (
                <Card
                  key={video.id}
                  id={`video-${video.id}`}
                  className="scroll-mt-24 overflow-hidden border-border shadow-sm"
                >
                  <CardHeader className="space-y-4 border-b border-border bg-muted/15 py-5 sm:py-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle className="text-base font-semibold">
                          {label}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Video file only — medical review of the uploaded file.
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <Badge
                          variant="outline"
                          className={cn(
                            "uppercase",
                            videoStatusBadgeClass(video.status)
                          )}
                        >
                          {VIDEO_STATUS_LABELS[video.status]}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="text-xs font-normal"
                        >
                          Video track:{" "}
                          {TRACK_STATUS_LABELS[video.videoTrackStatus]}
                        </Badge>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          v{video.currentVersion}
                        </span>
                      </div>
                    </div>
                    <PackageVideoTatInline
                      video={video}
                      className="border-t border-border/60 pt-4"
                    />
                  </CardHeader>
                  <CardContent className="space-y-6 px-4 py-6 sm:px-6">
                    <div>
                      <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        Video file
                      </p>
                      <PackageInlineVideoCard
                        asset={pa}
                        label={label}
                        icon={icon}
                        videoOnly
                        packageVideo={video}
                        onPackageVideoCommentsUpdated={recheckThreadBlocks}
                      />
                    </div>

                    {canReview ? (
                      <div className="flex flex-col gap-4 rounded-lg border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between dark:bg-primary/10">
                        <div className="min-w-0 space-y-2">
                          <p className="text-sm text-foreground">
                            <span className="font-medium">Action required</span>
                            <span className="text-muted-foreground">
                              {" "}
                              — approve or reject this video file (not metadata)
                            </span>
                          </p>
                          {threadBlockByVideoId[video.id] ? (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                              {VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2 sm:shrink-0">
                          <Button
                            size="sm"
                            disabled={Boolean(threadBlockByVideoId[video.id])}
                            onClick={() => {
                              setActiveVideo(video)
                              setApproveOpen(true)
                            }}
                            className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
                          >
                            <CheckCircle className="mr-2 size-4" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setActiveVideo(video)
                              setRejectVideoTab(video.id)
                              setRejectOpen(true)
                            }}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <XCircle className="mr-2 size-4" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    ) : (
                      video.status === "MEDICAL_REVIEW" &&
                      (video.videoTrackStatus === "APPROVED" ? (
                        <p className="border-success flex items-center rounded-lg border border-green-600 bg-green-950/20 px-4 py-3 text-sm text-green-400">
                          <CheckCircle className="mr-2 size-4" />
                          Video track approved for this version.
                        </p>
                      ) : (
                        <p className="rounded-lg border border-dashed border-border bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
                          <Clock className="mr-2 size-4" />
                          No video track action for you on this deliverable
                          right now.
                        </p>
                      ))
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </section>

          {/* <div className="space-y-3">
            <h2 className="text-base font-semibold tracking-tight">
              Video-track feedback &amp; revisions
            </h2>
            <p className="text-sm text-muted-foreground">
              Only rejections that concern the <strong>video file</strong> are
              listed here.
            </p>
            <PackageFeedbackAndRevisionsPanel
              pkg={pkg}
              trackFilter="VIDEO_TRACK"
            />
          </div> */}
        </div>
      </div>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve video track</DialogTitle>
            <DialogDescription>
              Medical sign-off for this deliverable only. Other videos in the
              package are unaffected.
            </DialogDescription>
          </DialogHeader>
          {approveThreadBlocked ? (
            <p className="text-sm text-muted-foreground">
              {VIDEO_THREAD_APPROVE_BLOCKED_DESCRIPTION}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="ap">Comments(optional)</Label>
            <Textarea
              id="ap"
              value={approveComments}
              onChange={(e) => setApproveComments(e.target.value)}
              placeholder="Medical sign-off notes…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={busy || approveThreadBlocked}
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reject video track</DialogTitle>
            <DialogDescription>
              Each deliverable has its own independent flow. Choose a
              deliverable below and add feedback for the submitted video file.
            </DialogDescription>
          </DialogHeader>

          {sortedVideos.length > 0 && (
            <div className="space-y-4">
              <PackageListTabNav<string>
                tabs={sortedVideos.map((v) => ({
                  key: v.id,
                  label: deliverableLabels.get(v.id) ?? "Deliverable",
                }))}
                active={
                  rejectVideoTab || activeVideo?.id || sortedVideos[0]!.id
                }
                onChange={(k) => {
                  setRejectVideoTab(k)
                  const chosen = sortedVideos.find((v) => v.id === k) ?? null
                  setActiveVideo(chosen)
                }}
                ariaLabel="Reject deliverable tabs"
              />

              <div className="space-y-2">
                <Label htmlFor="rj">Feedback(required)</Label>
                <Textarea
                  id="rj"
                  value={
                    rejectCommentsByVideoId[
                      rejectVideoTab || activeVideo?.id || ""
                    ] ?? ""
                  }
                  onChange={(e) => {
                    const vid = rejectVideoTab || activeVideo?.id
                    if (!vid) return
                    const val = e.target.value
                    setRejectCommentsByVideoId((prev) => ({
                      ...prev,
                      [vid]: val,
                    }))
                  }}
                  rows={4}
                  placeholder="What should Agency change in the video file?"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={busy}
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
