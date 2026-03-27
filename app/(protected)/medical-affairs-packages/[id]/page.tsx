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
import {
  approvePackage,
  getPackage,
  rejectPackage,
} from "@/lib/packages-api"
import type {
  FinalPackage,
  PackageAsset,
  PackageItemFeedbackEntry,
  PackageStatus,
} from "@/types/package"
import type { UserRole } from "@/types/auth"
import VideoPlayerTimeline from "@/components/VideoPlayerTimeline"
import {
  PACKAGE_STATUS_LABELS,
  TRACK_STATUS_LABELS,
  assetsOfType,
  formatPackageDate,
  formatPackageFileSize,
  packageStatusBadgeClass,
} from "@/lib/package-ui"
import { PackageTatCard } from "@/components/packages/package-tat-card"
import { PackageDetailSubTabs } from "@/components/packages/package-detail-subtabs"
import {
  ArrowLeft,
  CheckCircle,
  Clapperboard,
  ExternalLink,
  Info,
  Loader2,
  Smartphone,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

function PackageVideoPlayerCard({
  asset,
  label,
  icon,
}: {
  asset: PackageAsset
  label: string
  icon: ReactNode
}) {
  const [videoError, setVideoError] = useState(false)
  const size = formatPackageFileSize(asset.fileSize ?? undefined)

  return (
    <Card className="overflow-hidden border-0 shadow-md ring-1 ring-border/70">
      <CardHeader className="border-b border-border bg-muted/30 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {icon}
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-base leading-snug">{label}</CardTitle>
              <CardDescription className="break-all font-mono text-xs">
                {asset.fileName}
                {size ? ` · ${size}` : ""}
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0 uppercase">
            {asset.type.replace("_", " ")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6">
        {asset.fileUrl && !videoError ? (
          <div className="overflow-hidden rounded-xl border border-border bg-black shadow-inner">
            <VideoPlayerTimeline
              src={asset.fileUrl}
              mediaKey={asset.id}
              showCommentsUi={false}
              videoClassName="max-h-[min(72vh,32rem)] w-full object-contain"
              onVideoError={() => setVideoError(true)}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {videoError
                ? "Inline preview failed (often a network or CORS issue)."
                : "No video URL on this asset."}
            </p>
            {asset.fileUrl ? (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={asset.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 size-4" />
                  Open video in new tab
                </a>
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function MedicalPackageDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
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
  const [approveComments, setApproveComments] = useState("")
  const [rejectLong, setRejectLong] = useState("")
  const [rejectShort, setRejectShort] = useState("")
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

  useEffect(() => {
    load()
  }, [load])

  const canReviewVideo =
    pkg?.status === "MEDICAL_REVIEW" &&
    pkg.videoTrackStatus === "PENDING" &&
    canAccess

  const longAssets = useMemo(
    () => assetsOfType(pkg ?? ({} as FinalPackage), "LONG_FORM"),
    [pkg]
  )
  const shortAssets = useMemo(() => {
    const list = assetsOfType(pkg ?? ({} as FinalPackage), "SHORT_FORM")
    return [...list].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    )
  }, [pkg])

  async function handleApprove() {
    if (!token || !id) return
    setBusy(true)
    try {
      const res = await approvePackage(token, id, {
        comments: approveComments.trim() || "Video track approved.",
      })
      setPkg(res.package)
      setApproveOpen(false)
      setApproveComments("")
      toast.success(res.message ?? "Approved")
      router.push("/medical-affairs-packages")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleReject() {
    if (!token || !id) return
    const itemFeedback: PackageItemFeedbackEntry[] = []
    const lc = rejectLong.trim()
    const sc = rejectShort.trim()
    for (const v of longAssets) {
      if (lc) {
        itemFeedback.push({
          videoAssetId: v.id,
          field: "VIDEO",
          hasIssue: true,
          comment: lc,
        })
      }
    }
    for (const v of shortAssets) {
      if (sc) {
        itemFeedback.push({
          videoAssetId: v.id,
          field: "VIDEO",
          hasIssue: true,
          comment: sc,
        })
      }
    }
    if (itemFeedback.length === 0) {
      toast.error(
        "Add feedback for at least one video (long and/or short sections)."
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
      setRejectLong("")
      setRejectShort("")
      toast.warning(res.message ?? "Package rejected — Agency will resubmit.")
      router.push("/medical-affairs-packages")
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

  const status = pkg.status as PackageStatus

  return (
    <div className="min-h-full flex-1 bg-linear-to-b from-muted/40 to-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <Button variant="ghost" size="sm" className="-ml-2 mb-6" asChild>
          <Link href="/medical-affairs-packages">
            <ArrowLeft className="mr-1 size-4" />
            Medical queue
          </Link>
        </Button>

        <header className="mb-8 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("uppercase", packageStatusBadgeClass(status))}
            >
              {PACKAGE_STATUS_LABELS[status]}
            </Badge>
            <Badge variant="secondary" className="font-normal">
              Video track: {TRACK_STATUS_LABELS[pkg.videoTrackStatus]}
            </Badge>
            <Badge variant="outline" className="font-normal">
              Metadata track: {TRACK_STATUS_LABELS[pkg.metadataTrackStatus]}
            </Badge>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {pkg.name ?? pkg.title}
            </h1>
            <p className="mt-2 text-xs text-muted-foreground">
              Review videos only. Metadata is reviewed by Brand in parallel.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Script:{" "}
              <span className="font-medium text-foreground">
                {pkg.script?.title ?? "—"}
              </span>
              {" · "}
              Package v{pkg.version}
              {pkg.uploadedBy && (
                <>
                  {" · "}
                  Uploaded by {pkg.uploadedBy.firstName}{" "}
                  {pkg.uploadedBy.lastName}
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Updated {formatPackageDate(pkg.updatedAt)}
              {pkg.assignedAt
                ? ` · Assigned ${formatPackageDate(pkg.assignedAt)}`
                : ""}
            </p>
          </div>
        </header>

        <PackageDetailSubTabs
          key={pkg.id}
          pkg={pkg}
          token={token}
          packageId={id}
        >
          <PackageTatCard pkg={pkg} />

          {!canReviewVideo && status === "MEDICAL_REVIEW" && (
            <Card className="border-dashed border-border bg-card/80">
              <CardContent className="flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {pkg.videoTrackStatus === "APPROVED"
                    ? "You have already approved the video track for this version. Brand may still be reviewing metadata, or the package is waiting for the next stage."
                    : "No video review action is required from you for this package right now."}
                </p>
              </CardContent>
            </Card>
          )}

          {canReviewVideo && (
            <Card className="border-primary/30 bg-primary/5 dark:bg-primary/10">
              <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-foreground">
                    Your review is needed
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Watch the videos below, then approve the video track or reject
                    with feedback for the Agency.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setApproveOpen(true)} className="gap-1.5 bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700">
                    <CheckCircle className="mr-2 size-4" />
                    Approve videos
                  </Button>
                  <Button variant="outline" onClick={() => setRejectOpen(true)} className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500/30 dark:text-red-500 dark:hover:bg-red-950/50 dark:hover:text-red-400">
                    <XCircle className="mr-2 size-4" />
                    Reject package
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Video track (your review scope)
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                All videos as part of this package are reviewed here. 
              </p>
            </div>
            <div className="space-y-6">
              {longAssets.map((a) => (
                <PackageVideoPlayerCard
                  key={a.id}
                  asset={a}
                  label="Long-form (main)"
                  icon={<Clapperboard className="size-5" />}
                />
              ))}
              {shortAssets.map((a, i) => (
                <PackageVideoPlayerCard
                  key={a.id}
                  asset={a}
                  label={`Short-form ${i + 1}`}
                  icon={<Smartphone className="size-5" />}
                />
              ))}
              {longAssets.length === 0 && shortAssets.length === 0 && (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No video assets on this package yet.
                  </CardContent>
                </Card>
              )}
            </div>
          </section>

          <Card className="border-dashed border-border bg-muted/20">
            <CardContent className="flex gap-3 py-4 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <p>
                <span className="font-medium text-foreground">
                  Metadata track (not shown here)
                </span>
                : Full description, tags, and thumbnail options are reviewed by
                Content/Brand alongside this package. Use the Feedback &
                revisions tab if you need prior rejection notes that mention
                non-video assets.
              </p>
            </CardContent>
          </Card>
        </PackageDetailSubTabs>
      </div>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve video track</DialogTitle>
            <DialogDescription>
              Confirms medical sign-off on the video track (long + short videos
              only). Content/Brand may still be reviewing metadata and thumbnails
              in parallel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ap">Comments</Label>
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
            <Button onClick={handleApprove} disabled={busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reject package</DialogTitle>
            <DialogDescription>
              Sends the package back to Agency. Add video feedback below (at
              least one field required).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Long form feedback (optional)</Label>
              <Textarea
                value={rejectLong}
                onChange={(e) => setRejectLong(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Short form feedback (optional)</Label>
              <Textarea
                value={rejectShort}
                onChange={(e) => setRejectShort(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
