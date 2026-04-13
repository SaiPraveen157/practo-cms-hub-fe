"use client"

import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import type { Editor } from "@tiptap/core"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  collectFeedbackStickerIdsFromEditor,
  FEEDBACK_STICKER_NODE,
  scrollCommentAnchorIntoView,
} from "@/lib/feedback-sticker-doc"
import type { ScriptFeedbackSticker } from "@/types/script"
import {
  CheckCircle2,
  Circle,
  MessageSquare,
  Pencil,
  Trash2,
} from "lucide-react"

type FilterTab = "all" | "open" | "resolved"

export interface ScriptEditorCommentsSidebarProps {
  editor: Editor | null
  feedbackStickers: Record<string, ScriptFeedbackSticker>
  onFeedbackStickersChange?: (next: Record<string, ScriptFeedbackSticker>) => void
  readOnly: boolean
  selectedCommentId: string | null
  onSelectComment: (id: string | null) => void
  onRequestEditComment: (id: string) => void
  /** Element wrapping the editor content (for scroll-into-view of anchors). */
  editorScrollRootRef: RefObject<HTMLElement | null>
  /** Logged-in user id — used to show “You” when `author` is not yet loaded but `authorId` matches. */
  currentUserId?: string | null
  /**
   * Shown when there are no comment threads (`feedbackStickers` empty and no list items).
   * Defaults to a short “no comments” line; use the long hint when reviewers can add the first comment.
   */
  emptyListHint?: string
}

function formatCommentCreator(
  s: ScriptFeedbackSticker | undefined,
  currentUserId: string | null | undefined
): string {
  if (!s) return "Unknown"
  if (s.author) {
    const name = `${s.author.firstName} ${s.author.lastName}`.trim() || "Unknown"
    const role =
      s.author.role === "CONTENT_BRAND"
        ? "Brand"
        : s.author.role === "MEDICAL_AFFAIRS"
          ? "Medical"
          : s.author.role === "SUPER_ADMIN"
            ? "Admin"
            : s.author.role
    return role ? `${name} · ${role}` : name
  }
  if (s.authorId && currentUserId && s.authorId === currentUserId) {
    return "You"
  }
  if (s.authorId) {
    return "Reviewer"
  }
  return "Unknown"
}

