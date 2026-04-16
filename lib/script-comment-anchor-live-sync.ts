import type { Editor } from "@tiptap/core"
import type { ScriptCommentAnchor, ScriptFeedbackSticker } from "@/types/script"
import { commentAnchorOffsetsForRange } from "@/lib/script-comment-offsets"

function anchorEqual(
  a: ScriptCommentAnchor | undefined,
  b: ScriptCommentAnchor | undefined
): boolean {
  if (!a || !b) return a === b
  return (
    a.space === b.space &&
    a.startOffset === b.startOffset &&
    a.endOffset === b.endOffset &&
    a.contentVersion === b.contentVersion
  )
}

/**
 * Builds updated sticker records with anchors derived from live PM highlight ranges.
 * Returns the same `stickers` reference if nothing changed.
 */
export function feedbackStickersWithAnchorsFromLiveRanges(
  stickers: Record<string, ScriptFeedbackSticker>,
  editor: Editor,
  ranges: Map<string, { from: number; to: number }>
): Record<string, ScriptFeedbackSticker> {
  let next: Record<string, ScriptFeedbackSticker> | null = null
  const state = editor.state

  for (const [id, r] of ranges) {
    const s = stickers[id]
    if (!s?.anchor) continue
    if (r.from >= r.to) continue

    let newAnchor: ScriptCommentAnchor
    if (s.anchor.space === "plain_text_utf16") {
      const { startOffset, endOffset } = commentAnchorOffsetsForRange(
        state,
        r.from,
        r.to
      )
      newAnchor = { ...s.anchor, startOffset, endOffset }
    } else {
      newAnchor = {
        ...s.anchor,
        startOffset: r.from,
        endOffset: r.to,
      }
    }

    if (!anchorEqual(s.anchor, newAnchor)) {
      if (!next) next = { ...stickers }
      next[id] = { ...s, anchor: newAnchor }
    }
  }

  return next ?? stickers
}
