"use client"

import { useEffect, useMemo, useState, type RefObject } from "react"
import type { Editor } from "@tiptap/core"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
}: ScriptEditorCommentsSidebarProps) {
  const [filter, setFilter] = useState<FilterTab>("all")
  const [orderedIds, setOrderedIds] = useState<string[]>([])

  useEffect(() => {
    if (!editor) return
    const sync = () => setOrderedIds(collectFeedbackStickerIdsFromEditor(editor))
    sync()
    editor.on("transaction", sync)
    return () => {
      editor.off("transaction", sync)
    }
  }, [editor])

  const filteredIds = useMemo(() => {
    return orderedIds.filter((id) => {
      const s = feedbackStickers[id]
      const resolved = Boolean(s?.resolved)
      if (filter === "open") return !resolved
      if (filter === "resolved") return resolved
      return true
    })
  }, [orderedIds, feedbackStickers, filter])

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
        "flex h-full min-h-0 flex-col border-l border-border bg-muted/20",
        "w-full min-w-0 sm:max-w-[300px]"
      )}
      aria-label="Comments"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
          Comments
        </div>
        <Badge variant="secondary" className="tabular-nums text-[10px] font-normal">
          {orderedIds.length}
        </Badge>
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

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filteredIds.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
            <MessageSquare className="size-8 text-muted-foreground/40" aria-hidden />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {orderedIds.length === 0
                ? "No comments yet. Highlight text in the script to add one, or press ⌘⇧M (Mac) / Ctrl⇧M (Windows) at the cursor."
                : filter === "open"
                  ? "No open comments. Switch to All or Done."
                  : filter === "resolved"
                    ? "No resolved comments yet."
                    : "No comments match this filter."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredIds.map((id) => {
              const s = feedbackStickers[id]
              const ordinal = orderedIds.indexOf(id) + 1
              const resolved = Boolean(s?.resolved)
              const isSelected = selectedCommentId === id
              return (
                <li key={id}>
                  <div
                    className={cn(
                      "rounded-lg border bg-background p-2.5 text-left shadow-sm transition-colors",
                      isSelected && "border-primary/50 ring-1 ring-primary/20",
                      resolved && "opacity-75"
                    )}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => focusCommentInDoc(id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/10 px-1 text-[10px] font-bold text-primary">
                          {ordinal}
                        </span>
                        {resolved ? (
                          <span className="flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
                            <CheckCircle2 className="size-3 text-green-600" />
                            Resolved
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                            Open
                          </span>
                        )}
                      </div>
                      {s?.contextSnippet ? (
                        <p className="mt-1.5 line-clamp-2 border-l-2 border-muted-foreground/25 pl-2 text-[11px] italic text-muted-foreground">
                          “{s.contextSnippet}”
                        </p>
                      ) : null}
                      <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-foreground">
                        {s?.body?.trim() || (
                          <span className="text-muted-foreground">
                            No message text (sync from server when available).
                          </span>
                        )}
                      </p>
                      {s?.anchor ? (
                        <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
                          Chars {s.anchor.startOffset}–{s.anchor.endOffset} ({s.anchor.space})
                        </p>
                      ) : null}
                    </button>

                    {!readOnly && onFeedbackStickersChange ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border/60 pt-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          title={resolved ? "Reopen thread" : "Mark resolved"}
                          onClick={() => toggleResolved(id)}
                        >
                          {resolved ? (
                            <Circle className="mr-1 size-3.5" />
                          ) : (
                            <CheckCircle2 className="mr-1 size-3.5" />
                          )}
                          {resolved ? "Reopen" : "Resolve"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          title="Edit comment"
                          onClick={() => onRequestEditComment(id)}
                        >
                          <Pencil className="mr-1 size-3.5" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          title="Delete comment"
                          onClick={() => removeComment(id)}
                        >
                          <Trash2 className="mr-1 size-3.5" />
                          Delete
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
