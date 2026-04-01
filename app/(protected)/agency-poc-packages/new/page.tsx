/* eslint-disable react-hooks/set-state-in-effect */
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
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useAuthStore } from "@/store"
import type { UserRole } from "@/types/auth"
import { getScript, getScriptQueue } from "@/lib/scripts-api"
import { getVideoQueue } from "@/lib/videos-api"
import { isScriptEligibleForPhase6FinalPackage } from "@/lib/video-phase-gates"
import {
  clearPackageSubmitDraft,
  loadPackageSubmitDraft,
  migratePackageSubmitDraftV1ToV2Slots,
  normalizeRestoredFile,
  packageSubmitDraftHasUsefulState,
  savePackageSubmitDraft,
  userMessageForClearDraftFailure,
  userMessageForLoadDraftFailure,
  userMessageForSaveDraftFailure,
  type DraftPackageVideoSlot,
} from "@/lib/package-submit-draft-idb"
import {
  addPackageVideo,
  getPackageByScriptId,
  submitPackage,
  uploadPackageThumbnailFile,
  uploadPackageVideoFile,
} from "@/lib/packages-api"
import type { FinalPackage } from "@/types/package"
import type { Script } from "@/types/script"
import { getScriptDisplayInfo } from "@/lib/script-status-styles"
import {
  getAuthorDisplayName,
  getRelativeTime,
  getWordCountFromHtml,
} from "@/lib/script-card-utils"
import { formatPackageDate } from "@/lib/package-ui"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clapperboard,
  Info,
  Loader2,
  Package,
  Plus,
  Smartphone,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type PerVideoMeta = {
  title: string
  description: string
  tags: string[]
  /** Text still in the tag field; comma-separated segments count as tags without clicking Add. */
  tagDraft?: string
}

const EMPTY_VIDEO_META: PerVideoMeta = {
  title: "",
  description: "",
  tags: [],
  tagDraft: "",
}

