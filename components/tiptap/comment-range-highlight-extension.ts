import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state"
import { ReplaceStep } from "@tiptap/pm/transform"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { commentHighlightRangeFromAnchor } from "@/lib/script-comment-offsets"
import type { ScriptFeedbackSticker } from "@/types/script"

export const commentRangeHighlightPluginKey = new PluginKey("commentRangeHighlight")

/** Dispatched on the plugin transaction to control range reconciliation. */
export type CommentRangeHighlightMeta =
  | { kind: "sticker-sync" }
  | { kind: "selection" }
  | { kind: "full-reset" }

export type CommentHighlightRangeState = {
  /** Live PM ranges for each sticker id; updated on doc changes via mapping. */
  ranges: Map<string, { from: number; to: number }>
}

export type CommentRangeHighlightOptions = {
  getStickers: () => Record<string, ScriptFeedbackSticker>
  getSelectedId: () => string | null
  /** When true, no inline range highlights are drawn (sidebar/API unchanged). */
  suppressInlineDecorations?: () => boolean
}

export function getCommentHighlightRangeState(
  state: EditorState
): CommentHighlightRangeState | undefined {
  return commentRangeHighlightPluginKey.getState(state) as
    | CommentHighlightRangeState
    | undefined
}

function initRangesFromStickers(
  state: EditorState,
  stickers: Record<string, ScriptFeedbackSticker>
): Map<string, { from: number; to: number }> {
  const m = new Map<string, { from: number; to: number }>()
  for (const s of Object.values(stickers)) {
    if (!s?.id || !s.anchor) continue
    const range = commentHighlightRangeFromAnchor(state, s.anchor)
    if (range && range.from < range.to) m.set(s.id, range)
  }
  return m
}

function mergeNewStickerRanges(
  prev: Map<string, { from: number; to: number }>,
  state: EditorState,
  stickers: Record<string, ScriptFeedbackSticker>
): Map<string, { from: number; to: number }> {
  const next = new Map(prev)
  const ids = new Set(Object.keys(stickers))
  for (const id of next.keys()) {
    if (!ids.has(id)) next.delete(id)
  }
  for (const s of Object.values(stickers)) {
    if (!s?.id || !s.anchor || next.has(s.id)) continue
    const range = commentHighlightRangeFromAnchor(state, s.anchor)
    if (range && range.from < range.to) next.set(s.id, range)
  }
  return next
}

/** Whole-body replace (e.g. TipTap setContent): must not map old highlight positions. */
function isFullDocumentReplace(
  tr: Transaction,
  oldState: EditorState
): boolean {
  if (!tr.docChanged) return false
  const oldEnd = oldState.doc.content.size
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i]
    if (step instanceof ReplaceStep && step.from === 0 && step.to >= oldEnd) {
      return true
    }
  }
  return false
}

function mapRangesOnDocChange(
  tr: Transaction,
  ranges: Map<string, { from: number; to: number }>,
  newState: EditorState
): Map<string, { from: number; to: number }> {
  const mapping = tr.mapping
  const next = new Map<string, { from: number; to: number }>()
  const docSize = newState.doc.content.size

  for (const [id, r] of ranges) {
    const from = mapping.map(r.from)
    const to = mapping.map(r.to, -1)
    if (from < to && from >= 0 && to <= docSize) {
      next.set(id, { from, to })
    }
  }
  return next
}

function buildDecorationSetFromRanges(
  state: EditorState,
  ranges: Map<string, { from: number; to: number }>,
  selectedId: string | null
): DecorationSet {
  const decs: Decoration[] = []
  for (const [id, r] of ranges) {
    if (r.from >= r.to) continue
    const isSelected = selectedId === id
    decs.push(
      Decoration.inline(r.from, r.to, {
        class: isSelected
          ? "comment-range-highlight comment-range-highlight--selected"
          : "comment-range-highlight",
        "data-comment-range-id": id,
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
        suppressInlineDecorations: () => false,
      }
    },

    addProseMirrorPlugins() {
      const opts = this.options
      return [
        new Plugin<CommentHighlightRangeState>({
          key: commentRangeHighlightPluginKey,
          state: {
            init(_, state) {
              return {
                ranges: initRangesFromStickers(state, opts.getStickers()),
              }
            },
            apply(tr, pluginState, oldState, newState) {
              const stickers = opts.getStickers()
              const meta = tr.getMeta(
                commentRangeHighlightPluginKey
              ) as CommentRangeHighlightMeta | undefined

              if (meta?.kind === "full-reset") {
                return {
                  ranges: initRangesFromStickers(newState, stickers),
                }
              }

              if (tr.docChanged) {
                if (isFullDocumentReplace(tr, oldState)) {
                  return {
                    ranges: initRangesFromStickers(newState, stickers),
                  }
                }
                let nextRanges = mapRangesOnDocChange(
                  tr,
                  pluginState.ranges,
                  newState
                )
                nextRanges = mergeNewStickerRanges(
                  nextRanges,
                  newState,
                  stickers
                )
                return { ranges: nextRanges }
              }

              if (meta?.kind === "sticker-sync") {
                return {
                  ranges: mergeNewStickerRanges(
                    pluginState.ranges,
                    newState,
                    stickers
                  ),
                }
              }

              if (meta?.kind === "selection") {
                return pluginState
              }

              return pluginState
            },
          },
          props: {
            decorations(state) {
              if (opts.suppressInlineDecorations?.()) return DecorationSet.empty
              const ps = commentRangeHighlightPluginKey.getState(state)
              if (!ps?.ranges?.size) return DecorationSet.empty
              return buildDecorationSetFromRanges(
                state,
                ps.ranges,
                opts.getSelectedId()
              )
            },
          },
        }),
      ]
    },
  }
)
