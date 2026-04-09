/* eslint-disable react-hooks/set-state-in-effect */
"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  getPackageSpecialties,
  submitPackage,
  uploadPackageThumbnailFile,
  uploadPackageVideoFile,
} from "@/lib/packages-api"
import { optionalDoctorSpecialtyPayload } from "@/lib/package-specialty-label"
import type { FinalPackage, PackageSpecialtyOption } from "@/types/package"
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
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Info,
  Loader2,
  Package,
  Plus,
  Smartphone,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  EMPTY_VIDEO_META,
  MultiThumbnailSlot,
  PackageWizardChrome,
  ReviewCheck,
  ReviewSectionTitle,
  ReviewThumbnailBlock,
  ReviewVideoRow,
  ScriptContextCard,
  StepIntro,
  VideoDeliverableCard,
  WizardFooter,
  WIZARD_COLUMN,
  effectiveTagsFromMeta,
  isVideoMetaComplete,
  mergePackageTags,
  type PerVideoMeta,
} from "@/components/packages/agency-package-wizard-ui"
import { TagPillList } from "@/components/packages/tag-pill-list"

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
  const [specialties, setSpecialties] = useState<PackageSpecialtyOption[]>([])

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
    if (!token || !isAgency) return
    let cancelled = false
    void (async () => {
      try {
        const list = await getPackageSpecialties(token)
        if (!cancelled) setSpecialties(list)
      } catch {
        if (!cancelled) setSpecialties([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, isAgency])

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
              ...EMPTY_VIDEO_META,
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
              doctorName:
                typeof (s?.meta as { doctorName?: string })?.doctorName ===
                "string"
                  ? (s.meta as { doctorName: string }).doctorName
                  : "",
              specialty:
                typeof (s?.meta as { specialty?: string })?.specialty ===
                "string"
                  ? (s.meta as { specialty: string }).specialty
                  : "",
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
            ...optionalDoctorSpecialtyPayload(slot.meta),
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
        ...optionalDoctorSpecialtyPayload(first.meta),
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
          ...optionalDoctorSpecialtyPayload(slot.meta),
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
    <div className="flex min-h-full flex-1 flex-col bg-linear-to-b from-muted/30 to-background">
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
                    ? "Upload and describe each new deliverable here. Nothing is sent until the last step. Package name stays the same — rename it from the package page if needed. After submission, each deliverable shows a TAT progress bar while reviewers work (24h target per round)."
                    : "Add any number of videos — for each one, choose long- or short-form before uploading. Nothing is submitted until the final step. After submission, each deliverable shows a TAT progress bar while reviewers work (24h target per round)."}
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
                        specialties={specialties}
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
                  specialties={specialties}
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
  specialties = [],
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
  specialties?: PackageSpecialtyOption[]
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
                specialties={specialties}
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
            <TagPillList
              tags={mergedTags}
              emptyLabel={
                <span className="text-sm text-muted-foreground">—</span>
              }
            />
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
