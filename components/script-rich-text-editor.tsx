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
import { Extension } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { Plugin, PluginKey } from "@tiptap/pm/state"
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
  MessageSquare,
} from "lucide-react"
import {
  FeedbackSticker,
  type FeedbackStickerExtensionOptions,
} from "@/components/tiptap/feedback-sticker-extension"
import {
  CommentRangeHighlight,
  commentRangeHighlightPluginKey,
} from "@/components/tiptap/comment-range-highlight-extension"
import {
  collectFeedbackStickerIdsFromEditor,
  FEEDBACK_STICKER_NODE,
} from "@/lib/feedback-sticker-doc"
import type { ScriptCommentAnchor, ScriptFeedbackSticker } from "@/types/script"
import { formatStickerResolvedHint } from "@/lib/script-comment-resolve-label"
import {
  canEditScriptStickerBody,
  canResolveScriptSticker,
  type ScriptStickerPermissionContext,
} from "@/lib/script-comment-resolve-permissions"
import { ScriptEditorCommentsSidebar } from "@/components/script-editor-comments-sidebar"
import {
  commentAnchorFromEditorSelection,
  commentAnchorOffsetsFromEditorState,
  insertionPosForCommentAnchor,
} from "@/lib/script-comment-offsets"
import { canonicalStickersJsonFromArray } from "@/lib/feedback-sticker-sync"
import { scriptDocContentFingerprint } from "@/lib/script-doc-content-fingerprint"

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
  onFeedbackStickersChange?: (
    next: Record<string, ScriptFeedbackSticker>
  ) => void
  /** Enables inline comments: highlight text to post, or ⌘⇧M / Ctrl⇧M at cursor. No toolbar button. */
  feedbackStickerToolbar?: boolean
  /** Thread list beside the document (Comments-style). Shown when toolbar comments mode is on, or set explicitly (e.g. read-only review). */
  feedbackCommentsSidebar?: boolean
  /** Message when there are no threads (e.g. after GET /comments returned []). Passed to the sidebar. */
  commentsSidebarEmptyHint?: string
  /** Set on new stickers as `authorId` when saving. */
  feedbackStickerAuthorId?: string | null
  /**
   * When true, the script body (text, marks, structure) cannot change; only inline
   * feedback stickers may be added/edited/removed. Use with `feedbackStickerToolbar`
   * and `onFeedbackStickersChange` for reviewer flows (e.g. Content/Brand).
   */
  contentReadOnly?: boolean
  /**
   * Per-sticker resolve vs edit (recipient vs author). When omitted, any sidebar action
   * is allowed whenever `onFeedbackStickersChange` is set and the editor is not disabled.
   */
  stickerPermissionContext?: ScriptStickerPermissionContext | null
}

const scriptContentLockPluginKey = new PluginKey("scriptContentReadOnlyLock")

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

