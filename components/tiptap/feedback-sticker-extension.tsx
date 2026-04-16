"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { cn } from "@/lib/utils"
import { CheckCircle2, MessageSquareText } from "lucide-react"
import type { ScriptFeedbackSticker } from "@/types/script"
import { stickerOrdinalInDoc } from "@/lib/feedback-sticker-doc"

export type FeedbackStickerExtensionOptions = {
  getStickers: () => Record<string, ScriptFeedbackSticker>
  onOpenDetail: (feedbackId: string) => void
  /** When true, inline marker buttons are not shown (doc structure unchanged). */
  shouldHideInlinePresentation?: () => boolean
}

function FeedbackStickerNodeView(props: ReactNodeViewProps) {
  const { node, editor, selected, extension } = props
  const opts = extension.options as FeedbackStickerExtensionOptions
  const feedbackId = String(node.attrs.feedbackId ?? "")
  const sticker = opts.getStickers()[feedbackId]
  const ordinal = stickerOrdinalInDoc(editor, feedbackId)
  const preview =
    sticker?.body?.trim() ||
    "No comment text yet (loads from server when available)."
  const resolved = Boolean(sticker?.resolved)

  if (opts.shouldHideInlinePresentation?.()) {
    return (
      <NodeViewWrapper
        as="span"
        className="inline-block size-0 max-h-0 overflow-hidden p-0 align-baseline opacity-0"
        data-feedback-sticker=""
        contentEditable={false}
        aria-hidden
      />
    )
  }

  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        "inline-flex align-baseline",
        selected && "ring-2 ring-primary/50 ring-offset-1 rounded-sm"
      )}
      data-feedback-sticker=""
      contentEditable={false}
    >
      <button
        type="button"
        data-comment-anchor={feedbackId || undefined}
        title={preview}
        className={cn(
          "mx-0.5 inline-flex h-6 min-w-6 cursor-pointer items-center justify-center gap-0.5 rounded-full border px-1.5 text-[10px] font-semibold tabular-nums shadow-sm transition-colors",
          resolved
            ? "border-green-600/35 bg-green-500/10 text-green-800 hover:bg-green-500/18 dark:border-green-500/30 dark:text-green-200"
            : "border-sky-500/50 bg-sky-500/12 text-sky-950 hover:bg-sky-500/20 dark:border-sky-400/40 dark:bg-sky-400/10 dark:text-sky-100"
        )}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (feedbackId) opts.onOpenDetail(feedbackId)
        }}
      >
        {resolved ? (
          <CheckCircle2 className="size-3 shrink-0 opacity-90" aria-hidden />
        ) : (
          <MessageSquareText className="size-3 shrink-0 opacity-85" aria-hidden />
        )}
        {ordinal > 0 ? ordinal : "·"}
      </button>
    </NodeViewWrapper>
  )
}

export const FeedbackSticker = Node.create({
  name: "feedbackSticker",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions(): FeedbackStickerExtensionOptions {
    return {
      getStickers: () => ({}),
      onOpenDetail: () => {},
      shouldHideInlinePresentation: () => false,
    }
  },

  addAttributes() {
    return {
      feedbackId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-feedback-id"),
        renderHTML: (attrs) =>
          attrs.feedbackId ? { "data-feedback-id": attrs.feedbackId } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-feedback-sticker][data-feedback-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "feedback-sticker",
        "data-feedback-sticker": "",
        class: "script-feedback-sticker",
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FeedbackStickerNodeView)
  },
})
