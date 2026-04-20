"use client"

import type { Dispatch, SetStateAction } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TagPillList } from "@/components/packages/tag-pill-list"
import type { PackageVideo } from "@/types/package"
import type { VideoComment } from "@/types/video"
import { getCurrentVideoAsset, thumbnailsOnAsset } from "@/lib/package-video-helpers"
import { formatVideoTimestamp } from "@/lib/video-timestamp"
import { Loader2, XCircle } from "lucide-react"

export type ApproverP6FieldState = { flag: boolean; comment: string }
export type ApproverP6ThumbRow = { reject: boolean; comment: string }

export type ApproverP6RejectDraft = {
  overallComments: string
  video: ApproverP6FieldState
  title: ApproverP6FieldState
  description: ApproverP6FieldState
  tags: ApproverP6FieldState
  thumbs: Record<string, ApproverP6ThumbRow>
}

export function emptyApproverP6RejectDraft(
  video?: PackageVideo | null
): ApproverP6RejectDraft {
  const asset = video ? getCurrentVideoAsset(video) : undefined
  const thumbs: Record<string, ApproverP6ThumbRow> = {}
  for (const t of thumbnailsOnAsset(asset)) {
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

export function PackageVideoApproverRejectDialogBody({
  video,
  deliverableLabel,
  draft,
  setDraft,
  timelineComments,
  timelineLoading,
  onCancel,
  onSubmit,
  isPending,
}: {
  video: PackageVideo
  deliverableLabel: string
  draft: ApproverP6RejectDraft
  setDraft: Dispatch<SetStateAction<ApproverP6RejectDraft>>
  timelineComments: VideoComment[]
  timelineLoading: boolean
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
        <DialogTitle>Reject deliverable</DialogTitle>
        <DialogDescription>
          <span className="font-medium text-foreground">{deliverableLabel}</span>{" "}
          — Rejection sends this video back to Medical &amp; Brand review (both
          tracks reset). Review timestamp comments, then flag issues or use the
          summary. At least one itemized comment or a fallback from timestamps /
          overall summary is required.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-6">
          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Video — timestamp comments (this version)
            </p>
            {timelineLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 shrink-0 animate-spin" />
                Loading comments…
              </p>
            ) : timelineComments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No timestamp comments on this version yet. Add them on the video
                player, or use the sections below.
              </p>
            ) : (
              <ul className="max-h-[min(12rem,40vh)] space-y-3 overflow-y-auto pr-1">
                {timelineComments.map((c) => {
                  const ts = c.timestampSeconds
                  const label =
                    ts != null && Number.isFinite(ts)
                      ? formatVideoTimestamp(ts)
                      : "—"
                  const author =
                    c.author &&
                    `${c.author.firstName ?? ""} ${c.author.lastName ?? ""}`.trim()
                  return (
                    <li
                      key={c.id}
                      className="rounded-md border border-border bg-background p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {label}
                        </span>
                        {author ? <span>{author}</span> : null}
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-foreground">
                        {c.content}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="p6-approver-reject-overall">
              Overall summary (optional)
            </Label>
            <Textarea
              id="p6-approver-reject-overall"
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
                <span className="text-sm font-medium">Video / playback</span>
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
                    placeholder="What should change in the video file?"
                    className="resize-y text-sm"
                  />
                ) : null}
              </div>
            </label>
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Metadata
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
                <p className="line-clamp-3 text-xs text-muted-foreground">
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
                <p className="line-clamp-4 text-xs whitespace-pre-wrap text-muted-foreground">
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

          {thumbs.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Thumbnails
              </p>
              <p className="text-xs text-muted-foreground">
                Flag thumbnails that should be redone and add a comment for each.
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
                                      ? (d.thumbs[t.id]?.comment ?? "")
                                      : "",
                                  },
                                },
                              }))
                            }
                            className="size-4 shrink-0 rounded border-input"
                          />
                          Flag thumbnail
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
          Reject &amp; send back
        </Button>
      </DialogFooter>
    </>
  )
}
