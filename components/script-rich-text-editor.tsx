"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import type { EditorView } from "@tiptap/pm/view"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import TextAlign from "@tiptap/extension-text-align"
import Underline from "@tiptap/extension-underline"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  Undo2,
  Redo2,
  Pilcrow,
  List,
  ListOrdered,
} from "lucide-react"
import {
  FeedbackSticker,
  type FeedbackStickerExtensionOptions,
} from "@/components/tiptap/feedback-sticker-extension"
import {
  collectFeedbackStickerIdsFromEditor,
  FEEDBACK_STICKER_NODE,
} from "@/lib/feedback-sticker-doc"
import type { ScriptCommentAnchor, ScriptFeedbackSticker } from "@/types/script"
import { ScriptEditorCommentsSidebar } from "@/components/script-editor-comments-sidebar"
import {
  commentAnchorFromEditorSelection,
  commentAnchorOffsetsFromEditorState,
} from "@/lib/script-comment-offsets"

export interface ScriptRichTextEditorProps {
  /** Initial HTML content (used on mount and when id changes). */
  initialContent?: string
  /** Called when content changes (HTML string). */
  onChange?: (html: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Min height of the editable area (default 240px). */
  minHeight?: string
  /** Map of sticker id → stored feedback (persisted separately from HTML). */
  feedbackStickers?: Record<string, ScriptFeedbackSticker>
  /** When the document or sticker map should change (prune removed stickers, add via dialog). */
  onFeedbackStickersChange?: (next: Record<string, ScriptFeedbackSticker>) => void
  /** Enables inline comments: highlight text to post, or ⌘⇧M / Ctrl⇧M at cursor. No toolbar button. */
  feedbackStickerToolbar?: boolean
  /** Thread list beside the document (Comments-style). Shown when toolbar comments mode is on, or set explicitly (e.g. read-only review). */
  feedbackCommentsSidebar?: boolean
  /** Set on new stickers as `authorId` when saving. */
  feedbackStickerAuthorId?: string | null
}

function getBaseExtensions(placeholderText: string) {
  return [
    StarterKit,
    Underline,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { class: "text-primary underline underline-offset-2" },
    }),
    Placeholder.configure({ placeholder: placeholderText }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
  ]
}

function pruneStickersNotInDoc(
  editor: Editor,
  current: Record<string, ScriptFeedbackSticker>
): Record<string, ScriptFeedbackSticker> | null {
  const inDoc = new Set(collectFeedbackStickerIdsFromEditor(editor))
  let next = current
  let changed = false
  for (const id of Object.keys(current)) {
    if (!inDoc.has(id)) {
      if (!changed) {
        next = { ...current }
        changed = true
      }
      delete next[id]
    }
  }
  return changed ? next : null
}

function deleteFeedbackStickerNode(editor: Editor, feedbackId: string): boolean {
  let from = -1
  let to = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === FEEDBACK_STICKER_NODE && String(node.attrs.feedbackId) === feedbackId) {
      from = pos
      to = pos + node.nodeSize
      return false
    }
    return true
  })
  if (from < 0) return false
  editor.chain().focus().deleteRange({ from, to }).run()
  return true
}

