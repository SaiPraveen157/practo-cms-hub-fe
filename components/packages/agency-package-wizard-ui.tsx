"use client"

/**
 * Shared multi-step wizard UI for Agency package submission flows
 * (Phase 6 final package + Phase 7 language packages).
 */

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"
import Link from "next/link"
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
import type { Script } from "@/types/script"
import { getScriptDisplayInfo } from "@/lib/script-status-styles"
import {
  getAuthorDisplayName,
  getRelativeTime,
  getWordCountFromHtml,
} from "@/lib/script-card-utils"
import { formatPackageDate } from "@/lib/package-ui"
import {
  TagPillList,
  TAG_PILL_BADGE_CLASS,
} from "@/components/packages/tag-pill-list"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DELIVERABLE_VIDEO_INPUT_ACCEPT } from "@/lib/video-file-validation"

export const WIZARD_COLUMN =
  "mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8"

export type PerVideoMeta = {
  title: string
  description: string
  tags: string[]
  tagDraft?: string
}

export const EMPTY_VIDEO_META: PerVideoMeta = {
  title: "",
  description: "",
  tags: [],
  tagDraft: "",
}

export function mergePackageTags(...groups: string[][]): string[] {
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

export function parseCommaSeparatedTagPieces(input: string): string[] {
  return input
    .split(/[,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

export function mergeUniqueTagStrings(
  existing: string[],
  pieces: string[]
): string[] {
  const next = [...existing]
  for (const p of pieces) {
    const lower = p.toLowerCase()
    if (next.some((x) => x.toLowerCase() === lower)) continue
    next.push(p)
  }
  return next
}

export function effectiveTagsFromMeta(m: PerVideoMeta): string[] {
  const pieces = parseCommaSeparatedTagPieces(m.tagDraft ?? "")
  return mergeUniqueTagStrings(m.tags, pieces)
}

export function isVideoMetaComplete(m: PerVideoMeta): boolean {
  return Boolean(
    m.title.trim() &&
      m.description.trim() &&
      effectiveTagsFromMeta(m).length > 0
  )
}

export function PackageWizardChrome({
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

export function StepIntro({ title, body }: { title: string; body: string }) {
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

export function WizardFooter({
  wizardStep,
  stepCount,
  canProceed,
  allReady,
  lastStepBlockedHint,
  submitting,
  confirmLabel = "Submit final package",
  exitHref = "/agency-poc-packages",
  exitLabel = "Exit to list",
  onBack,
  onContinue,
  onConfirmSubmit,
}: {
  wizardStep: number
  stepCount: number
  canProceed: boolean
  allReady: boolean
  lastStepBlockedHint?: string
  submitting: boolean
  confirmLabel?: string
  exitHref?: string
  exitLabel?: string
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
            <Link href={exitHref}>{exitLabel}</Link>
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

export const REVIEW_PREVIEW_MAX = "mx-auto w-full max-w-2xl"

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function ReviewBlobVideoPreview({ file }: { file: File | null }) {
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

export function ReviewBlobImagePreview({ file }: { file: File | null }) {
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

export function ReviewSectionTitle({ children }: { children: ReactNode }) {
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

export function ReviewCheck({
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

export function ReviewVideoRow({
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
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Tags</p>
            <TagPillList
              tags={reviewTags}
              emptyLabel={
                <span className="text-xs text-muted-foreground">—</span>
              }
            />
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

export function ReviewThumbnailBlock({
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
                className={cn(
                  TAG_PILL_BADGE_CLASS,
                  "h-8 max-w-full gap-1 py-0 pr-1 pl-3"
                )}
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

export function VideoDeliverableCard({
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
  incompleteMetaHint = "Title, description & tags required",
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
  spacious?: boolean
  /** Shown next to the badge until title, description, tags, and file are ready (Phase 7 can pass clearer copy). */
  incompleteMetaHint?: string
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
              {incompleteMetaHint}
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
            accept={DELIVERABLE_VIDEO_INPUT_ACCEPT}
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

export function ScriptContextCard({
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
      <CardHeader className="space-y-4 border-b border-border bg-linear-to-br from-primary/5 via-background to-background px-6 py-8 sm:px-8 sm:py-10">
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

export function MediaDropZone({
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
  label?: string
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

export function MultiThumbnailSlot({
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