function mergePackageTags(...groups: string[][]): string[] {
  const combined = groups.flat()
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of combined) {
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

function parseCommaSeparatedTagPieces(input: string): string[] {
  return input
    .split(/[,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

function mergeUniqueTagStrings(existing: string[], pieces: string[]): string[] {
  const next = [...existing]
  for (const p of pieces) {
    const lower = p.toLowerCase()
    if (next.some((x) => x.toLowerCase() === lower)) continue
    next.push(p)
  }
  return next
}

/** Committed tags plus any comma-separated (or single) text still in the draft field. */
function effectiveTagsFromMeta(m: PerVideoMeta): string[] {
  const pieces = parseCommaSeparatedTagPieces(m.tagDraft ?? "")
  return mergeUniqueTagStrings(m.tags, pieces)
}

function isVideoMetaComplete(m: PerVideoMeta): boolean {
  return Boolean(
    m.title.trim() &&
    m.description.trim() &&
    effectiveTagsFromMeta(m).length > 0
  )
}

type PackageVideoSlot = DraftPackageVideoSlot

function createNewVideoSlot(
  videoType: "LONG_FORM" | "SHORT_FORM"
): PackageVideoSlot {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `vid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    videoType,
    meta: { ...EMPTY_VIDEO_META },
    file: null,
    thumbnailFiles: [],
  }
}

const WIZARD_STEP_LABELS = [
  "Script context",
  "Videos",
  "Thumbnails",
  "Review & submit",
] as const

const WIZARD_STEP_COUNT = WIZARD_STEP_LABELS.length

/** Single column width: progress, form, and footer align to this. */
const WIZARD_COLUMN = "mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8"

/**
 * Phase 6: any number of videos; each slot is long- or short-form (chosen before upload).
 * Script is chosen from `/agency-poc-packages` (`?scriptId=` required).
 */
export default function AgencySubmitPackagePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const scriptId = (searchParams.get("scriptId") ?? "").trim()

  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [videoSlots, setVideoSlots] = useState<PackageVideoSlot[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [gateLoading, setGateLoading] = useState(true)
  const [gateError, setGateError] = useState<string | null>(null)
  const [scriptContext, setScriptContext] = useState<Script | null>(null)
  const [scriptExpanded, setScriptExpanded] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [draftHydrated, setDraftHydrated] = useState(false)
  /** When set, wizard only adds videos to this package (no POST /api/packages create). */
  const [existingPackage, setExistingPackage] = useState<FinalPackage | null>(
    null
  )
  /** POST /api/packages `name` for new packages only (not used when adding to existing). */
  const [packageName, setPackageName] = useState("")

  const role = user?.role as UserRole | undefined
  const isAgency = role === "AGENCY_POC" || role === "SUPER_ADMIN"

  useEffect(() => {
    if (!isAgency) return
    if (!scriptId) {
      router.replace("/agency-poc-packages")
    }
  }, [isAgency, scriptId, router])

  const runGate = useCallback(async () => {
    if (!token || !isAgency || !scriptId) return
    setGateLoading(true)
    setGateError(null)
    setScriptContext(null)
    setExistingPackage(null)
    try {
      let existingPkg: FinalPackage | null = null
      try {
        const existing = await getPackageByScriptId(token, scriptId)
        if (existing?.package?.id) {
          existingPkg = existing.package
        }
      } catch {
        /* No package yet — normal for first-time Phase 6 submit */
      }

      if (existingPkg) {
        setExistingPackage(existingPkg)
        try {
          const full = await getScript(token, scriptId)
          if (full.script) {
            setScriptContext(full.script)
          } else {
            setGateError("Could not load script for this package.")
          }
        } catch {
          setGateError(
            "Could not load script. Try again from Final packages."
          )
        }
        return
      }

      const res = await getScriptQueue(token)
      const combined = [...(res.available ?? []), ...(res.myReviews ?? [])]
      const s = combined.find((q) => q.id === scriptId)
      if (!s) {
        setGateError("This script is not in your queue.")
        return
      }
      if (s.status !== "LOCKED") {
        setGateError(
          "Only locked scripts can receive a final package (Phase 6)."
        )
        return
      }

      const videoRes = await getVideoQueue(token)
      const videos = [
        ...(videoRes.available ?? []),
        ...(videoRes.myReviews ?? []),
      ]
      if (!isScriptEligibleForPhase6FinalPackage(videos, scriptId)) {
        setGateError(
          "Complete Phases 4–5 first: First Line Up and First Cut must be approved before the final package (Phase 6). Use Video production until First Cut is approved."
        )
        return
      }

      let scriptForContext: Script = s
      try {
        const full = await getScript(token, scriptId)
        if (full.script) scriptForContext = full.script
      } catch {
        /* use queue payload */
      }
      setScriptContext(scriptForContext)
    } catch {
      setGateError("Could not verify script. Try again from Final packages.")
    } finally {
      setGateLoading(false)
    }
  }, [token, isAgency, scriptId])

  useEffect(() => {
    if (!token || !isAgency || !scriptId) {
      if (!scriptId && isAgency) setGateLoading(false)
      return
    }
    runGate()
  }, [token, isAgency, scriptId, runGate])

  useEffect(() => {
    if (!scriptId || gateLoading || gateError || !scriptContext) {
      return
    }
    let cancelled = false
    setDraftHydrated(false)
    void (async () => {
      const result = await loadPackageSubmitDraft(scriptId)
      if (cancelled) return
      if (!result.ok) {
        setPackageName("")
        const { title, description } = userMessageForLoadDraftFailure()
        toast.error(title, {
          description,
          id: "package-draft-load-failed",
        })
      } else if (result.draft?.v === 1) {
        const draft = result.draft
        setWizardStep(
          Math.max(0, Math.min(draft.wizardStep, WIZARD_STEP_COUNT - 1))
        )
        setScriptExpanded(draft.scriptExpanded)
        const migrated = migratePackageSubmitDraftV1ToV2Slots(draft)
        setPackageName(
          typeof draft.longVideoMeta?.title === "string"
            ? draft.longVideoMeta.title.trim()
            : ""
        )
        setVideoSlots(
          migrated.map((s) => ({
            ...s,
            file: normalizeRestoredFile(
              s.file,
              s.videoType === "LONG_FORM"
                ? "long-form-video.mp4"
                : `video-${s.id.slice(0, 8)}.mp4`
            ),
            thumbnailFiles: Array.isArray(s.thumbnailFiles)
              ? s.thumbnailFiles
                  .map((f, i) =>
                    normalizeRestoredFile(
                      f,
                      `thumbnail-${s.id.slice(0, 8)}-${i + 1}.jpg`
                    )
                  )
                  .filter((x): x is File => x != null)
              : s.thumbnailFile
                ? [
                    normalizeRestoredFile(
                      s.thumbnailFile,
                      `thumbnail-${s.id.slice(0, 8)}.jpg`
                    ),
                  ].filter((x): x is File => x != null)
                : [],
          }))
        )
        if (packageSubmitDraftHasUsefulState(draft)) {
          toast.info("Restored your in-progress package from this device.", {
            id: "package-draft-restored",
          })
        }
      } else if (result.draft?.v === 2) {
        const draft = result.draft
        setWizardStep(
          Math.max(0, Math.min(draft.wizardStep, WIZARD_STEP_COUNT - 1))
        )
        setScriptExpanded(draft.scriptExpanded)
        setPackageName(
          typeof draft.packageName === "string" ? draft.packageName : ""
        )
        const rawSlots = Array.isArray(draft.videoSlots)
          ? draft.videoSlots
          : []
        setVideoSlots(
          rawSlots.map((s) => ({
            id:
              typeof s?.id === "string" && s.id
                ? s.id
                : typeof crypto !== "undefined" && "randomUUID" in crypto
                  ? crypto.randomUUID()
                  : `vid-${Date.now()}`,
            videoType:
              s?.videoType === "SHORT_FORM" ? "SHORT_FORM" : "LONG_FORM",
            meta: {
              title: typeof s?.meta?.title === "string" ? s.meta.title : "",
              description:
                typeof s?.meta?.description === "string"
                  ? s.meta.description
                  : "",
              tags: Array.isArray(s?.meta?.tags) ? s.meta.tags : [],
              tagDraft:
                typeof s?.meta?.tagDraft === "string"
                  ? s.meta.tagDraft
                  : undefined,
            },
            file: normalizeRestoredFile(
              s?.file,
              (s?.videoType === "LONG_FORM"
                ? "long-form"
                : "video") + "-restored.mp4"
            ),
            thumbnailFiles: Array.isArray(s?.thumbnailFiles)
              ? s.thumbnailFiles
                  .map((f, i) =>
                    normalizeRestoredFile(f, `thumbnail-restored-${i + 1}.jpg`)
                  )
                  .filter((x): x is File => x != null)
              : s?.thumbnailFile
                ? [
                    normalizeRestoredFile(
                      s.thumbnailFile,
                      "thumbnail-restored.jpg"
                    ),
                  ].filter((x): x is File => x != null)
                : [],
          }))
        )
        if (packageSubmitDraftHasUsefulState(draft)) {
          toast.info("Restored your in-progress package from this device.", {
            id: "package-draft-restored",
          })
        }
      } else {
        setPackageName("")
      }
      if (!cancelled) {
        setVideoSlots((prev) =>
          prev.length === 0 ? [createNewVideoSlot("LONG_FORM")] : prev
        )
        setDraftHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [scriptId, gateLoading, gateError, scriptContext])

  useEffect(() => {
    if (!scriptId || !draftHydrated) return
    const handle = window.setTimeout(() => {
      void (async () => {
        const saveResult = await savePackageSubmitDraft(scriptId, {
          wizardStep,
          scriptExpanded,
          packageName,
          videoSlots,
        })
        if (!saveResult.ok) {
          const { title, description } = userMessageForSaveDraftFailure(
            saveResult.code
          )
          toast.warning(title, {
            description,
            id: "package-draft-save-failed",
          })
        }
      })()
    }, 500)
    return () => window.clearTimeout(handle)
  }, [scriptId, draftHydrated, wizardStep, scriptExpanded, packageName, videoSlots])

  const mergedPackageTags = useMemo(
    () =>
      mergePackageTags(...videoSlots.map((s) => effectiveTagsFromMeta(s.meta))),
    [videoSlots]
  )

  function addVideoSlot() {
    setVideoSlots((prev) => [...prev, createNewVideoSlot("SHORT_FORM")])
  }

  function removeVideoSlot(id: string) {
    setVideoSlots((prev) => {
      if (prev.length <= 1) {
        toast.error("Keep at least one video in this package.")
        return prev
      }
      return prev.filter((s) => s.id !== id)
    })
  }

  function setSlotVideoType(id: string, videoType: "LONG_FORM" | "SHORT_FORM") {
    setVideoSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, videoType } : s))
    )
  }

  function patchSlotMeta(id: string, action: SetStateAction<PerVideoMeta>) {
    setVideoSlots((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s
        const meta = typeof action === "function" ? action(s.meta) : action
        return { ...s, meta }
      })
    )
  }

  function setSlotFile(id: string, file: File | null) {
    setVideoSlots((prev) => prev.map((s) => (s.id === id ? { ...s, file } : s)))
  }

  const slotsMetaOk =
    videoSlots.length > 0 &&
    videoSlots.every((s) => isVideoMetaComplete(s.meta))
  const slotsFilesOk =
    videoSlots.length > 0 && videoSlots.every((s) => s.file != null)
  const perVideoMetaReady = slotsMetaOk
  const videosReady = slotsFilesOk && videoSlots.length > 0
  const thumbsReady =
    videoSlots.length > 0 &&
    videoSlots.every((s) => (s.thumbnailFiles?.length ?? 0) > 0)
  const allReady = perVideoMetaReady && videosReady && thumbsReady

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [wizardStep])

  function canProceedFromStep(step: number): boolean {
    switch (step) {
      case 0:
        return true
      case 1:
        return (
          videoSlots.length > 0 &&
          videoSlots.every(
            (s) => isVideoMetaComplete(s.meta) && Boolean(s.file)
          )
        )
      case 2:
        return thumbsReady
      default:
        return false
    }
  }

  async function performSubmit() {
    if (!token || !scriptId) return
    if (videoSlots.length < 1) {
      toast.error("Add at least one video")
      return
    }
    const incomplete = videoSlots.some(
      (s) =>
        !isVideoMetaComplete(s.meta) ||
        !s.file ||
        (s.thumbnailFiles?.length ?? 0) === 0
    )
    if (incomplete) {
      toast.error(
        "Each video needs a file, title, description, at least one tag, and a thumbnail"
      )
      return
    }
    if (mergedPackageTags.length === 0) {
      toast.error("Add tags for your videos")
      return
    }
    if (!existingPackage) {
      const trimmedPkgName = packageName.trim()
      if (!trimmedPkgName) {
        toast.error("Enter a package name.")
        return
      }
    }

    setSubmitting(true)
    try {
      const uploadedVideos = await Promise.all(
        videoSlots.map((s) => uploadPackageVideoFile(token, s.file!))
      )
      const uploadedThumbsBySlot = await Promise.all(
        videoSlots.map(async (s) => {
          const list = s.thumbnailFiles ?? []
          return await Promise.all(list.map((f) => uploadPackageThumbnailFile(token, f)))
        })
      )

      if (existingPackage) {
        const packageId = existingPackage.id
        for (let i = 0; i < videoSlots.length; i += 1) {
          const slot = videoSlots[i]!
          const vid = uploadedVideos[i]!
          const thumbs = uploadedThumbsBySlot[i] ?? []
          await addPackageVideo(token, packageId, {
            type: slot.videoType,
            fileUrl: vid.fileUrl,
            fileName: vid.fileName,
            fileType: vid.fileType,
            fileSize: vid.fileSize,
            title: slot.meta.title.trim(),
            description: slot.meta.description.trim(),
            tags: effectiveTagsFromMeta(slot.meta),
            thumbnails: thumbs.map((t) => ({
              fileUrl: t.fileUrl,
              fileName: t.fileName,
              fileType: t.fileType,
              fileSize: t.fileSize,
            })),
          })
        }
        toast.success(
          videoSlots.length === 1
            ? "Video added to your package."
            : `${videoSlots.length} videos added to your package.`,
          {
            description:
              "Each new deliverable starts its own Medical + Brand review.",
          }
        )
        const clearResult = await clearPackageSubmitDraft(scriptId)
        if (!clearResult.ok) {
          const { title, description } = userMessageForClearDraftFailure()
          toast.info(title, {
            description,
            id: "package-draft-clear-failed",
          })
        }
        router.push(`/agency-poc-packages/${packageId}`)
        return
      }

      const trimmedPkgName = packageName.trim()
      const first = videoSlots[0]!
      const firstVid = uploadedVideos[0]!
      const firstThumbs = uploadedThumbsBySlot[0] ?? []
      const firstVideo = {
        type: first.videoType,
        fileUrl: firstVid.fileUrl,
        fileName: firstVid.fileName,
        fileType: firstVid.fileType,
        fileSize: firstVid.fileSize,
        title: first.meta.title.trim(),
        description: first.meta.description.trim(),
        tags: effectiveTagsFromMeta(first.meta),
        thumbnails: firstThumbs.map((t) => ({
          fileUrl: t.fileUrl,
          fileName: t.fileName,
          fileType: t.fileType,
          fileSize: t.fileSize,
        })),
      }

      const res = await submitPackage(token, {
        scriptId,
        name: trimmedPkgName,
        video: firstVideo,
      })
      const packageId = res.package.id
      for (let i = 1; i < videoSlots.length; i += 1) {
        const slot = videoSlots[i]!
        const vid = uploadedVideos[i]!
        const thumbs = uploadedThumbsBySlot[i] ?? []
        await addPackageVideo(token, packageId, {
          type: slot.videoType,
          fileUrl: vid.fileUrl,
          fileName: vid.fileName,
          fileType: vid.fileType,
          fileSize: vid.fileSize,
          title: slot.meta.title.trim(),
          description: slot.meta.description.trim(),
          tags: effectiveTagsFromMeta(slot.meta),
          thumbnails: thumbs.map((t) => ({
            fileUrl: t.fileUrl,
            fileName: t.fileName,
            fileType: t.fileType,
            fileSize: t.fileSize,
          })),
        })
      }
      toast.success(res.message ?? "Package submitted", {
        description: "Medical and Brand parallel review has started.",
      })
      const clearResult = await clearPackageSubmitDraft(scriptId)
      if (!clearResult.ok) {
        const { title, description } = userMessageForClearDraftFailure()
        toast.info(title, {
          description,
          id: "package-draft-clear-failed",
        })
      }
      router.push(`/agency-poc-packages/${packageId}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submit failed"
      toast.error("Could not submit package", { description: msg })
    } finally {
      setSubmitting(false)
    }
  }

  /** Block native form submit (e.g. Enter in inputs). Submit only via the explicit footer button. */
  function preventImplicitFormSubmit(e: React.FormEvent) {
    e.preventDefault()
  }

  if (!isAgency) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">
          Only Agency POC or Super Admin can submit packages.
        </p>
        <Button variant="link" asChild className="mt-2 pl-0">
          <Link href="/agency-poc-packages">Back</Link>
        </Button>
      </div>
    )
  }

  if (!scriptId) {
    return (
      <div className="p-6 md:p-8">
        <div className="mx-auto max-w-4xl">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (gateLoading) {
    return (
      <div className="p-6 md:p-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading script…</p>
        </div>
      </div>
    )
  }

  if (gateError) {
    return (
      <div className="p-6 md:p-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link href="/agency-poc-packages">
              <ArrowLeft className="mr-1 size-4" />
              Back to Final packages
            </Link>
          </Button>
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base">Cannot submit here</CardTitle>
              <CardDescription>{gateError}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/agency-poc-packages">View eligible scripts</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const sc = scriptContext!
  const addingToExisting = Boolean(existingPackage)
  const existingPackageTitle =
    existingPackage?.name?.trim() ||
    existingPackage?.title?.trim() ||
    "this package"

  const canSubmitFinal =
    allReady && (addingToExisting || packageName.trim().length > 0)
  const lastStepBlockedHint = !allReady
    ? "Complete all steps first"
    : !addingToExisting && !packageName.trim()
      ? "Enter a package name"
      : undefined

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gradient-to-b from-muted/30 to-background">
      <form
        onSubmit={preventImplicitFormSubmit}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div
          className={cn(
            WIZARD_COLUMN,
            "flex flex-1 flex-col pt-8 pb-8 sm:pt-10 sm:pb-10"
          )}
        >
          <div className="mb-10 flex flex-col gap-6 sm:mb-12">
            <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
              <Link href="/agency-poc-packages">
                <ArrowLeft className="mr-1 size-4" />
                Final packages
              </Link>
            </Button>

            {addingToExisting ? (
              <Card className="border-primary/30 bg-primary/5 shadow-none">
                <CardContent className="flex gap-4 py-5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Info className="size-5" />
                  </div>
                  <div className="min-w-0 text-sm leading-relaxed">
                    <p className="font-semibold text-foreground">
                      Adding deliverables to an existing package
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      <strong className="text-foreground">
                        {existingPackageTitle}
                      </strong>{" "}
                      already exists for this script. Complete the wizard to
                      submit{" "}
                      <strong className="text-foreground">
                        one or more new videos
                      </strong>{" "}
                      — each starts its own review (POST{" "}
                      <code className="rounded bg-muted px-1 text-xs">
                        /packages/:id/videos
                      </code>
                      ), not a second package.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <header className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Package className="size-6" />
                </div>
                <Badge variant="secondary" className="font-normal">
                  Phase 6 · Final package
                </Badge>
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  {addingToExisting
                    ? "Add videos to package"
                    : "Submit final package"}
                </h1>
                <p className="mt-3 max-w-prose text-base leading-relaxed text-muted-foreground">
                  {addingToExisting
                    ? "Upload and describe each new deliverable here. Nothing is sent until the last step. Package name stays the same — rename it from the package page if needed."
                    : "Add any number of videos — for each one, choose long- or short-form before uploading. Nothing is submitted until the final step."}
                </p>
              </div>
            </header>

            <PackageWizardChrome
              currentStep={wizardStep}
              labels={[...WIZARD_STEP_LABELS]}
              onStepClick={(i) => {
                if (i < wizardStep) setWizardStep(i)
              }}
            />
          </div>

          <div className="min-h-[min(52vh,560px)] w-full flex-1">
            {wizardStep === 0 && (
              <div className="w-full space-y-8 py-4">
                <StepIntro
                  title="Confirm script context"
                  body="You’re submitting the final English package for this locked script. Expand the script body if you need to double-check claims before uploading videos."
                />
                <ScriptContextCard
                  className="shadow-lg"
                  script={sc}
                  scriptId={scriptId}
                  expanded={scriptExpanded}
                  onToggleExpand={() => setScriptExpanded((v) => !v)}
                  showWorkspaceLink={user?.role === "AGENCY_POC"}
                />

                {!addingToExisting ? (
                  <Card className="shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-base">Package name</CardTitle>
                      <CardDescription>
                        This label appears in queues and headers. It is separate
                        from each video&apos;s title on the next step.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Label htmlFor="package-name">Name</Label>
                      <Input
                        id="package-name"
                        value={packageName}
                        onChange={(e) => setPackageName(e.target.value)}
                        placeholder="e.g. Heart Health Q1 final package"
                        autoComplete="off"
                      />
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            )}

            {wizardStep === 1 && (
              <div className="w-full space-y-10 py-4">
                <StepIntro
                  title="Videos"
                  body={
                    addingToExisting
                      ? "For each new deliverable, choose long- or short-form first, then add metadata and the video file. You can queue several additions in one go; they are submitted together on the last step."
                      : "For each deliverable, choose long-form or short-form first, then add metadata and the video file. You can add as many videos as you need. Each video has its own title; the package name was set on the previous step."
                  }
                />
                <div className="space-y-12">
                  {videoSlots.map((slot, index) => (
                    <div key={slot.id} className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-medium text-muted-foreground">
                          Video {index + 1} of {videoSlots.length}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-muted-foreground"
                          onClick={() => removeVideoSlot(slot.id)}
                        >
                          <Trash2 className="size-3.5" />
                          Remove
                        </Button>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
                        <p className="text-sm font-medium text-foreground">
                          Video type
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Select this before uploading the file. You can change
                          it until you submit.
                        </p>
                        <div
                          className="mt-4 flex flex-wrap gap-2"
                          role="group"
                          aria-label="Video format"
                        >
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              slot.videoType === "LONG_FORM"
                                ? "default"
                                : "outline"
                            }
                            className={cn(
                              slot.videoType === "LONG_FORM" &&
                                "bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-white"
                            )}
                            onClick={() =>
                              setSlotVideoType(slot.id, "LONG_FORM")
                            }
                          >
                            <Clapperboard className="mr-2 size-4" />
                            Long-form
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              slot.videoType === "SHORT_FORM"
                                ? "default"
                                : "outline"
                            }
                            className={cn(
                              slot.videoType === "SHORT_FORM" &&
                                "bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-white"
                            )}
                            onClick={() =>
                              setSlotVideoType(slot.id, "SHORT_FORM")
                            }
                          >
                            <Smartphone className="mr-2 size-4" />
                            Short-form
                          </Button>
                        </div>
                      </div>
                      <VideoDeliverableCard
                        badge={`${slot.videoType === "LONG_FORM" ? "Long-form" : "Short-form"} · ${index + 1}`}
                        heading={
                          slot.videoType === "LONG_FORM"
                            ? "Long-form deliverable"
                            : "Short-form deliverable"
                        }
                        subheading={
                          slot.videoType === "LONG_FORM"
                            ? "Full-length or main cut."
                            : "e.g. reel or shorter cut."
                        }
                        meta={slot.meta}
                        onMetaChange={(action) =>
                          patchSlotMeta(slot.id, action)
                        }
                        file={slot.file}
                        onFile={(f) => setSlotFile(slot.id, f)}
                        dropId={`pkg-video-${slot.id}`}
                        emphasized={index === 0}
                        icon={
                          slot.videoType === "LONG_FORM" ? (
                            <Clapperboard className="size-5" />
                          ) : (
                            <Smartphone className="size-5" />
                          )
                        }
                        idPrefix={`v-${slot.id}`}
                        spacious
                      />
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  className="gap-2"
                  onClick={addVideoSlot}
                >
                  <Plus className="size-4" />
                  Add another video
                </Button>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="w-full space-y-10 py-4">
                <StepIntro
                  title="Thumbnails (one or more per video)"
                  body="Upload one or more images per video. Content/Brand will review each thumbnail individually in Phase 6; only rejected thumbnails come back for revision."
                />
                <div className="space-y-10">
                  {videoSlots.map((slot, index) => (
                    <Card
                      key={slot.id}
                      className="border-0 shadow-lg ring-1 ring-border/60"
                    >
                      <CardContent className="space-y-6 px-6 py-8 sm:px-10 sm:py-10">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="font-mono text-xs"
                          >
                            Thumbnail {index + 1}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {slot.videoType === "LONG_FORM"
                              ? "Long-form"
                              : "Short-form"}
                          </Badge>
                          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            For this video
                          </span>
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">
                            Video {index + 1}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {slot.meta.title.trim() ||
                              "— add a title on the Videos step"}
                          </p>
                        </div>
                        <MultiThumbnailSlot
                          inputId={`thumb-${slot.id}`}
                          emptyHint="Upload one or more images (16:9 recommended)"
                          files={slot.thumbnailFiles ?? []}
                          onFiles={(files) =>
                            setVideoSlots((prev) =>
                              prev.map((s) =>
                                s.id === slot.id ? { ...s, thumbnailFiles: files } : s
                              )
                            )
                          }
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="w-full space-y-10 py-4">
                <StepIntro
                  title="Review & submit"
                  body={
                    addingToExisting
                      ? "Check the summary below, then submit — each new deliverable goes to Medical + Content/Brand review on its own timeline."
                      : "Check the summary below. When everything looks right, submit — Medical and Content/Brand review starts in parallel."
                  }
                />
                <ReviewSummaryCard
                  videoSlots={videoSlots}
                  mergedTags={mergedPackageTags}
                  slotsMetaOk={slotsMetaOk}
                  videosReady={videosReady}
                  thumbsReady={thumbsReady}
                  addingToExisting={addingToExisting}
                  existingPackageDisplayName={existingPackageTitle}
                  packageName={packageName}
                  onPackageNameChange={setPackageName}
                />
              </div>
            )}
          </div>
        </div>

        <WizardFooter
          wizardStep={wizardStep}
          stepCount={WIZARD_STEP_COUNT}
          canProceed={canProceedFromStep(wizardStep)}
          allReady={canSubmitFinal}
          lastStepBlockedHint={lastStepBlockedHint}
          submitting={submitting}
          confirmLabel={
            addingToExisting ? "Add videos to package" : "Submit final package"
          }
          onBack={() => setWizardStep((s) => Math.max(0, s - 1))}
          onContinue={() =>
            setWizardStep((s) => Math.min(WIZARD_STEP_COUNT - 1, s + 1))
          }
          onConfirmSubmit={() => void performSubmit()}
        />
      </form>
    </div>
  )
}

function PackageWizardChrome({
  currentStep,
  labels,
  onStepClick,
}: {
  currentStep: number
  labels: string[]
  onStepClick: (index: number) => void
}) {
  const pct = ((currentStep + 1) / labels.length) * 100
  return (
    <nav
      aria-label="Submission steps"
      className="w-full rounded-2xl border border-border/80 bg-card/60 p-6 shadow-sm backdrop-blur-sm sm:p-8"
    >
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Progress
        </p>
        <p className="text-sm text-muted-foreground">
          Step{" "}
          <span className="font-semibold text-foreground">
            {currentStep + 1}
          </span>{" "}
          of {labels.length}
        </p>
      </div>
      <div className="mb-8 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-green-500 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-2">
        {labels.map((label, i) => {
          const done = i < currentStep
          const active = i === currentStep
          const clickable = i < currentStep
          return (
            <button
              key={label}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick(i)}
              className={cn(
                "rounded-full px-3 py-2 text-left text-sm transition-colors sm:text-center",
                active &&
                  "bg-primary bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-primary-foreground text-white shadow-sm hover:opacity-90 sm:min-w-34",
                done &&
                  "cursor-pointer bg-primary/12 text-primary hover:bg-primary/18",
                !active &&
                  !done &&
                  "cursor-default bg-muted/50 text-muted-foreground"
              )}
            >
              <span className="font-mono text-xs opacity-80">{i + 1}.</span>{" "}
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function StepIntro({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  )
}

function WizardFooter({
  wizardStep,
  stepCount,
  canProceed,
  allReady,
  lastStepBlockedHint,
  submitting,
  confirmLabel = "Submit final package",
  onBack,
  onContinue,
  onConfirmSubmit,
}: {
  wizardStep: number
  stepCount: number
  canProceed: boolean
  allReady: boolean
  /** When the final submit button is disabled, explains why (e.g. missing package name). */
  lastStepBlockedHint?: string
  submitting: boolean
  confirmLabel?: string
  onBack: () => void
  onContinue: () => void
  onConfirmSubmit: () => void
}) {
  const isLast = wizardStep === stepCount - 1
  return (
    <footer className="mt-auto shrink-0 border-t border-border bg-background/95 shadow-[0_-4px_24px_-12px_rgba(0,0,0,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-background/90 dark:shadow-none">
      <div
        className={cn(
          WIZARD_COLUMN,
          "flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between"
        )}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            onClick={onBack}
            disabled={wizardStep === 0}
          >
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            asChild
          >
            <Link href="/agency-poc-packages">Exit to list</Link>
          </Button>
        </div>
        {!isLast ? (
          <Button
            type="button"
            size="lg"
            className="w-full gap-2 bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-white hover:opacity-90 sm:ml-auto sm:w-auto"
            disabled={!canProceed}
            onClick={onContinue}
            title={!canProceed ? "Complete this step to continue" : undefined}
          >
            Continue
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            disabled={!allReady || submitting}
            className="w-full border-0 bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-white hover:opacity-90 sm:ml-auto sm:w-auto"
            title={
              submitting
                ? undefined
                : !allReady
                  ? lastStepBlockedHint ?? "Complete all steps first"
                  : undefined
            }
            onClick={onConfirmSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                {confirmLabel}
                <ArrowRight className="ml-2 size-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </footer>
  )
}

/** Centered preview rail — same width for every video/thumbnail on the review step. */
const REVIEW_PREVIEW_MAX = "mx-auto w-full max-w-2xl"

/** Local file preview on the review step (object URL; revoked on unmount). */
function ReviewBlobVideoPreview({ file }: { file: File | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  if (!file || !url) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-muted/50 px-4 text-center text-xs text-muted-foreground">
        No video file attached
      </div>
    )
  }
  return (
    <video
      key={url}
      src={url}
      controls
      playsInline
      preload="metadata"
      className="max-h-[min(55vh,26rem)] w-full bg-black object-contain"
    >
      Preview is not available in this browser.
    </video>
  )
}

function ReviewBlobImagePreview({ file }: { file: File | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  if (!file || !url) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-muted/50 px-4 text-center text-xs text-muted-foreground">
        No image attached
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob preview
    <img src={url} alt="" className="aspect-video w-full object-cover" />
  )
}

function ReviewSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
      <span
        className="h-4 w-1 shrink-0 rounded-full bg-primary/70"
        aria-hidden
      />
      {children}
    </h3>
  )
}

function ReviewThumbnailBlock({
  index,
  targetLabel,
  videoTitle,
  files,
  ok,
}: {
  index: number
  targetLabel: string
  videoTitle: string
  files: File[]
  ok: boolean
}) {
  return (
    <li
      className={cn(
        "overflow-hidden rounded-2xl border shadow-sm",
        ok ? "border-border bg-card" : "border-destructive/35 bg-destructive/5"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="secondary" className="shrink-0 font-mono text-xs">
            Thumbnail {index}
          </Badge>
          <span className="text-sm font-medium text-foreground">
            {targetLabel}
          </span>
        </div>
        {ok ? (
          <Badge
            variant="outline"
            className="shrink-0 border-green-500/40 text-green-700 dark:text-green-400"
          >
            Ready
          </Badge>
        ) : (
          <Badge variant="destructive" className="shrink-0">
            Incomplete
          </Badge>
        )}
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">For video: </span>
          {videoTitle}
        </p>
        <p className="font-mono text-xs break-all text-muted-foreground">
          {files.length > 0 ? `${files.length} image(s)` : "—"}
        </p>
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Image preview
          </p>
          <div
            className={cn(
              REVIEW_PREVIEW_MAX,
              "overflow-hidden rounded-xl border border-border bg-muted/20 ring-1 ring-border/60"
            )}
          >
            <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3">
              {files.length === 0 ? (
                <div className="col-span-full flex aspect-video w-full items-center justify-center bg-muted/50 px-4 text-center text-xs text-muted-foreground">
                  No image attached
                </div>
              ) : (
                files.map((f, i) => (
                  <div
                    key={`${f.name}-${f.size}-${i}`}
                    className="overflow-hidden rounded-lg border border-border bg-muted/30"
                  >
                    <ReviewBlobImagePreview file={f} />
                    <p className="truncate px-1 py-1 font-mono text-[10px] text-muted-foreground">
                      {f.name}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}

function ReviewSummaryCard({
  videoSlots,
  mergedTags,
  slotsMetaOk,
  videosReady,
  thumbsReady,
  addingToExisting = false,
  existingPackageDisplayName,
  packageName = "",
  onPackageNameChange,
}: {
  videoSlots: PackageVideoSlot[]
  mergedTags: string[]
  slotsMetaOk: boolean
  videosReady: boolean
  thumbsReady: boolean
  addingToExisting?: boolean
  existingPackageDisplayName?: string
  packageName?: string
  onPackageNameChange?: (value: string) => void
}) {
  return (
    <Card className="overflow-hidden border-0 shadow-lg ring-1 ring-border/60">
      <CardHeader className="border-b border-border bg-muted/30 px-5 py-7 sm:px-8 sm:py-8">
        <CardTitle className="text-lg">
          {addingToExisting ? "Addition summary" : "Package summary"}
        </CardTitle>
        <CardDescription className="mt-2 max-w-prose">
          {addingToExisting ? (
            <>
              These deliverables will be added to{" "}
              <strong>{existingPackageDisplayName ?? "your package"}</strong>.
              The package name does not change from this wizard. Each video is
              sent with its type, title, description, tags, and thumbnails.
              Previews are local until you submit.
            </>
          ) : (
            <>
              Package <code className="text-xs">name</code> is the container
              label you set below. Each video is submitted with its own type,
              title, description, tags, and thumbnails. Previews below are local
              until you submit.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-12 bg-muted/5 px-5 py-8 sm:px-8 sm:py-10">
        {!addingToExisting && onPackageNameChange ? (
          <div className="space-y-4">
            <ReviewSectionTitle>Package name</ReviewSectionTitle>
            <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
              <Label htmlFor="review-package-name">Name</Label>
              <Input
                id="review-package-name"
                className="mt-2"
                value={packageName}
                onChange={(e) => onPackageNameChange(e.target.value)}
                placeholder="Package name shown in lists"
              />
            </div>
          </div>
        ) : null}
        <div className="space-y-4">
          <ReviewSectionTitle>Videos</ReviewSectionTitle>
          <ul className="flex flex-col gap-6">
            {videoSlots.map((slot, i) => (
              <ReviewVideoRow
                key={slot.id}
                label={`${slot.videoType === "LONG_FORM" ? "Long-form" : "Short-form"} · ${i + 1}`}
                meta={slot.meta}
                file={slot.file}
                ok={isVideoMetaComplete(slot.meta) && Boolean(slot.file)}
              />
            ))}
          </ul>
        </div>
        <div className="space-y-4 border-t border-border pt-10">
          <ReviewSectionTitle>Thumbnails (one per video)</ReviewSectionTitle>
          <ul className="flex flex-col gap-6">
            {videoSlots.map((slot, i) => (
              <ReviewThumbnailBlock
                key={slot.id}
                index={i + 1}
                targetLabel={`Video ${i + 1} (${slot.videoType === "LONG_FORM" ? "long" : "short"})`}
                videoTitle={slot.meta.title.trim() || "—"}
                files={slot.thumbnailFiles ?? []}
                ok={(slot.thumbnailFiles?.length ?? 0) > 0}
              />
            ))}
          </ul>
        </div>
        <div className="space-y-4 border-t border-border pt-10">
          <ReviewSectionTitle>
            Merged tags ({mergedTags.length})
          </ReviewSectionTitle>
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {mergedTags.length ? (
                mergedTags.map((t) => (
                  <Badge key={t} variant="secondary" className="font-normal">
                    {t}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-border pt-10">
          <ReviewSectionTitle>Ready to submit</ReviewSectionTitle>
          <ul className="mt-4 space-y-0 divide-y divide-border rounded-xl border border-border bg-card text-sm shadow-sm">
            {!addingToExisting ? (
              <ReviewCheck
                ok={packageName.trim().length > 0}
                text="Package name entered"
              />
            ) : null}
            <ReviewCheck
              ok={videosReady}
              text="Video file attached for every deliverable"
            />
            <ReviewCheck
              ok={thumbsReady}
              text="At least one thumbnail uploaded for each video"
            />
            <ReviewCheck
              ok={slotsMetaOk}
              text="Title, description, and tags complete for each video"
            />
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

function ReviewVideoRow({
  label,
  meta,
  file,
  ok,
}: {
  label: string
  meta: PerVideoMeta
  file: File | null
  ok: boolean
}) {
  const reviewTags = effectiveTagsFromMeta(meta)
  return (
    <li
      className={cn(
        "overflow-hidden rounded-2xl border shadow-sm",
        ok ? "border-border bg-card" : "border-destructive/35 bg-destructive/5"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3 sm:px-5">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        {ok ? (
          <Badge
            variant="outline"
            className="shrink-0 border-green-500/40 text-green-700 dark:text-green-400"
          >
            Ready
          </Badge>
        ) : (
          <Badge variant="destructive" className="shrink-0">
            Incomplete
          </Badge>
        )}
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-4">
          <p className="text-sm font-medium text-foreground">
            {meta.title.trim() || "—"}
          </p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {meta.description.trim() || "—"}
          </p>
          <div className="flex flex-wrap items-baseline gap-1.5 gap-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              Tags
            </span>
            {reviewTags.length ? (
              reviewTags.map((t, i) => (
                <Badge
                  key={`${t}-${i}`}
                  variant="outline"
                  className="text-xs font-normal"
                >
                  {t}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
          <p className="font-mono text-xs break-all text-muted-foreground">
            {file?.name ?? "—"}
            {file ? ` · ${formatBytes(file.size)}` : ""}
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Video preview
          </p>
          <div
            className={cn(
              REVIEW_PREVIEW_MAX,
              "overflow-hidden rounded-xl border border-border bg-black ring-1 ring-border/60"
            )}
          >
            <ReviewBlobVideoPreview file={file} />
          </div>
        </div>
      </div>
    </li>
  )
}

function ReviewCheck({
  ok,
  text,
  className,
}: {
  ok: boolean
  text: string
  className?: string
}) {
  return (
    <li className={cn("flex items-start gap-3 px-4 py-3.5 sm:px-5", className)}>
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border",
          ok
            ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
            : "border-muted-foreground/25 bg-muted text-muted-foreground"
        )}
      >
        {ok ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1 leading-snug text-foreground">
        {text}
      </span>
    </li>
  )
}

function VideoTagsPicker({
  idPrefix,
  meta,
  onMetaChange,
  spacious,
}: {
  idPrefix: string
  meta: PerVideoMeta
  onMetaChange: Dispatch<SetStateAction<PerVideoMeta>>
  spacious?: boolean
}) {
  const inputId = `${idPrefix}-tag-draft`
  const draft = meta.tagDraft ?? ""

  function commitDraft() {
    const pieces = parseCommaSeparatedTagPieces(draft)
    if (pieces.length === 0) return
    onMetaChange((m) => ({
      ...m,
      tags: mergeUniqueTagStrings(m.tags, pieces),
      tagDraft: "",
    }))
  }

  function removeTag(index: number) {
    onMetaChange((m) => ({
      ...m,
      tags: m.tags.filter((_, i) => i !== index),
    }))
  }

  const hasEffectiveTags = effectiveTagsFromMeta(meta).length > 0

  return (
    <div className="space-y-3">
      <Label htmlFor={inputId} className="text-base">
        Tags
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <Input
          id={inputId}
          value={draft}
          onChange={(e) =>
            onMetaChange((m) => ({ ...m, tagDraft: e.target.value }))
          }
          onBlur={() => commitDraft()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commitDraft()
            }
          }}
          placeholder="Type a tag, or several separated by commas"
          className={cn("min-w-0 flex-1", spacious && "h-12 text-base")}
        />
        <Button
          type="button"
          variant="outline"
          className={cn("shrink-0 sm:w-28", spacious && "h-12")}
          onClick={commitDraft}
        >
          Add
        </Button>
      </div>
      {meta.tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Selected tags">
          {meta.tags.map((tag, i) => (
            <li key={`${tag}-${i}`}>
              <Badge
                variant="secondary"
                className="h-8 max-w-full gap-1 py-0 pr-1 pl-3 text-sm font-normal"
              >
                <span className="max-w-[min(100%,14rem)] truncate">{tag}</span>
                <button
                  type="button"
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => removeTag(i)}
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="size-3.5 shrink-0" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : !hasEffectiveTags ? (
        <p className="text-sm text-muted-foreground">
          No tags yet. Add at least one for this video.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Tags typed above count toward this video (comma-separated). Use Add,
          Enter, or leave the field to move them into the list below.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Comma-separated values count as separate tags even before Add. Press
        Enter, click Add, or leave the field to commit to the list. Duplicate
        tags (ignoring case) are skipped. All videos&apos; tags merge on the
        package for search.
      </p>
    </div>
  )
}

function VideoDeliverableCard({
  badge,
  heading,
  subheading,
  meta,
  onMetaChange,
  file,
  onFile,
  dropId,
  emphasized,
  icon,
  idPrefix,
  spacious,
}: {
  badge: string
  heading: string
  subheading: string
  meta: PerVideoMeta
  onMetaChange: Dispatch<SetStateAction<PerVideoMeta>>
  file: File | null
  onFile: (f: File | null) => void
  dropId: string
  emphasized?: boolean
  icon: React.ReactNode
  idPrefix: string
  /** Single-column, extra padding — for wizard steps. */
  spacious?: boolean
}) {
  const metaOk = isVideoMetaComplete(meta)
  return (
    <Card
      className={cn(
        "overflow-hidden shadow-lg ring-1 transition-shadow",
        emphasized ? "ring-primary/25" : "ring-border/60 hover:ring-border"
      )}
    >
      <CardHeader
        className={cn(
          "space-y-2 border-b px-6 py-6 sm:px-8 sm:py-8",
          emphasized ? "bg-primary/[0.07] dark:bg-primary/10" : "bg-muted/30"
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            {badge}
          </Badge>
          {metaOk ? (
            <Badge
              variant="outline"
              className="border-green-500/40 text-xs text-green-700 dark:text-green-400"
            >
              Metadata ready
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">
              Title, description & tags required
            </span>
          )}
        </div>
        <CardTitle className={cn("text-lg", spacious && "text-xl sm:text-2xl")}>
          {heading}
        </CardTitle>
        <CardDescription className="text-base">{subheading}</CardDescription>
      </CardHeader>
      <CardContent
        className={cn(
          spacious
            ? "flex flex-col gap-12 px-6 py-10 sm:px-8 sm:py-12"
            : "grid gap-8 pt-6 lg:grid-cols-2 lg:gap-10"
        )}
      >
        <div className={cn("space-y-6", spacious && "space-y-8")}>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-title`} className="text-base">
              Title for this video
            </Label>
            <Input
              id={`${idPrefix}-title`}
              value={meta.title}
              onChange={(e) =>
                onMetaChange((m) => ({ ...m, title: e.target.value }))
              }
              placeholder="How this cut should appear in review / stores"
              className={cn("h-11", spacious && "h-12 text-base")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-desc`} className="text-base">
              Description
            </Label>
            <Textarea
              id={`${idPrefix}-desc`}
              value={meta.description}
              onChange={(e) =>
                onMetaChange((m) => ({ ...m, description: e.target.value }))
              }
              rows={spacious ? 6 : 4}
              placeholder="What this version covers, audience, key messages…"
              className={cn(
                "min-h-[100px] resize-y",
                spacious && "min-h-[140px] text-base"
              )}
            />
          </div>
          <VideoTagsPicker
            idPrefix={idPrefix}
            meta={meta}
            onMetaChange={onMetaChange}
            spacious={spacious}
          />
        </div>
        <div
          className={cn(
            "flex flex-col",
            spacious ? "min-h-[260px] gap-3" : "min-h-[200px] lg:pt-1"
          )}
        >
          <Label className="text-base text-foreground">Video file</Label>
          <MediaDropZone
            id={dropId}
            compactLabel="Drop video or browse"
            accept="video/*"
            file={file}
            onFile={onFile}
            emphasized={emphasized}
            icon={icon}
            className={spacious ? "min-h-[220px] flex-1" : undefined}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function ScriptContextCard({
  className,
  script,
  scriptId,
  expanded,
  onToggleExpand,
  showWorkspaceLink,
}: {
  className?: string
  script: Script
  scriptId: string
  expanded: boolean
  onToggleExpand: () => void
  showWorkspaceLink: boolean
}) {
  const info = getScriptDisplayInfo(script)
  const author = getAuthorDisplayName(script.createdBy)
  const words = getWordCountFromHtml(script.content ?? "")
  const hasBody = Boolean(script.content?.replace(/<[^>]*>/g, "").trim())

  return (
    <Card
      className={cn(
        "overflow-hidden border-primary/20 shadow-md ring-1 ring-primary/10",
        className
      )}
    >
      <CardHeader className="space-y-4 border-b border-border bg-gradient-to-br from-primary/5 via-background to-background px-6 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn("text-xs", info.className)}
              >
                {info.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Script v{script.version} · {getRelativeTime(script.updatedAt)}
              </span>
            </div>
            <CardTitle className="text-xl leading-tight sm:text-2xl">
              {script.title || "Untitled script"}
            </CardTitle>
            {script.insight ? (
              <CardDescription className="text-sm leading-relaxed text-foreground/80">
                {script.insight}
              </CardDescription>
            ) : null}
          </div>
          {showWorkspaceLink ? (
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/agency-poc/${scriptId}`}>
                  Open script workspace
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Medical Affairs author
            </dt>
            <dd className="mt-0.5 font-medium text-foreground">{author}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Last updated
            </dt>
            <dd className="mt-0.5 text-foreground">
              {formatPackageDate(script.updatedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Approx. word count
            </dt>
            <dd className="mt-0.5 text-foreground">{words.toLocaleString()}</dd>
          </div>
        </dl>
      </CardHeader>
      {hasBody && (
        <CardContent className="px-6 pt-2 pb-8 sm:px-8 sm:pb-10">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            <span>Approved script content (read-only)</span>
            {expanded ? (
              <ChevronUp className="size-4 shrink-0 opacity-60" />
            ) : (
              <ChevronDown className="size-4 shrink-0 opacity-60" />
            )}
          </button>
          {expanded && (
            <div
              className="mt-3 max-h-[min(24rem,50vh)] overflow-y-auto rounded-lg border border-border bg-card p-4 text-sm leading-relaxed shadow-inner [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: script.content ?? "" }}
            />
          )}
        </CardContent>
      )}
    </Card>
  )
}

function MediaDropZone({
  id,
  label,
  compactLabel,
  hint,
  accept,
  file,
  onFile,
  emphasized,
  icon,
  className,
}: {
  id: string
  /** Main heading; omit when using only `compactLabel` inside a labeled section. */
  label?: string
  /** Shown when `label` is empty. */
  compactLabel?: string
  hint?: string
  accept: string
  file: File | null
  onFile: (f: File | null) => void
  emphasized?: boolean
  icon: React.ReactNode
  className?: string
}) {
  const heading = label?.trim() || compactLabel?.trim() || "Video file"
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null)

  const showVideoPreview =
    Boolean(file) && accept.includes("video") && Boolean(videoObjectUrl)

  useEffect(() => {
    if (!file || !accept.includes("video")) {
      setVideoObjectUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setVideoObjectUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [file, accept])

  return (
    <div
      className={cn(
        "relative rounded-xl border-2 border-dashed transition-colors",
        emphasized
          ? "border-primary/35 bg-primary/6 dark:bg-primary/10"
          : "border-border bg-muted/20",
        drag && "border-primary bg-primary/10",
        file && "border-solid border-border bg-card shadow-sm",
        className
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        const f = e.dataTransfer.files?.[0]
        if (f) onFile(f)
      }}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl",
              emphasized
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <Label
              htmlFor={id}
              className={cn(
                "cursor-pointer font-semibold",
                label?.trim() ? "text-base" : "text-sm"
              )}
            >
              {heading}
            </Label>
            {hint ? (
              <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
            ) : null}
            {file ? (
              <div className="mt-2 space-y-0.5">
                <p className="truncate text-sm font-medium text-foreground">
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Drag & drop or choose a file
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {file ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onFile(null)}
            >
              Remove
            </Button>
          ) : null}
          <Button
            type="button"
            variant={file ? "outline" : "default"}
            size="sm"
            className={cn(!file && emphasized && "shadow-sm")}
            onClick={() => inputRef.current?.click()}
          >
            {file ? "Replace" : "Choose file"}
          </Button>
        </div>
      </div>
      {showVideoPreview && videoObjectUrl ? (
        <div className="border-t border-border px-4 pb-4 sm:px-5">
          <p className="py-2 text-xs font-medium text-muted-foreground">
            Preview
          </p>
          <video
            key={videoObjectUrl}
            className="max-h-[min(50vh,28rem)] w-full rounded-lg bg-black object-contain shadow-inner"
            controls
            playsInline
            preload="metadata"
            src={videoObjectUrl}
          >
            Your browser cannot play this file in the preview.
          </video>
        </div>
      ) : null}
    </div>
  )
}

// Legacy single-thumbnail component intentionally removed in favor of MultiThumbnailSlot.

function MultiThumbnailSlot({
  inputId,
  emptyHint,
  files,
  onFiles,
}: {
  inputId: string
  emptyHint: string
  files: File[]
  onFiles: (files: File[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const key =
    files.length === 0
      ? ""
      : files.map((f) => `${f.name}-${f.size}-${f.lastModified}`).join("|")

  return (
    <div className="space-y-3">
      {files.length > 0 ? (
        <div
          key={key}
          className="grid grid-cols-2 gap-2 overflow-hidden rounded-xl border border-border bg-muted/20 p-2 sm:grid-cols-3"
        >
          {files.map((f, i) => (
            <div
              key={`${f.name}-${f.size}-${i}`}
              className="overflow-hidden rounded-lg border border-border bg-background"
            >
              <ReviewBlobImagePreview file={f} />
              <div className="flex items-center justify-between gap-2 p-1">
                <p className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                  {f.name}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-muted-foreground"
                  onClick={() => onFiles(files.filter((_, idx) => idx !== i))}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-muted-foreground/25 bg-muted/20 px-4 text-center text-sm text-muted-foreground">
          {emptyHint}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(ev) => {
            const list = ev.target.files ? Array.from(ev.target.files) : []
            if (list.length === 0) return
            onFiles([...files, ...list])
            if (inputRef.current) inputRef.current.value = ""
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          {files.length > 0 ? "Add more images" : "Upload images"}
        </Button>
        {files.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              onFiles([])
              if (inputRef.current) inputRef.current.value = ""
            }}
          >
            Clear all
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground self-center">
          {files.length} selected
        </span>
      </div>
    </div>
  )
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
