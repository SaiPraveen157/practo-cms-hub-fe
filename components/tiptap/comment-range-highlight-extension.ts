import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { commentHighlightRangeFromAnchor } from "@/lib/script-comment-offsets"
import type { ScriptFeedbackSticker } from "@/types/script"

export const commentRangeHighlightPluginKey = new PluginKey("commentRangeHighlight")

export type CommentRangeHighlightOptions = {
  getStickers: () => Record<string, ScriptFeedbackSticker>
  getSelectedId: () => string | null
}

function buildDecorationSet(
  state: EditorState,
  stickers: Record<string, ScriptFeedbackSticker>,
  selectedId: string | null
): DecorationSet {
  const decs: Decoration[] = []
  for (const s of Object.values(stickers)) {
    if (!s?.id || !s.anchor) continue
    const range = commentHighlightRangeFromAnchor(state, s.anchor)
    if (!range || range.from >= range.to) continue
    const isSelected = selectedId === s.id
    decs.push(
      Decoration.inline(range.from, range.to, {
        class: isSelected
          ? "comment-range-highlight comment-range-highlight--selected"
          : "comment-range-highlight",
        "data-comment-range-id": s.id,
      })
    )
  }
  return DecorationSet.create(state.doc, decs)
}

export const CommentRangeHighlight = Extension.create<CommentRangeHighlightOptions>(
  {
    name: "commentRangeHighlight",

    addOptions() {
      return {
        getStickers: () => ({} as Record<string, ScriptFeedbackSticker>),
        getSelectedId: () => null as string | null,
      }
    },

    addProseMirrorPlugins() {
      const opts = this.options
      return [
        new Plugin<DecorationSet>({
          key: commentRangeHighlightPluginKey,
          state: {
            init(_, state) {
              return buildDecorationSet(
                state,
                opts.getStickers(),
                opts.getSelectedId()
              )
            },
            apply(tr, old, _oldState, newState) {
              if (tr.docChanged || tr.getMeta(commentRangeHighlightPluginKey)) {
                return buildDecorationSet(
                  newState,
                  opts.getStickers(),
                  opts.getSelectedId()
                )
              }
              return old
            },
          },
          props: {
            decorations(state) {
              return commentRangeHighlightPluginKey.getState(state)
            },
          },
        }),
      ]
    },
  }
)
