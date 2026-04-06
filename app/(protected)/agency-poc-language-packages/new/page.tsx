/* eslint-disable react-hooks/set-state-in-effect */
"use client"

import {
  useCallback,
  useEffect,
  useMemo,
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
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuthStore } from "@/store"
import type { UserRole } from "@/types/auth"
import { getScript } from "@/lib/scripts-api"
import { getPackageByScriptId } from "@/lib/packages-api"
import {
  addLanguagePackageVideo,
  createLanguagePackage,
  getLanguagePackagesByScriptId,
  uploadLanguagePackageThumbnailFile,
  uploadLanguagePackageVideoFile,
} from "@/lib/language-packages-api"
import {
  englishFinalPackageHasApprovedVideo,
  isScriptLockedForLanguagePackages,
} from "@/lib/language-phase-gates"
import type { PackageLanguage } from "@/types/language-package"
import type { Script } from "@/types/script"
import {
  formatLanguageLabel,
  PHASE_7_CREATE_LANGUAGES,
} from "@/lib/language-package-ui"
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
import { ArrowLeft, Loader2, Languages, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const WIZARD_STEP_LABELS = [
  "Script context",
  "Videos",
  "Thumbnails",
  "Review & submit",
] as const

const WIZARD_STEP_COUNT = WIZARD_STEP_LABELS.length

type LanguageVideoSlot = {
  id: string
  meta: PerVideoMeta
  file: File | null
  thumbnailFiles: File[]
}

function createNewLanguageVideoSlot(): LanguageVideoSlot {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `lang-vid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    meta: { ...EMPTY_VIDEO_META },
    file: null,
    thumbnailFiles: [],
  }
}

export default function AgencyNewLanguagePackagePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const scriptId = (searchParams.get("scriptId") ?? "").trim()

  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const role = user?.role as UserRole | undefined
  const isAgency = role === "AGENCY_POC" || role === "SUPER_ADMIN"

  const [gateLoading, setGateLoading] = useState(true)
  const [gateError, setGateError] = useState<string | null>(null)
  const [scriptContext, setScriptContext] = useState<Script | null>(null)
  const [scriptExpanded, setScriptExpanded] = useState(false)
  const [existingLangs, setExistingLangs] = useState<string[]>([])

  const [wizardStep, setWizardStep] = useState(0)
  const [packageName, setPackageName] = useState("")
  const [language, setLanguage] = useState<PackageLanguage | "">("")
  const [videoSlots, setVideoSlots] = useState<LanguageVideoSlot[]>(() => [
    createNewLanguageVideoSlot(),
  ])
  const [submitting, setSubmitting] = useState(false)

  const languageOptions = useMemo(() => {
    const taken = new Set(existingLangs.map((l) => l.toUpperCase()))
    return PHASE_7_CREATE_LANGUAGES.filter((l) => !taken.has(l))
  }, [existingLangs])

  const mergedTags = useMemo(
    () =>
      mergePackageTags(
        ...videoSlots.map((s) => effectiveTagsFromMeta(s.meta))
      ),
    [videoSlots]
  )

  function addVideoSlot() {
    setVideoSlots((prev) => [...prev, createNewLanguageVideoSlot()])
  }

  function removeVideoSlot(id: string) {
    setVideoSlots((prev) => {
      if (prev.length <= 1) {
        toast.error("Keep at least one video in this language package.")
        return prev
      }
      return prev.filter((s) => s.id !== id)
    })
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
    setVideoSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, file } : s))
    )
  }

  const slotsMetaOk =
    videoSlots.length > 0 &&
    videoSlots.every((s) => isVideoMetaComplete(s.meta))
  const slotsFilesOk =
    videoSlots.length > 0 && videoSlots.every((s) => s.file != null)
  const metaAndFileReady = slotsMetaOk && slotsFilesOk

  const runGate = useCallback(async () => {
    if (!token || !isAgency || !scriptId) return
    setGateLoading(true)
    setGateError(null)
    try {
      const [scriptRes, engRes, langRes] = await Promise.all([
        getScript(token, scriptId),
        getPackageByScriptId(token, scriptId).catch(() => null),
        getLanguagePackagesByScriptId(token, scriptId),
      ])
      const sc = scriptRes.script
      if (!sc) {
        setGateError("Script not found.")
        return
      }
      if (!isScriptLockedForLanguagePackages(sc.status)) {
        setGateError("Script must be locked before creating language packages.")
        return
      }
      const eng = engRes?.package ?? null
      if (!englishFinalPackageHasApprovedVideo(eng)) {
        setGateError(
          "At least one English final-package video must be approved before Phase 7."
        )
        return
      }
      const englishLabel =
        eng?.name?.trim() ||
        eng?.title?.trim() ||
        sc.title?.trim() ||
        "Final package"
      setPackageName(englishLabel)
      setScriptContext(sc)
      setExistingLangs(
        (langRes.data ?? []).map((p) => String(p.language ?? "").toUpperCase())
      )
    } catch (e) {
      setGateError(e instanceof Error ? e.message : "Could not verify script.")
    } finally {
      setGateLoading(false)
    }
  }, [token, isAgency, scriptId])

  useEffect(() => {
    if (!isAgency) return
    if (!scriptId) {
      router.replace("/agency-poc-language-packages")
    }
  }, [isAgency, scriptId, router])

  useEffect(() => {
    runGate()
  }, [runGate])

  useEffect(() => {
    if (languageOptions.length === 1 && !language) {
      setLanguage(languageOptions[0])
    }
  }, [languageOptions, language])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [wizardStep])

  function canProceedFromStep(step: number): boolean {
    switch (step) {
      case 0:
        return Boolean(language && languageOptions.length > 0)
      case 1:
        return (
          videoSlots.length > 0 &&
          videoSlots.every(
            (s) => isVideoMetaComplete(s.meta) && Boolean(s.file)
          )
        )
      case 2:
        return true
      default:
        return false
    }
  }

  const canSubmitFinal = Boolean(
    packageName.trim() &&
      language &&
      metaAndFileReady &&
      mergedTags.length > 0 &&
      languageOptions.length > 0
  )

  const lastStepBlockedHint = !language
    ? "Select a language"
    : !metaAndFileReady
      ? "Complete each video’s metadata and file"
      : mergedTags.length === 0
        ? "Add at least one tag across your videos"
        : languageOptions.length === 0
          ? "No languages left for this script"
          : !packageName.trim()
            ? "English package name missing — refresh or contact support"
            : undefined

  async function performSubmit() {
    if (!token || !scriptId || !packageName.trim() || !language) {
      toast.error("Complete all steps before submitting.")
      return
    }
    if (videoSlots.length < 1) {
      toast.error("Add at least one video.")
      return
    }
    const incomplete = videoSlots.some(
      (s) => !isVideoMetaComplete(s.meta) || !s.file
    )
    if (incomplete) {
      toast.error(
        "Each video needs a file, title, description, and at least one tag."
      )
      return
    }
    if (mergedTags.length === 0) {
      toast.error("Add tags for your videos.")
      return
    }
    setSubmitting(true)
    try {
      const uploadedVideos = await Promise.all(
        videoSlots.map((s) => uploadLanguagePackageVideoFile(token, s.file!))
      )
      const uploadedThumbsBySlot = await Promise.all(
        videoSlots.map(async (s) => {
          const list = s.thumbnailFiles ?? []
          if (list.length === 0) return []
          return await Promise.all(
            list.map((f) => uploadLanguagePackageThumbnailFile(token, f))
          )
        })
      )

      const first = videoSlots[0]!
      const firstVid = uploadedVideos[0]!
      const firstThumbs = uploadedThumbsBySlot[0] ?? []
      const res = await createLanguagePackage(token, {
        scriptId,
        name: packageName.trim(),
        language,
        video: {
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
        },
      })
      const packageId = res.data.id
      for (let i = 1; i < videoSlots.length; i += 1) {
        const slot = videoSlots[i]!
        const vid = uploadedVideos[i]!
        const thumbs = uploadedThumbsBySlot[i] ?? []
        await addLanguagePackageVideo(token, packageId, {
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
        res.message ??
          (videoSlots.length === 1
            ? "Language package created"
            : `Language package created with ${videoSlots.length} videos`),
        {
          description:
            "Each video starts its own Content/Brand review for this language.",
        }
      )
      router.push(`/agency-poc-language-packages/${packageId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed")
    } finally {
      setSubmitting(false)
    }
  }

  function preventImplicitFormSubmit(e: React.FormEvent) {
    e.preventDefault()
  }

  if (!isAgency) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">
          Only Agency POC or Super Admin can submit language packages.
        </p>
        <Button variant="link" asChild className="mt-2 pl-0">
          <Link href="/agency-poc-language-packages">Back</Link>
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

  if (gateError || !scriptContext) {
    return (
      <div className="p-6 md:p-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link href="/agency-poc-language-packages">
              <ArrowLeft className="mr-1 size-4" />
              Back to Language packages
            </Link>
          </Button>
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base">Cannot submit here</CardTitle>
              <CardDescription>{gateError ?? "Unknown error"}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/agency-poc-language-packages">
                  View eligible scripts
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const sc = scriptContext

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
              <Link href="/agency-poc-language-packages">
                <ArrowLeft className="mr-1 size-4" />
                Language packages
              </Link>
            </Button>

            <header className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Languages className="size-6" />
                </div>
                <Badge variant="secondary" className="font-normal">
                  Phase 7 · Language package
                </Badge>
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Submit language package
                </h1>
                <p className="mt-3 max-w-prose text-base leading-relaxed text-muted-foreground">
                  Add one or more localized videos for the chosen language — same
                  pattern as Phase 6 final package. Nothing is sent until the
                  final step. Thumbnails are optional and shown to reviewers for
                  reference. Each video gets its own approve/reject queue.
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

            <div
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3.5 sm:px-5",
                language
                  ? "border-primary/35 bg-primary/10 shadow-sm ring-1 ring-primary/15"
                  : "border-border bg-muted/40 text-muted-foreground"
              )}
              role="status"
              aria-live="polite"
            >
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-lg",
                  language ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                <Languages className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {language
                    ? "Uploading package for"
                    : "Target language — not selected yet"}
                </p>
                {language ? (
                  <p className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">
                    {formatLanguageLabel(language)}
                    <span className="ml-2 font-mono text-sm font-medium text-muted-foreground">
                      {language}
                    </span>
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm leading-snug">
                    Pick a language below on this step. It stays visible here on
                    every step while you add videos and thumbnails.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="min-h-[min(52vh,560px)] w-full flex-1">
            {wizardStep === 0 && (
              <div className="w-full space-y-8 py-4">
                <StepIntro
                  title="Confirm script context"
                  body="You’re submitting a localized package for this locked script. Expand the script body if you need to double-check claims before uploading."
                />
                <ScriptContextCard
                  className="shadow-lg"
                  script={sc}
                  scriptId={scriptId}
                  expanded={scriptExpanded}
                  onToggleExpand={() => setScriptExpanded((v) => !v)}
                  showWorkspaceLink={user?.role === "AGENCY_POC"}
                />

                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-base">
                      Package name (from Phase 6)
                    </CardTitle>
                    <CardDescription>
                      Reuses the English final package name for this script so
                      lists stay consistent. You only choose the language below;
                      the localized video title is on the next step.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-medium text-foreground">
                      {packageName.trim() || "—"}
                    </p>
                  </CardContent>
                </Card>

                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-base">Language</CardTitle>
                    <CardDescription>
                      One package per target language for this script. Already
                      added languages are hidden from the list.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Label>Localized language</Label>
                    <Select
                      value={language}
                      onValueChange={(v) => setLanguage(v as PackageLanguage)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        {languageOptions.map((l) => (
                          <SelectItem key={l} value={l}>
                            {formatLanguageLabel(l)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {languageOptions.length === 0 ? (
                      <p className="text-sm text-amber-600 dark:text-amber-400">
                        All six target languages already have a package for this
                        script. Open an existing package to add videos.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            )}

            {wizardStep === 1 && (
              <div className="w-full space-y-10 py-4">
                <StepIntro
                  title="Videos"
                  body="For each localized deliverable, add metadata and the video file. You can add as many as you need (long-form, shorts, cut-downs, etc.); each is submitted in one go and starts its own Brand review."
                />
                <div className="space-y-12">
                  {videoSlots.map((slot, index) => (
                    <div key={slot.id} className="space-y-4">
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-muted-foreground"
                          onClick={() => removeVideoSlot(slot.id)}
                        >
                          <Trash2 className="size-3.5" />
                          Remove video
                        </Button>
                      </div>
                      <VideoDeliverableCard
                        badge={
                          language
                            ? `${formatLanguageLabel(language)} · Video ${index + 1} of ${videoSlots.length}`
                            : `Video ${index + 1} of ${videoSlots.length}`
                        }
                        heading="Listing text and encoded file for this cut"
                        subheading="Reviewers read this title and description next to the file you upload. Use the language selected above; match how this version should appear when it goes live."
                        incompleteMetaHint="Still needed: title, description, at least one tag, and the video file."
                        meta={slot.meta}
                        onMetaChange={(action) =>
                          patchSlotMeta(slot.id, action)
                        }
                        file={slot.file}
                        onFile={(f) => setSlotFile(slot.id, f)}
                        dropId={`lang-pkg-video-${slot.id}`}
                        emphasized={index === 0}
                        icon={<Languages className="size-5" />}
                        idPrefix={`lang-v-${slot.id}`}
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
                  title="Thumbnails (optional, per video)"
                  body="Upload images per video if you have them. Zero thumbnails is valid. Reviewers see them for context; Content/Brand approves or rejects the whole video only."
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
                            Thumbnails · {index + 1}
                          </Badge>
                          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Optional
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
                          inputId={`lang-pkg-thumbs-${slot.id}`}
                          emptyHint="Optional — upload one or more images (16:9 recommended), or continue without"
                          files={slot.thumbnailFiles ?? []}
                          onFiles={(files) =>
                            setVideoSlots((prev) =>
                              prev.map((s) =>
                                s.id === slot.id
                                  ? { ...s, thumbnailFiles: files }
                                  : s
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
                  body="Check the summary below. Submit creates the language package and queues each video for Content/Brand review on its own timeline."
                />
                <LanguagePackageReviewSummary
                  packageName={packageName}
                  language={language}
                  languageLabel={
                    language ? formatLanguageLabel(language) : "—"
                  }
                  videoSlots={videoSlots}
                  mergedTags={mergedTags}
                  metaAndFileOk={metaAndFileReady}
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
            videoSlots.length > 1
              ? `Submit language package (${videoSlots.length} videos)`
              : "Submit language package"
          }
          exitHref="/agency-poc-language-packages"
          exitLabel="Exit to list"
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

function LanguagePackageReviewSummary({
  packageName,
  language,
  languageLabel,
  videoSlots,
  mergedTags,
  metaAndFileOk,
}: {
  packageName: string
  language: string
  languageLabel: string
  videoSlots: LanguageVideoSlot[]
  mergedTags: string[]
  metaAndFileOk: boolean
}) {
  const thumbsOk = true
  const totalThumbs = videoSlots.reduce(
    (n, s) => n + (s.thumbnailFiles?.length ?? 0),
    0
  )
  return (
    <Card className="overflow-hidden border-0 shadow-lg ring-1 ring-border/60">
      <CardHeader className="border-b border-border bg-muted/30 px-5 py-7 sm:px-8 sm:py-8">
        <CardTitle className="text-lg">Package summary</CardTitle>
        <CardDescription className="mt-2 max-w-prose">
          The package <code className="text-xs">name</code> matches your English
          final package. <code className="text-xs">language</code> identifies
          this localized container. Each video has its own title, description,
          tags, and optional thumbnails. Previews below are local until you
          submit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-12 bg-muted/5 px-5 py-8 sm:px-8 sm:py-10">
        <div className="space-y-4">
          <ReviewSectionTitle>Package name</ReviewSectionTitle>
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
            <p className="text-sm font-medium text-foreground">
              {packageName.trim() || "—"}
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <ReviewSectionTitle>Language</ReviewSectionTitle>
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
            <p className="text-sm font-medium text-foreground">
              {language ? languageLabel : "—"}
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <ReviewSectionTitle>
            Videos ({videoSlots.length})
          </ReviewSectionTitle>
          <ul className="flex flex-col gap-6">
            {videoSlots.map((slot, index) => (
              <ReviewVideoRow
                key={slot.id}
                label={
                  language
                    ? `${languageLabel} · Video ${index + 1} of ${videoSlots.length}`
                    : `Video ${index + 1} of ${videoSlots.length}`
                }
                meta={slot.meta}
                file={slot.file}
                ok={
                  metaAndFileOk &&
                  isVideoMetaComplete(slot.meta) &&
                  Boolean(slot.file)
                }
              />
            ))}
          </ul>
        </div>
        <div className="space-y-4 border-t border-border pt-10">
          <ReviewSectionTitle>Thumbnails ({totalThumbs} total)</ReviewSectionTitle>
          <ul className="flex flex-col gap-6">
            {videoSlots.map((slot, index) => (
              <ReviewThumbnailBlock
                key={slot.id}
                index={index + 1}
                targetLabel={`Video ${index + 1}`}
                videoTitle={slot.meta.title.trim() || "—"}
                files={slot.thumbnailFiles ?? []}
                ok={thumbsOk}
              />
            ))}
          </ul>
          {totalThumbs === 0 ? (
            <p className="text-sm text-muted-foreground">
              No thumbnails — allowed for Phase 7.
            </p>
          ) : null}
        </div>
        <div className="space-y-4 border-t border-border pt-10">
          <ReviewSectionTitle>
            Tags ({mergedTags.length})
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
            <ReviewCheck
              ok={packageName.trim().length > 0}
              text="Package name from English final package"
            />
            <ReviewCheck
              ok={Boolean(language)}
              text="Language selected"
            />
            <ReviewCheck
              ok={metaAndFileOk}
              text="Every video has title, description, tags, and file"
            />
            <ReviewCheck
              ok={mergedTags.length > 0}
              text="At least one tag across videos"
            />
            <ReviewCheck
              ok={thumbsOk}
              text="Thumbnails step reviewed (optional — zero is OK)"
            />
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
