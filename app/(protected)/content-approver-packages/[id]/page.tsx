"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
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
import {
  filterVideoDeliverableDescriptionBlocks,
  parsePerVideoPackageDescriptionBlocks,
} from "@/lib/package-composed-description"
import {
  PACKAGE_STATUS_LABELS,
  TRACK_STATUS_LABELS,
  assetsOfType,
  formatPackageDate,
  formatPackageFileSize,
  packageStatusBadgeClass,
  thumbnailsForVideo,
} from "@/lib/package-ui"
import { PackageTatCard } from "@/components/packages/package-tat-card"
import { PackageInlineVideoCard } from "@/components/packages/package-inline-video-card"
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clapperboard,
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

export default function ContentApproverPackageDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const role = user?.role as UserRole | undefined
  const isApprover = role === "CONTENT_APPROVER"
  const isSuper = role === "SUPER_ADMIN"
  const canAccess = isApprover || isSuper

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

  const longAssets = useMemo(
    () => assetsOfType(pkg ?? ({} as FinalPackage), "LONG_FORM"),
    [pkg]
  )
  const shortAssets = useMemo(() => {
    const list = assetsOfType(pkg ?? ({} as FinalPackage), "SHORT_FORM")
    return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }, [pkg])
  const rawDescriptionBlocks = useMemo(
    () => parsePerVideoPackageDescriptionBlocks(pkg?.description ?? ""),
    [pkg?.description]
  )
  const videoDeliverableBlocks = useMemo(
    () => filterVideoDeliverableDescriptionBlocks(rawDescriptionBlocks),
    [rawDescriptionBlocks]
  )

  const videoReviewSteps = useMemo(() => {
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

  const flatThumbnailAssets = useMemo(() => {
    const list = assetsOfType(pkg ?? ({} as FinalPackage), "THUMBNAIL")
    return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }, [pkg])

  const hasNestedThumbnailsOnVideos = useMemo(
    () =>
      videoReviewSteps.some((s) => thumbnailsForVideo(s.asset).length > 0),
    [videoReviewSteps]
  )

  const canFinalApprove = pkg?.status === "APPROVER_REVIEW" && canAccess

  async function handleApprove() {
    if (!token || !id) return
    setBusy(true)
    try {
      const res = await approvePackage(token, id, {
        comments: approveComments.trim() || "Final approval.",
      })
      setPkg(res.package)
      setApproveOpen(false)
      setApproveComments("")
      toast.success(res.message ?? "Package approved and locked")
      router.push("/content-approver-packages")
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
      toast.warning(res.message ?? "Rejected")
      router.push("/content-approver-packages")
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
          <Link href="/content-approver-packages">Back</Link>
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
          <Link href="/content-approver-packages">Back</Link>
        </Button>
      </div>
    )
  }

  const status = pkg.status as PackageStatus
  const displayTitle = (pkg.name?.trim() || pkg.title).trim()

  return (
    <div className="min-h-full flex-1 bg-linear-to-b from-muted/40 via-background to-background pb-16">
      <div className="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-foreground" asChild>
          <Link href="/content-approver-packages">
            <ArrowLeft className="mr-1 size-4" />
            Approver queue
          </Link>
        </Button>

        <header className="space-y-5 border-b border-border/80 pb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Phase 6 · Final package · Content approver
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("uppercase", packageStatusBadgeClass(status))}
            >
              {PACKAGE_STATUS_LABELS[status] ?? status}
            </Badge>
            <Badge variant="secondary" className="font-normal">
              Video track: {TRACK_STATUS_LABELS[pkg.videoTrackStatus]}
            </Badge>
            <Badge variant="outline" className="font-normal">
              Metadata: {TRACK_STATUS_LABELS[pkg.metadataTrackStatus]}
            </Badge>
            <Badge variant="outline" className="tabular-nums font-normal">
              v{pkg.version}
            </Badge>
          </div>
          <div className="space-y-2">
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {displayTitle}
            </h1>
            {pkg.name?.trim() && pkg.name.trim() !== pkg.title?.trim() ? (
              <p className="text-sm text-muted-foreground">
                API title field:{" "}
                <span className="font-medium text-foreground">{pkg.title}</span>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>
                Script{" "}
                <span className="font-medium text-foreground">
                  {pkg.script?.title ?? "—"}
                </span>
              </span>
              {pkg.uploadedBy ? (
                <span className="flex items-center gap-1.5">
                  <User className="size-3.5 shrink-0" />
                  {pkg.uploadedBy.firstName} {pkg.uploadedBy.lastName}
                  {pkg.uploadedBy.role ? ` · ${pkg.uploadedBy.role}` : ""}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                Created {formatPackageDate(pkg.createdAt)}
              </span>
              <span>Updated {formatPackageDate(pkg.updatedAt)}</span>
              {pkg.assignedAt ? (
                <span>Assigned {formatPackageDate(pkg.assignedAt)}</span>
              ) : null}
            </div>
            {pkg.tags && pkg.tags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Hash className="size-3.5 shrink-0 text-muted-foreground" />
                <div className="flex flex-wrap gap-2">
                  {pkg.tags.map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="text-xs font-normal"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </header>

        {canFinalApprove ? (
          <Card className="border-primary/30 bg-primary/5 dark:bg-primary/10">
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-foreground">
                <span className="font-medium">Action required.</span> Review all
                sections below, then use final approve or reject at the bottom of
                the page.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() =>
                  document
                    .getElementById("final-package-actions")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Jump to sign-off
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-blue-200/60 bg-blue-50/60 shadow-none dark:border-blue-900/40 dark:bg-blue-950/25">
          <CardContent className="flex gap-4 py-5 sm:py-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-700 dark:text-blue-300">
              <Info className="size-5" />
            </div>
            <div className="min-w-0 space-y-2 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">How to read this page</p>
              <p>
                This page shows the final deliverables for this package. Review each deliverable and approve the package at the bottom of the page.
              </p>
            </div>
          </CardContent>
        </Card>

        <PackageTatCard pkg={pkg} />

        {/* <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Package at a glance
          </h2>
          <Card className="overflow-hidden border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20 py-4">
              <CardTitle className="text-base">Identifiers &amp; workflow</CardTitle>
              <CardDescription>
                Use these for support tickets and cross-checking the API.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <dl className="divide-y divide-border">
                <div className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(8rem,12rem)_1fr] sm:gap-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Package ID
                  </dt>
                  <dd className="break-all font-mono text-sm">{pkg.id}</dd>
                </div>
                <div className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(8rem,12rem)_1fr] sm:gap-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Script ID
                  </dt>
                  <dd className="break-all font-mono text-sm">{pkg.scriptId}</dd>
                </div>
                <div className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(8rem,12rem)_1fr] sm:gap-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Package status
                  </dt>
                  <dd className="text-sm font-medium">{PACKAGE_STATUS_LABELS[status] ?? status}</dd>
                </div>
                <div className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(8rem,12rem)_1fr] sm:gap-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Parallel tracks
                  </dt>
                  <dd className="text-sm text-muted-foreground">
                    Videos: {TRACK_STATUS_LABELS[pkg.videoTrackStatus]} · Metadata:{" "}
                    {TRACK_STATUS_LABELS[pkg.metadataTrackStatus]}
                  </dd>
                </div>
                {pkg.lockedAt ? (
                  <div className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(8rem,12rem)_1fr] sm:gap-4">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Locked at
                    </dt>
                    <dd className="text-sm">{formatPackageDate(pkg.lockedAt)}</dd>
                  </div>
                ) : null}
                {pkg.lockedBy ? (
                  <div className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(8rem,12rem)_1fr] sm:gap-4">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Locked by
                    </dt>
                    <dd className="text-sm">
                      {pkg.lockedBy.firstName} {pkg.lockedBy.lastName}
                      {pkg.lockedBy.role ? ` · ${pkg.lockedBy.role}` : ""}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>
        </section> */}

        {!hasNestedThumbnailsOnVideos && flatThumbnailAssets.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Thumbnail options (package-level)
            </h2>
            <Card className="border-0 shadow-md ring-1 ring-border/60">
              <CardHeader className="border-b border-border bg-muted/20">
                <div className="flex items-center gap-2">
                  <ImageIcon className="size-5 text-primary" />
                  <div>
                    <CardTitle className="text-base">All uploaded thumbnails</CardTitle>
                    <CardDescription>
                      Not nested under individual videos on this package — shown
                      once for reference next to the deliverables below.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {flatThumbnailAssets.map((t, i) => {
                    const isSelected = pkg.selectedThumbnail?.id === t.id
                    return (
                      <div
                        key={t.id}
                        className={cn(
                          "overflow-hidden rounded-xl border-2 p-2",
                          isSelected
                            ? "border-primary bg-primary/5 ring-2 ring-primary/15"
                            : "border-border"
                        )}
                      >
                        {isSelected ? (
                          <Badge className="mb-2 w-full justify-center">
                            Selected for publication
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="mb-2 font-mono text-xs">
                            Order {t.order ?? i + 1}
                          </Badge>
                        )}
                        <div className="overflow-hidden rounded-lg bg-muted/30">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={t.fileUrl}
                            alt=""
                            className="aspect-video w-full object-cover"
                          />
                        </div>
                        <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                          {t.fileName}
                        </p>
                        {formatPackageFileSize(t.fileSize ?? undefined) ? (
                          <p className="text-[10px] text-muted-foreground">
                            {formatPackageFileSize(t.fileSize ?? undefined)}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </section>
        ) : null}

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Deliverables
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Long-form and each short-form cut in a single card: metadata, thumbnail
              options, then the video player.
            </p>
          </div>
          <div className="space-y-8">
            {videoReviewSteps.map((step, i) => (
              <PackageInlineVideoCard
                key={step.asset.id}
                asset={step.asset}
                label={step.label}
                icon={step.icon}
                unifiedMetadata
                deliverableBlockBody={
                  videoDeliverableBlocks[i]?.body ?? null
                }
                selectedThumbnailId={pkg.selectedThumbnail?.id ?? null}
              />
            ))}
            {videoReviewSteps.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No video assets on this package.
                </CardContent>
              </Card>
            ) : null}
          </div>
        </section>

        {!canFinalApprove && status === "APPROVED" && pkg.lockedAt ? (
          <Card className="border-green-600/30 bg-green-50/50 dark:border-green-700/40 dark:bg-green-950/30">
            <CardContent className="flex items-center gap-3 py-4 text-sm text-green-900 dark:text-green-100">
              <CheckCircle className="size-5 shrink-0" />
              <span>
                This package is <strong>approved and locked</strong> as of{" "}
                {formatPackageDate(pkg.lockedAt)}.
              </span>
            </CardContent>
          </Card>
        ) : null}

        {canFinalApprove ? (
          <Card
            id="final-package-actions"
            className="border-primary/30 bg-primary/5 scroll-mt-24 dark:bg-primary/10"
          >
            <CardHeader>
              <CardTitle className="text-lg">Final sign-off</CardTitle>
              <CardDescription>
                Approve to lock this English final package for delivery.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Both Medical Affairs and Content/Brand have approved the package.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setApproveOpen(true)} className="bg-green-500 hover:bg-green-600">
                  <CheckCircle className="mr-2 size-4" />
                  Final approve &amp; lock
                </Button>
                {/* <Button variant="outline" onClick={() => setRejectOpen(true)}>
                  <XCircle className="mr-2 size-4" />
                  Reject
                </Button> */}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Final approval</DialogTitle>
            <DialogDescription>
              Locks the English final package for delivery.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Comments</Label>
            <Textarea
              value={approveComments}
              onChange={(e) => setApproveComments(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject package</DialogTitle>
            <DialogDescription>
              Sends the package back to Agency. Add at least one video note
              below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Long form detail (optional)</Label>
              <Textarea
                value={rejectLong}
                onChange={(e) => setRejectLong(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Short form detail (optional)</Label>
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
