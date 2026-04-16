import type { Editor } from "@tiptap/core"

export const FEEDBACK_STICKER_NODE = "feedbackSticker"

/** Remove inline sticker nodes not present in the map (or all when map is empty). */
export function pruneOrphanFeedbackStickerNodes(
  editor: Editor,
  stickerIdsInMap: Set<string>
): void {
  const mapEmpty = stickerIdsInMap.size === 0
  const ranges: { from: number; to: number }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== FEEDBACK_STICKER_NODE) return true
    const fid = String(node.attrs.feedbackId ?? "")
    if (mapEmpty || !stickerIdsInMap.has(fid)) {
      ranges.push({ from: pos, to: pos + node.nodeSize })
    }
    return true
  })
  if (ranges.length === 0) return
  ranges.sort((a, b) => b.from - a.from)
  let chain = editor.chain()
  for (const r of ranges) {
    chain = chain.deleteRange({ from: r.from, to: r.to })
  }
  chain.run()
}

export function collectFeedbackStickerIdsFromEditor(editor: Editor | null): string[] {
  if (!editor) return []
  const ids: string[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === FEEDBACK_STICKER_NODE && node.attrs.feedbackId) {
      ids.push(String(node.attrs.feedbackId))
    }
    return true
  })
  return ids
}

export function stickerOrdinalInDoc(editor: Editor | null, feedbackId: string): number {
  if (!editor) return 0
  let n = 0
  let found = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === FEEDBACK_STICKER_NODE && node.attrs.feedbackId) {
      n += 1
      if (String(node.attrs.feedbackId) === feedbackId) found = n
    }
    return true
  })
  return found
}

/** Position directly before the inline `feedbackSticker` node (for selection / scroll). */
export function findFeedbackStickerPos(
  editor: Editor | null,
  feedbackId: string
): number | null {
  if (!editor) return null
  let found: number | null = null
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === FEEDBACK_STICKER_NODE && String(node.attrs.feedbackId) === feedbackId) {
      found = pos
      return false
    }
    return true
  })
  return found
}

export function scrollCommentAnchorIntoView(
  root: HTMLElement | null,
  feedbackId: string
): void {
  if (!root || !feedbackId) return
  const safe =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(feedbackId)
      : feedbackId.replace(/["\\]/g, "")
  const el = root.querySelector<HTMLElement>(`[data-comment-anchor="${safe}"]`)
  el?.scrollIntoView({ block: "nearest", behavior: "smooth" })
}