export function ScriptEditorCommentsSidebar({
  editor,
  feedbackStickers,
  onFeedbackStickersChange,
  readOnly,
  selectedCommentId,
  onSelectComment,
  onRequestEditComment,
  editorScrollRootRef,
  currentUserId = null,
  emptyListHint,
}: ScriptEditorCommentsSidebarProps) {
  const [filter, setFilter] = useState<FilterTab>("all")
  /** Bumps when the ProseMirror doc changes so we re-merge doc order with `feedbackStickers`. */
  const [docTick, setDocTick] = useState(0)
  const listScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!editor) return
    const bump = () => setDocTick((t) => t + 1)
    bump()
    editor.on("transaction", bump)
    return () => {
      editor.off("transaction", bump)
    }
  }, [editor])

  const orderedIds = useMemo(() => {
    const fromDoc = editor
      ? collectFeedbackStickerIdsFromEditor(editor)
      : []
    const sortedFromState = Object.keys(feedbackStickers).sort((a, b) => {
      const sa = feedbackStickers[a]?.anchor?.startOffset ?? 0
      const sb = feedbackStickers[b]?.anchor?.startOffset ?? 0
      if (sa !== sb) return sa - sb
      return (feedbackStickers[a]?.createdAt ?? "").localeCompare(
        feedbackStickers[b]?.createdAt ?? ""
      )
    })
    const seen = new Set<string>()
    const out: string[] = []
    for (const id of fromDoc) {
      // Skip orphan marker ids (e.g. stale doc nodes when GET /comments returned []).
      if (!feedbackStickers[id]) continue
      if (!seen.has(id)) {
        seen.add(id)
        out.push(id)
      }
    }
    for (const id of sortedFromState) {
      if (!seen.has(id)) {
        seen.add(id)
        out.push(id)
      }
    }
    return out
  }, [editor, docTick, feedbackStickers])

  const filteredIds = useMemo(() => {
    return orderedIds.filter((id) => {
      const s = feedbackStickers[id]
      const resolved = Boolean(s?.resolved)
      if (filter === "open") return !resolved
      if (filter === "resolved") return resolved
      return true
    })
  }, [orderedIds, feedbackStickers, filter])

  useEffect(() => {
    if (!selectedCommentId || !listScrollRef.current) return
    const safe =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(selectedCommentId)
        : selectedCommentId.replace(/["\\]/g, "")
    const card = listScrollRef.current.querySelector(
      `[data-comment-thread="${safe}"]`
    )
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [selectedCommentId])

  function focusCommentInDoc(id: string) {
    onSelectComment(id)
    requestAnimationFrame(() => {
      scrollCommentAnchorIntoView(editorScrollRootRef.current, id)
    })
  }

  function toggleResolved(id: string) {
    if (!onFeedbackStickersChange || readOnly) return
    const cur = feedbackStickers[id]
    if (!cur) return
    onFeedbackStickersChange({
      ...feedbackStickers,
      [id]: { ...cur, id, resolved: !cur.resolved },
    })
  }

  function removeComment(id: string) {
    if (!onFeedbackStickersChange || readOnly || !editor) return
    let from = -1
    let to = -1
    editor.state.doc.descendants((node, pos) => {
      if (
        node.type.name === FEEDBACK_STICKER_NODE &&
        String(node.attrs.feedbackId) === id
      ) {
        from = pos
        to = pos + node.nodeSize
        return false
      }
      return true
    })
    if (from >= 0) {
      editor.chain().focus().deleteRange({ from, to }).run()
    }
    const next = { ...feedbackStickers }
    delete next[id]
    onFeedbackStickersChange(next)
    if (selectedCommentId === id) onSelectComment(null)
  }

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-muted/20",
        "w-full min-w-0 shrink-0 sm:max-w-[300px]",
        "lg:self-stretch"
      )}
      aria-label="Comments"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
          Comments
        </div>
        {orderedIds.length > 0 ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {orderedIds.length}
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-0.5 border-b border-border p-1.5">
        <Button
          type="button"
          variant={filter === "all" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 flex-1 text-xs"
          onClick={() => setFilter("all")}
        >
          All
        </Button>
        <Button
          type="button"
          variant={filter === "open" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 flex-1 text-xs"
          onClick={() => setFilter("open")}
        >
          Open
        </Button>
        <Button
          type="button"
          variant={filter === "resolved" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 flex-1 text-xs"
          onClick={() => setFilter("resolved")}
        >
          Done
        </Button>
      </div>

      <div
        ref={listScrollRef}
        role="region"
        aria-label="Comment threads"
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain p-2",
          /* ~3 cards tall; further comments scroll inside this region only */
          "max-h-[min(28rem,52vh)]"
        )}
      >
        {filteredIds.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
            <MessageSquare className="size-8 text-muted-foreground/40" aria-hidden />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {orderedIds.length === 0
                ? emptyListHint ??
                  (!readOnly && onFeedbackStickersChange
                    ? "Select text (optional), click the message button in the toolbar, or use ⌘⇧M / Ctrl⇧M at the cursor."
                    : "No comments available.")
                : filter === "open"
                  ? "No open comments."
                  : filter === "resolved"
                    ? "No resolved comments yet."
                    : "Nothing matches this filter."}
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {filteredIds.map((id) => {
              const s = feedbackStickers[id]
              if (!s) return null
              const resolved = Boolean(s?.resolved)
              const isSelected = selectedCommentId === id
              const bodyText = s?.body?.trim()
              const creator = formatCommentCreator(s, currentUserId)

              return (
                <li key={id} data-comment-thread={id}>
                  <div
                    className={cn(
                      "rounded-md border border-border/80 bg-background px-2.5 py-2 text-left transition-colors",
                      isSelected && "border-primary/40 bg-muted/40",
                      resolved && "opacity-70"
                    )}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => focusCommentInDoc(id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-[11px] leading-snug text-muted-foreground">
                          <span className="font-medium text-foreground/85">
                            By{" "}
                          </span>
                          <span className="text-foreground/90">{creator}</span>
                        </p>
                        {resolved ? (
                          <CheckCircle2
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-label="Resolved"
                          />
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-sm leading-snug text-foreground line-clamp-4">
                        {bodyText || (
                          <span className="text-muted-foreground">No comment text.</span>
                        )}
                      </p>
                      {s?.contextSnippet ? (
                        <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">
                          “{s.contextSnippet}”
                        </p>
                      ) : null}
                    </button>

                    {!readOnly && onFeedbackStickersChange ? (
                      <div className="mt-2 flex justify-end gap-0.5 border-t border-border/50 pt-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          title={resolved ? "Reopen" : "Resolve"}
                          aria-label={resolved ? "Reopen thread" : "Mark resolved"}
                          onClick={() => toggleResolved(id)}
                        >
                          {resolved ? (
                            <Circle className="size-4" />
                          ) : (
                            <CheckCircle2 className="size-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          title="Edit"
                          aria-label="Edit comment"
                          onClick={() => onRequestEditComment(id)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          title="Delete"
                          aria-label="Delete comment"
                          onClick={() => removeComment(id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