function deleteFeedbackStickerNode(
  editor: Editor,
  feedbackId: string
): boolean {
  let from = -1
  let to = -1
  editor.state.doc.descendants((node, pos) => {
    if (
      node.type.name === FEEDBACK_STICKER_NODE &&
      String(node.attrs.feedbackId) === feedbackId
    ) {
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
  commentsSidebarEmptyHint,
  feedbackStickerAuthorId,
  contentReadOnly = false,
  stickerPermissionContext = null,
}: ScriptRichTextEditorProps) {
  const stickersRef = useRef<Record<string, ScriptFeedbackSticker>>({})
  const contentReadOnlyRef = useRef(false)
  const onOpenDetailRef = useRef<(id: string) => void>(() => {})
  const editorShellRef = useRef<HTMLDivElement | null>(null)
  const [detailStickerId, setDetailStickerId] = useState<string | null>(null)
  const [editDetailBody, setEditDetailBody] = useState("")
  const [addStickerOpen, setAddStickerOpen] = useState(false)
  const [newStickerBody, setNewStickerBody] = useState("")
  const [pendingContextSnippet, setPendingContextSnippet] = useState("")
  const [pendingCommentAnchor, setPendingCommentAnchor] =
    useState<ScriptCommentAnchor | null>(null)
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(
    null
  )

  const showStickerTools =
    feedbackStickerToolbar && !disabled && !!onFeedbackStickersChange

  const hasStickerThreads = Object.keys(feedbackStickers ?? {}).length > 0
  const showCommentsSidebar =
    feedbackCommentsSidebar === false
      ? false
      : feedbackCommentsSidebar === true ||
        showStickerTools ||
        hasStickerThreads

  const showStickerToolsRef = useRef(false)
  const onFeedbackStickersChangeRef = useRef(onFeedbackStickersChange)
  const addStickerOpenRef = useRef(false)
  const disabledRef = useRef(disabled)
  const editorRef = useRef<Editor | null>(null)
  const openAddStickerDialogRef = useRef<() => void>(() => {})
  /** Only prune sticker state when a node was in the doc and is now gone (user deleted the marker). */
  const prevStickerIdsInDocRef = useRef<Set<string>>(new Set())
  const selectedCommentIdRef = useRef<string | null>(null)
  const onCommentRangeClickRef = useRef<(id: string) => void>(() => {})

  useLayoutEffect(() => {
    showStickerToolsRef.current = showStickerTools
    onFeedbackStickersChangeRef.current = onFeedbackStickersChange
    addStickerOpenRef.current = addStickerOpen
    disabledRef.current = disabled
    contentReadOnlyRef.current = Boolean(contentReadOnly)
  }, [
    showStickerTools,
    onFeedbackStickersChange,
    addStickerOpen,
    disabled,
    contentReadOnly,
  ])

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

  useLayoutEffect(() => {
    selectedCommentIdRef.current = selectedCommentId
  }, [selectedCommentId])

  useLayoutEffect(() => {
    onCommentRangeClickRef.current = (id: string) => {
      setSelectedCommentId(id)
    }
  }, [])

  const stickerExtOptions = useMemo<FeedbackStickerExtensionOptions>(
    () => ({
      getStickers: () => stickersRef.current,
      onOpenDetail: (id) => onOpenDetailRef.current(id),
    }),
    []
  )

  const feedbackStickersSyncKey = useMemo(
    () => canonicalStickersJsonFromArray(Object.values(feedbackStickers ?? {})),
    [feedbackStickers]
  )

  const commentHighlightExtOptions = useMemo(
    () => ({
      getStickers: () => stickersRef.current,
      getSelectedId: () => selectedCommentIdRef.current,
    }),
    []
  )

  const extensions = useMemo(() => {
    return [
      ...getBaseExtensions(placeholder),
      // eslint-disable-next-line react-hooks/refs -- options read refs only inside TipTap / ProseMirror callbacks
      FeedbackSticker.configure(stickerExtOptions),
      CommentRangeHighlight.configure(commentHighlightExtOptions),
      Extension.create({
        name: "scriptContentReadOnlyLock",
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: scriptContentLockPluginKey,
              filterTransaction(tr, state) {
                if (!contentReadOnlyRef.current) return true
                if (!tr.docChanged) return true
                // Must not call `state.apply(tr)` here — it re-runs plugin filters and overflows the stack.
                const a = scriptDocContentFingerprint(
                  state.doc.toJSON() as Record<string, unknown>
                )
                const b = scriptDocContentFingerprint(
                  tr.doc.toJSON() as Record<string, unknown>
                )
                return a === b
              },
            }),
          ]
        },
      }),
    ]
  }, [placeholder, stickerExtOptions, commentHighlightExtOptions])

  const commentEditorProps = useMemo(
    () => ({
      attributes: {
        class:
          "min-h-[200px] focus:outline-none px-3 py-2 text-sm leading-relaxed [&_p]:mb-2 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-primary [&_a]:underline",
      },
      handleDOMEvents: {
        click(_view: EditorView, event: MouseEvent) {
          const t = event.target as HTMLElement | null
          if (!t) return false
          const el = t.closest?.("[data-comment-range-id]")
          if (el) {
            const id = el.getAttribute("data-comment-range-id")
            if (id) {
              onCommentRangeClickRef.current(id)
              return true
            }
          }
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
            openAddStickerDialogRef.current()
            return true
          }
          return false
        },
      },
    }),
    []
  )

  const editorEditable =
    !disabled || Boolean(contentReadOnly && onFeedbackStickersChange)

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: initialContent || "",
    editable: editorEditable,
    editorProps: commentEditorProps,
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML())
      if (onFeedbackStickersChange) {
        const inDoc = new Set(collectFeedbackStickerIdsFromEditor(ed))
        const prev = prevStickerIdsInDocRef.current
        const removed = [...prev].filter((id) => !inDoc.has(id))
        prevStickerIdsInDocRef.current = inDoc
        if (removed.length > 0) {
          let next = stickersRef.current
          let changed = false
          for (const id of removed) {
            if (next[id]) {
              if (!changed) {
                next = { ...next }
                changed = true
              }
              delete next[id]
            }
          }
          if (changed) onFeedbackStickersChange(next)
        }
      }
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  const openAddStickerDialog = useCallback(() => {
    const ed = editorRef.current
    if (
      !ed ||
      addStickerOpenRef.current ||
      disabledRef.current ||
      !showStickerToolsRef.current ||
      !onFeedbackStickersChangeRef.current
    )
      return
    const { from, to } = ed.state.selection
    const snippet =
      from !== to
        ? ed.state.doc.textBetween(from, to, " ").slice(0, 160).trim()
        : ""
    setPendingContextSnippet(snippet)
    setPendingCommentAnchor({
      space: "plain_text_utf16",
      ...commentAnchorOffsetsFromEditorState(ed.state),
    })
    setNewStickerBody("")
    setAddStickerOpen(true)
  }, [])

  useLayoutEffect(() => {
    openAddStickerDialogRef.current = openAddStickerDialog
  }, [openAddStickerDialog])

  const setContent = useCallback(
    (html: string) => {
      editor?.commands.setContent(html || "<p></p>")
    },
    [editor]
  )

  useEffect(() => {
    prevStickerIdsInDocRef.current = new Set()
    setContent(initialContent || "<p></p>")
  }, [initialContent, setContent])

  /**
   * Drop inline marker nodes when there are no comment threads, or when the doc still
   * contains markers from a previous script version / revision (id not in the current map).
   * Runs before hydration so API-backed markers can be re-inserted by anchor.
   */
  useEffect(() => {
    if (!editor) return
    const stickers = feedbackStickers ?? {}
    const stickerIds = new Set(Object.keys(stickers))
    const mapEmpty = stickerIds.size === 0

    const ed = editor
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled || ed.isDestroyed) return
      const ranges: { from: number; to: number }[] = []
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name !== FEEDBACK_STICKER_NODE) return true
        const fid = String(node.attrs.feedbackId ?? "")
        if (mapEmpty || !stickerIds.has(fid)) {
          ranges.push({ from: pos, to: pos + node.nodeSize })
        }
        return true
      })
      if (ranges.length === 0) return
      ranges.sort((a, b) => b.from - a.from)
      let chain = ed.chain()
      for (const r of ranges) {
        chain = chain.deleteRange({ from: r.from, to: r.to })
      }
      chain.run()
    })
    return () => {
      cancelled = true
    }
  }, [editor, feedbackStickersSyncKey])

  /** Insert feedbackSticker nodes for API-loaded comments (anchors are not stored in HTML). */
  useEffect(() => {
    if (!editor) return
    const stickers = feedbackStickers ?? {}
    const inDoc = new Set(collectFeedbackStickerIdsFromEditor(editor))
    const toHydrate = Object.values(stickers).filter(
      (s) => s.id && s.anchor && !inDoc.has(s.id)
    )
    if (toHydrate.length === 0) return

    const withPos = toHydrate
      .map((s) => {
        const pos = insertionPosForCommentAnchor(editor.state, s.anchor!)
        return pos != null ? { s, pos } : null
      })
      .filter((x): x is { s: ScriptFeedbackSticker; pos: number } => x != null)
      .sort((a, b) => b.pos - a.pos)

    if (withPos.length === 0) return

    const ed = editor
    let cancelled = false
    // Defer past React commit — TipTap's chain.run() can use flushSync internally.
    queueMicrotask(() => {
      if (cancelled || ed.isDestroyed) return
      let chain = ed.chain()
      for (const { s, pos } of withPos) {
        chain = chain.insertContentAt(pos, {
          type: FEEDBACK_STICKER_NODE,
          attrs: { feedbackId: s.id },
        })
      }
      chain.run()
    })
    return () => {
      cancelled = true
    }
  }, [editor, feedbackStickersSyncKey])

  /** Refresh comment-range decorations when sticker map or selection changes (refs read inside plugin). */
  useEffect(() => {
    if (!editor) return
    const ed = editor
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled || ed.isDestroyed) return
      ed.view.dispatch(
        ed.state.tr.setMeta(commentRangeHighlightPluginKey, true)
      )
    })
    return () => {
      cancelled = true
    }
  }, [editor, feedbackStickersSyncKey, selectedCommentId])

  useEffect(() => {
    editor?.setEditable(
      !disabled || Boolean(contentReadOnly && onFeedbackStickersChange)
    )
  }, [editor, disabled, contentReadOnly, onFeedbackStickersChange])

  const handleConfirmAddSticker = () => {
    if (!editor || !onFeedbackStickersChange) return
    const body = newStickerBody.trim()
    if (!body) return
    const id = crypto.randomUUID()
    const contextSnippet = pendingContextSnippet.trim() || undefined
    const anchor: ScriptCommentAnchor = pendingCommentAnchor ?? {
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
    editor
      .chain()
      .focus()
      .insertContent({
        type: FEEDBACK_STICKER_NODE,
        attrs: { feedbackId: id },
      })
    setAddStickerOpen(false)
    setNewStickerBody("")
    setPendingContextSnippet("")
    setPendingCommentAnchor(null)
  }

  const handleSaveDetail = () => {
    if (!detailStickerId || !onFeedbackStickersChange || disabled) return
    const prev = stickersRef.current[detailStickerId]
    if (!prev) return
    if (stickerPermissionContext) {
      if (
        !canEditScriptStickerBody(
          stickerPermissionContext.currentUserRole,
          prev,
          stickerPermissionContext.currentUserId
        )
      ) {
        return
      }
    }
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
    if (!editor || !detailStickerId || !onFeedbackStickersChange || disabled)
      return
    const prev = stickersRef.current[detailStickerId]
    if (stickerPermissionContext && prev) {
      if (
        !canEditScriptStickerBody(
          stickerPermissionContext.currentUserRole,
          prev,
          stickerPermissionContext.currentUserId
        )
      ) {
        return
      }
    }
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
    if (!prev) return
    const allow = stickerPermissionContext
      ? canResolveScriptSticker(
          stickerPermissionContext.scriptStatus,
          stickerPermissionContext.currentUserRole,
          prev,
          stickerPermissionContext.currentUserId
        )
      : !disabled && !!onFeedbackStickersChange
    if (!allow) return
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
    if (!showCommentsSidebar) {
      return (
        <div
          className={cn(
            "animate-pulse rounded-lg border border-input bg-background",
            className
          )}
          style={{ minHeight }}
        />
      )
    }
    return (
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-input bg-background",
          disabled && "cursor-default",
          "flex min-h-[min(420px,55vh)] flex-col lg:min-h-[320px] lg:flex-row lg:items-stretch",
          className
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-input lg:border-r lg:border-b-0">
          <div className="h-9 shrink-0 animate-pulse border-b border-input bg-muted/30" />
          <div
            ref={editorShellRef}
            className="min-h-0 flex-1 animate-pulse bg-muted/15"
            style={{ minHeight }}
          />
        </div>
        <ScriptEditorCommentsSidebar
          editor={null}
          feedbackStickers={feedbackStickers ?? {}}
          onFeedbackStickersChange={onFeedbackStickersChange}
          readOnly={disabled || !onFeedbackStickersChange}
          selectedCommentId={selectedCommentId}
          onSelectComment={setSelectedCommentId}
          currentUserId={feedbackStickerAuthorId ?? null}
          stickerPermissionContext={stickerPermissionContext}
          emptyListHint={commentsSidebarEmptyHint}
          onRequestEditComment={(id) => {
            setDetailStickerId(id)
            setSelectedCommentId(id)
            setEditDetailBody((feedbackStickers ?? {})[id]?.body ?? "")
          }}
          editorScrollRootRef={editorShellRef}
        />
      </div>
    )
  }

  const detailSticker =
    detailStickerId != null
      ? (feedbackStickers ?? {})[detailStickerId]
      : undefined

  const legacyDetailBodyLocked = disabled || !onFeedbackStickersChange
  const canEditDetailBody = (() => {
    if (legacyDetailBodyLocked || !detailSticker) return false
    if (!stickerPermissionContext) return true
    return canEditScriptStickerBody(
      stickerPermissionContext.currentUserRole,
      detailSticker,
      stickerPermissionContext.currentUserId
    )
  })()
  const detailBodyReadOnly = legacyDetailBodyLocked || !canEditDetailBody

  const canToggleDetailResolved = (() => {
    if (!detailStickerId || !onFeedbackStickersChange || !detailSticker)
      return false
    if (!stickerPermissionContext) {
      return !disabled && !!onFeedbackStickersChange
    }
    return canResolveScriptSticker(
      stickerPermissionContext.scriptStatus,
      stickerPermissionContext.currentUserRole,
      detailSticker,
      stickerPermissionContext.currentUserId
    )
  })()

  const canDeleteDetailSticker = (() => {
    if (!detailStickerId || !onFeedbackStickersChange || !detailSticker)
      return false
    if (!stickerPermissionContext) {
      return !disabled && !!onFeedbackStickersChange
    }
    return canEditScriptStickerBody(
      stickerPermissionContext.currentUserRole,
      detailSticker,
      stickerPermissionContext.currentUserId
    )
  })()

  const detailDialogDismissLabel =
    !canEditDetailBody && !canToggleDetailResolved && !canDeleteDetailSticker
      ? "Close"
      : "Cancel"

  /** Same toolbar everywhere; formatting actions are disabled when the doc body must not be edited. */
  const formattingLocked = disabled || contentReadOnly

  return (
    <>
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-input bg-background",
          disabled && "cursor-default",
          showCommentsSidebar &&
            "flex min-h-[min(420px,55vh)] flex-col lg:min-h-[320px] lg:flex-row lg:items-stretch",
          className
        )}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            showCommentsSidebar &&
              "min-w-0 border-b border-input lg:border-r lg:border-b-0"
          )}
        >
          <div className="border-b border-input bg-muted/30">
            <div className="flex flex-wrap items-center gap-0.5 p-1">
              <ToolbarButton
                onClick={() => editor.chain().focus().undo().run()}
                disabled={formattingLocked || !editor.can().undo()}
                title="Undo"
              >
                <Undo2 className="size-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().redo().run()}
                disabled={formattingLocked || !editor.can().redo()}
                title="Redo"
              >
                <Redo2 className="size-4" />
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                onClick={() => editor.chain().focus().setParagraph().run()}
                isActive={editor.isActive("paragraph")}
                disabled={formattingLocked}
                title="Paragraph"
              >
                <Pilcrow className="size-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 1 }).run()
                }
                isActive={editor.isActive("heading", { level: 1 })}
                disabled={formattingLocked}
                title="Heading 1"
              >
                <span className="text-xs font-bold">H1</span>
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
                isActive={editor.isActive("heading", { level: 2 })}
                disabled={formattingLocked}
                title="Heading 2"
              >
                <span className="text-xs font-bold">H2</span>
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 3 }).run()
                }
                isActive={editor.isActive("heading", { level: 3 })}
                disabled={formattingLocked}
                title="Heading 3"
              >
                <span className="text-xs font-bold">H3</span>
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                isActive={editor.isActive("bold")}
                disabled={formattingLocked}
                title="Bold"
              >
                <Bold className="size-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                isActive={editor.isActive("italic")}
                disabled={formattingLocked}
                title="Italic"
              >
                <Italic className="size-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                isActive={editor.isActive("underline")}
                disabled={formattingLocked}
                title="Underline"
              >
                <UnderlineIcon className="size-4" />
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().setTextAlign("left").run()
                }
                isActive={editor.isActive({ textAlign: "left" })}
                disabled={formattingLocked}
                title="Align left"
              >
                <AlignLeft className="size-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().setTextAlign("center").run()
                }
                isActive={editor.isActive({ textAlign: "center" })}
                disabled={formattingLocked}
                title="Align center"
              >
                <AlignCenter className="size-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().setTextAlign("right").run()
                }
                isActive={editor.isActive({ textAlign: "right" })}
                disabled={formattingLocked}
                title="Align right"
              >
                <AlignRight className="size-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor.chain().focus().setTextAlign("justify").run()
                }
                isActive={editor.isActive({ textAlign: "justify" })}
                disabled={formattingLocked}
                title="Justify"
              >
                <AlignJustify className="size-4" />
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                isActive={editor.isActive("bulletList")}
                disabled={formattingLocked}
                title="Bullet list"
              >
                <List className="size-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                isActive={editor.isActive("orderedList")}
                disabled={formattingLocked}
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
                disabled={formattingLocked}
                title="Insert link"
              >
                <LinkIcon className="size-4" />
              </ToolbarButton>
              {showStickerTools ? (
                <>
                  <ToolbarDivider />
                  <ToolbarButton
                    onClick={() => {
                      editor.chain().focus().run()
                      openAddStickerDialog()
                    }}
                    disabled={disabled}
                    title="Add comment on selection or cursor"
                  >
                    <MessageSquare className="size-4" />
                  </ToolbarButton>
                </>
              ) : null}
            </div>
            {contentReadOnly && showStickerTools ? (
              <div className="border-t border-border/60 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  Inline comments
                </span>{" "}
                — select text (optional), then click the message button in the
                toolbar, or use{" "}
                <kbd className="rounded border bg-background px-1 font-mono text-[10px]">
                  ⌘⇧M
                </kbd>{" "}
                /{" "}
                <kbd className="rounded border bg-background px-1 font-mono text-[10px]">
                  Ctrl⇧M
                </kbd>{" "}
                at the cursor. The script body is read-only.
              </div>
            ) : null}
          </div>
          <div
            ref={editorShellRef}
            className={cn(
              showCommentsSidebar && "min-h-0 flex-1 overflow-y-auto"
            )}
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
            currentUserId={feedbackStickerAuthorId ?? null}
            stickerPermissionContext={stickerPermissionContext}
            emptyListHint={commentsSidebarEmptyHint}
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
              Use the toolbar message button or ⌘⇧M / Ctrl⇧M to open this
              dialog. The marker is placed at your cursor; selected text is
              saved as thread context when applicable.
            </DialogDescription>
          </DialogHeader>
          {pendingContextSnippet ? (
            <div className="rounded-md border border-border/80 bg-muted/40 px-3 py-2">
              <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Selection context
              </p>
              <p className="mt-1 line-clamp-3 text-xs text-foreground italic">
                “{pendingContextSnippet}”
              </p>
            </div>
          ) : null}
          {pendingCommentAnchor ? (
            <p className="rounded-md bg-muted/30 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
              <span className="font-medium text-foreground/80">Anchor</span> —
              characters{" "}
              <span className="text-foreground tabular-nums">
                {pendingCommentAnchor.startOffset}
              </span>
              {" → "}
              <span className="text-foreground tabular-nums">
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddStickerOpen(false)}
            >
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
              Inline marker in the script; numbers match the Comments sidebar
              order.
            </DialogDescription>
          </DialogHeader>
          {detailSticker?.contextSnippet ? (
            <div className="rounded-md border border-border/80 bg-muted/40 px-3 py-2">
              <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Context
              </p>
              <p className="mt-1 text-xs text-foreground italic">
                “{detailSticker.contextSnippet}”
              </p>
            </div>
          ) : null}
          {detailSticker?.anchor ? (
            <p className="text-[11px] text-muted-foreground">
              Range:{" "}
              <span className="text-foreground tabular-nums">
                {detailSticker.anchor.startOffset}–
                {detailSticker.anchor.endOffset}
              </span>{" "}
              ({detailSticker.anchor.space})
            </p>
          ) : null}
          {detailSticker?.resolved ? (
            <p className="text-xs font-medium text-green-700 dark:text-green-400">
              {formatStickerResolvedHint(detailSticker) ?? "Resolved"}
            </p>
          ) : (
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
              Open
            </p>
          )}
          {detailBodyReadOnly ? (
            <p className="text-sm whitespace-pre-wrap text-foreground">
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
            <div className="flex flex-wrap gap-2">
              {canToggleDetailResolved ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={toggleDetailResolved}
                >
                  {detailSticker?.resolved ? "Reopen thread" : "Mark resolved"}
                </Button>
              ) : null}
              {canDeleteDetailSticker ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleRemoveSticker}
                >
                  Delete comment
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDetailStickerId(null)
                }}
              >
                {detailDialogDismissLabel}
              </Button>
              {canEditDetailBody ? (
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