export function ScriptRichTextEditor({
  initialContent = "",
  onChange,
  placeholder = "Enter the full script content…",
  disabled = false,
  className,
  minHeight = "240px",
  feedbackStickers,
  onFeedbackStickersChange,
  feedbackStickerToolbar = false,
  feedbackCommentsSidebar,
  feedbackStickerAuthorId,
}: ScriptRichTextEditorProps) {
  const stickersRef = useRef<Record<string, ScriptFeedbackSticker>>({})
  const onOpenDetailRef = useRef<(id: string) => void>(() => {})
  const editorShellRef = useRef<HTMLDivElement | null>(null)
  const [detailStickerId, setDetailStickerId] = useState<string | null>(null)
  const [editDetailBody, setEditDetailBody] = useState("")
  const [addStickerOpen, setAddStickerOpen] = useState(false)
  const [newStickerBody, setNewStickerBody] = useState("")
  const [pendingContextSnippet, setPendingContextSnippet] = useState("")
  const [pendingCommentAnchor, setPendingCommentAnchor] =
    useState<ScriptCommentAnchor | null>(null)
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null)

  const showStickerTools =
    feedbackStickerToolbar && !disabled && !!onFeedbackStickersChange

  const showCommentsSidebar =
    feedbackCommentsSidebar === false
      ? false
      : feedbackCommentsSidebar === true || showStickerTools

  const showStickerToolsRef = useRef(false)
  const onFeedbackStickersChangeRef = useRef(onFeedbackStickersChange)
  const addStickerOpenRef = useRef(false)
  const disabledRef = useRef(disabled)
  const selectionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<Editor | null>(null)

  useLayoutEffect(() => {
    showStickerToolsRef.current = showStickerTools
    onFeedbackStickersChangeRef.current = onFeedbackStickersChange
    addStickerOpenRef.current = addStickerOpen
    disabledRef.current = disabled
  }, [showStickerTools, onFeedbackStickersChange, addStickerOpen, disabled])

  useLayoutEffect(() => {
    stickersRef.current = feedbackStickers ?? {}
  }, [feedbackStickers])

  useLayoutEffect(() => {
    onOpenDetailRef.current = (id: string) => {
      setDetailStickerId(id)
      setSelectedCommentId(id)
      setEditDetailBody((feedbackStickers ?? {})[id]?.body ?? "")
    }
  }, [feedbackStickers])

  const stickerExtOptions = useMemo<FeedbackStickerExtensionOptions>(
    () => ({
      getStickers: () => stickersRef.current,
      onOpenDetail: (id) => onOpenDetailRef.current(id),
    }),
    []
  )

  const extensions = useMemo(() => {
    return [
      ...getBaseExtensions(placeholder),
      // eslint-disable-next-line react-hooks/refs -- options read refs only inside TipTap / ProseMirror callbacks
      FeedbackSticker.configure(stickerExtOptions),
    ]
  }, [placeholder, stickerExtOptions])

  const commentEditorProps = useMemo(
    () => ({
      attributes: {
        class:
          "min-h-[200px] focus:outline-none px-3 py-2 text-sm leading-relaxed [&_p]:mb-2 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-primary [&_a]:underline",
      },
      handleDOMEvents: {
        mouseup(view: EditorView) {
          queueMicrotask(() => {
            if (
              !showStickerToolsRef.current ||
              !onFeedbackStickersChangeRef.current ||
              addStickerOpenRef.current ||
              disabledRef.current
            )
              return
            const { from, to } = view.state.selection
            if (from >= to) return
            const snippet = view.state.doc.textBetween(from, to, " ").slice(0, 160).trim()
            if (!snippet) return
            if (selectionDebounceRef.current) {
              clearTimeout(selectionDebounceRef.current)
              selectionDebounceRef.current = null
            }
            setPendingContextSnippet(snippet)
            setPendingCommentAnchor({
              space: "plain_text_utf16",
              ...commentAnchorOffsetsFromEditorState(view.state),
            })
            setNewStickerBody("")
            setAddStickerOpen(true)
          })
          return false
        },
        keydown(_view: EditorView, event: KeyboardEvent) {
          if (
            (event.metaKey || event.ctrlKey) &&
            event.shiftKey &&
            event.key.toLowerCase() === "m"
          ) {
            if (
              !showStickerToolsRef.current ||
              !onFeedbackStickersChangeRef.current ||
              addStickerOpenRef.current ||
              disabledRef.current
            )
              return false
            event.preventDefault()
            const { from, to } = _view.state.selection
            const snippet =
              from !== to
                ? _view.state.doc.textBetween(from, to, " ").slice(0, 160).trim()
                : ""
            if (selectionDebounceRef.current) {
              clearTimeout(selectionDebounceRef.current)
              selectionDebounceRef.current = null
            }
            setPendingContextSnippet(snippet)
            setPendingCommentAnchor({
              space: "plain_text_utf16",
              ...commentAnchorOffsetsFromEditorState(_view.state),
            })
            setNewStickerBody("")
            setAddStickerOpen(true)
            return true
          }
          return false
        },
      },
    }),
    []
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: initialContent || "",
    editable: !disabled,
    editorProps: commentEditorProps,
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML())
      if (onFeedbackStickersChange) {
        const pruned = pruneStickersNotInDoc(ed, stickersRef.current)
        if (pruned) onFeedbackStickersChange(pruned)
      }
    },
    onSelectionUpdate: ({ editor: ed }) => {
      if (
        !ed ||
        !showStickerToolsRef.current ||
        !onFeedbackStickersChangeRef.current ||
        addStickerOpenRef.current ||
        disabledRef.current
      )
        return
      const { from, to } = ed.state.selection
      if (from >= to) {
        if (selectionDebounceRef.current) {
          clearTimeout(selectionDebounceRef.current)
          selectionDebounceRef.current = null
        }
        return
      }
      if (selectionDebounceRef.current) clearTimeout(selectionDebounceRef.current)
      selectionDebounceRef.current = setTimeout(() => {
        selectionDebounceRef.current = null
        const ed2 = editorRef.current ?? ed
        if (
          !ed2 ||
          addStickerOpenRef.current ||
          disabledRef.current ||
          !showStickerToolsRef.current ||
          !onFeedbackStickersChangeRef.current
        )
          return
        const { from: f, to: t } = ed2.state.selection
        if (f >= t) return
        const snippet = ed2.state.doc.textBetween(f, t, " ").slice(0, 160).trim()
        if (!snippet) return
        setPendingContextSnippet(snippet)
        setPendingCommentAnchor({
          space: "plain_text_utf16",
          ...commentAnchorOffsetsFromEditorState(ed2.state),
        })
        setNewStickerBody("")
        setAddStickerOpen(true)
      }, 220)
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  useEffect(() => {
    return () => {
      if (selectionDebounceRef.current) clearTimeout(selectionDebounceRef.current)
    }
  }, [])

  const setContent = useCallback(
    (html: string) => {
      editor?.commands.setContent(html || "<p></p>")
    },
    [editor]
  )

  useEffect(() => {
    setContent(initialContent || "<p></p>")
  }, [initialContent, setContent])

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  const handleConfirmAddSticker = () => {
    if (!editor || !onFeedbackStickersChange) return
    const body = newStickerBody.trim()
    if (!body) return
    const id = crypto.randomUUID()
    const contextSnippet = pendingContextSnippet.trim() || undefined
    const anchor: ScriptCommentAnchor =
      pendingCommentAnchor ?? {
        space: "plain_text_utf16",
        ...commentAnchorFromEditorSelection(editor),
      }
    onFeedbackStickersChange({
      ...stickersRef.current,
      [id]: {
        id,
        body,
        anchor,
        contextSnippet,
        resolved: false,
        createdAt: new Date().toISOString(),
        authorId: feedbackStickerAuthorId ?? undefined,
      },
    })
    editor.chain().focus().insertContent({
      type: FEEDBACK_STICKER_NODE,
      attrs: { feedbackId: id },
    })
    setAddStickerOpen(false)
    setNewStickerBody("")
    setPendingContextSnippet("")
    setPendingCommentAnchor(null)
  }

  const handleSaveDetail = () => {
    if (!detailStickerId || !onFeedbackStickersChange) return
    const prev = stickersRef.current[detailStickerId]
    onFeedbackStickersChange({
      ...stickersRef.current,
      [detailStickerId]: {
        ...prev,
        id: detailStickerId,
        body: editDetailBody.trim(),
      },
    })
    setDetailStickerId(null)
  }

  const handleRemoveSticker = () => {
    if (!editor || !detailStickerId || !onFeedbackStickersChange) return
    deleteFeedbackStickerNode(editor, detailStickerId)
    const next = { ...stickersRef.current }
    delete next[detailStickerId]
    onFeedbackStickersChange(next)
    setDetailStickerId(null)
    setSelectedCommentId(null)
  }

  function toggleDetailResolved() {
    if (!detailStickerId || !onFeedbackStickersChange) return
    const prev = stickersRef.current[detailStickerId]
    onFeedbackStickersChange({
      ...stickersRef.current,
      [detailStickerId]: {
        ...prev,
        id: detailStickerId,
        resolved: !prev?.resolved,
      },
    })
  }

  if (!editor) {
    return (
      <div
        className={cn(
          "rounded-lg border border-input bg-background animate-pulse",
          className
        )}
        style={{ minHeight }}
      />
    )
  }

  const detailReadOnly = disabled || !onFeedbackStickersChange
  const detailSticker =
    detailStickerId != null ? (feedbackStickers ?? {})[detailStickerId] : undefined

  return (
    <>
      <div
        className={cn(
          "rounded-lg border border-input bg-background overflow-hidden",
          disabled && "cursor-default",
          showCommentsSidebar &&
            "flex min-h-[min(420px,55vh)] flex-col lg:min-h-[320px] lg:flex-row lg:items-stretch",
          className
        )}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            showCommentsSidebar && "min-w-0 border-b border-input lg:border-b-0 lg:border-r"
          )}
        >
        {!disabled ? (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-input bg-muted/30 p-1">
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo"
          >
            <Undo2 className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo"
          >
            <Redo2 className="size-4" />
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            onClick={() => editor.chain().focus().setParagraph().run()}
            isActive={editor.isActive("paragraph")}
            title="Paragraph"
          >
            <Pilcrow className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive("heading", { level: 1 })}
            title="Heading 1"
          >
            <span className="text-xs font-bold">H1</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive("heading", { level: 2 })}
            title="Heading 2"
          >
            <span className="text-xs font-bold">H2</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive("heading", { level: 3 })}
            title="Heading 3"
          >
            <span className="text-xs font-bold">H3</span>
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive("bold")}
            title="Bold"
          >
            <Bold className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive("italic")}
            title="Italic"
          >
            <Italic className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive("underline")}
            title="Underline"
          >
            <UnderlineIcon className="size-4" />
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            isActive={editor.isActive({ textAlign: "left" })}
            title="Align left"
          >
            <AlignLeft className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            isActive={editor.isActive({ textAlign: "center" })}
            title="Align center"
          >
            <AlignCenter className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            isActive={editor.isActive({ textAlign: "right" })}
            title="Align right"
          >
            <AlignRight className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            isActive={editor.isActive({ textAlign: "justify" })}
            title="Justify"
          >
            <AlignJustify className="size-4" />
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive("bulletList")}
            title="Bullet list"
          >
            <List className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive("orderedList")}
            title="Ordered list"
          >
            <ListOrdered className="size-4" />
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            onClick={() => {
              const url = window.prompt("URL")
              if (url) editor.chain().focus().setLink({ href: url }).run()
            }}
            isActive={editor.isActive("link")}
            title="Insert link"
          >
            <LinkIcon className="size-4" />
          </ToolbarButton>
        </div>
        ) : null}
        <div
          ref={editorShellRef}
          className={cn(showCommentsSidebar && "min-h-0 flex-1 overflow-y-auto")}
          style={showCommentsSidebar ? undefined : { minHeight }}
        >
          <EditorContent editor={editor} />
        </div>
        </div>

        {showCommentsSidebar ? (
          <ScriptEditorCommentsSidebar
            editor={editor}
            feedbackStickers={feedbackStickers ?? {}}
            onFeedbackStickersChange={onFeedbackStickersChange}
            readOnly={disabled || !onFeedbackStickersChange}
            selectedCommentId={selectedCommentId}
            onSelectComment={setSelectedCommentId}
            onRequestEditComment={(id) => {
              setDetailStickerId(id)
              setSelectedCommentId(id)
              setEditDetailBody((feedbackStickers ?? {})[id]?.body ?? "")
            }}
            editorScrollRootRef={editorShellRef}
          />
        ) : null}
      </div>

      <Dialog
        open={addStickerOpen}
        onOpenChange={(open) => {
          setAddStickerOpen(open)
          if (!open) {
            setPendingContextSnippet("")
            setPendingCommentAnchor(null)
          }
        }}
      >
        <DialogContent className="gap-4 p-6 sm:max-w-lg" showCloseButton>
          <DialogHeader className="gap-2 space-y-1">
            <DialogTitle>New comment</DialogTitle>
            <DialogDescription>
              This opens when you highlight script text (or use ⌘⇧M / Ctrl⇧M for a comment at the
              cursor). The marker is placed at your cursor; highlighted text is saved as thread
              context when applicable.
            </DialogDescription>
          </DialogHeader>
          {pendingContextSnippet ? (
            <div className="rounded-md border border-border/80 bg-muted/40 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Selection context
              </p>
              <p className="mt-1 line-clamp-3 text-xs italic text-foreground">
                “{pendingContextSnippet}”
              </p>
            </div>
          ) : null}
          {pendingCommentAnchor ? (
            <p className="rounded-md bg-muted/30 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
              <span className="font-medium text-foreground/80">Anchor</span> — characters{" "}
              <span className="tabular-nums text-foreground">
                {pendingCommentAnchor.startOffset}
              </span>
              {" → "}
              <span className="tabular-nums text-foreground">
                {pendingCommentAnchor.endOffset}
              </span>{" "}
              ({pendingCommentAnchor.space}, half-open range)
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="new-sticker-body">Comment</Label>
            <Textarea
              id="new-sticker-body"
              value={newStickerBody}
              onChange={(e) => setNewStickerBody(e.target.value)}
              placeholder="e.g. Clarify dosing in this paragraph…"
              rows={4}
              className="min-h-[100px] resize-y"
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setAddStickerOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmAddSticker}
              disabled={!newStickerBody.trim()}
            >
              Post comment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detailStickerId != null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailStickerId(null)
          }
        }}
      >
        <DialogContent className="gap-4 p-6 sm:max-w-lg" showCloseButton>
          <DialogHeader className="gap-2 space-y-1">
            <DialogTitle>Comment thread</DialogTitle>
            <DialogDescription>
              Inline marker in the script; numbers match the Comments sidebar order.
            </DialogDescription>
          </DialogHeader>
          {detailSticker?.contextSnippet ? (
            <div className="rounded-md border border-border/80 bg-muted/40 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Context
              </p>
              <p className="mt-1 text-xs italic text-foreground">
                “{detailSticker.contextSnippet}”
              </p>
            </div>
          ) : null}
          {detailSticker?.anchor ? (
            <p className="text-[11px] text-muted-foreground">
              Range:{" "}
              <span className="tabular-nums text-foreground">
                {detailSticker.anchor.startOffset}–{detailSticker.anchor.endOffset}
              </span>{" "}
              ({detailSticker.anchor.space})
            </p>
          ) : null}
          {detailSticker?.resolved ? (
            <p className="text-xs font-medium text-green-700 dark:text-green-400">Resolved</p>
          ) : (
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Open</p>
          )}
          {detailReadOnly ? (
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {detailSticker?.body ||
                "No text for this comment yet. It may load after the API returns data."}
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="edit-sticker-body">Comment</Label>
              <Textarea
                id="edit-sticker-body"
                value={editDetailBody}
                onChange={(e) => setEditDetailBody(e.target.value)}
                rows={5}
                className="min-h-[120px] resize-y"
              />
            </div>
          )}
          <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
            {!detailReadOnly ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={toggleDetailResolved}>
                  {detailSticker?.resolved ? "Reopen thread" : "Mark resolved"}
                </Button>
                <Button type="button" variant="destructive" onClick={handleRemoveSticker}>
                  Delete comment
                </Button>
              </div>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDetailStickerId(null)
                }}
              >
                {detailReadOnly ? "Close" : "Cancel"}
              </Button>
              {!detailReadOnly ? (
                <Button type="button" onClick={handleSaveDetail}>
                  Save
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ToolbarDivider() {
  return <div className="mx-1 w-px self-stretch bg-border" />
}

function ToolbarButton({
  children,
  onClick,
  isActive,
  disabled,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  title: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-8 shrink-0", isActive && "bg-muted")}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </Button>
  )
}
