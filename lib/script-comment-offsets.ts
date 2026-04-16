import type { Editor } from "@tiptap/core"
import type { EditorState } from "@tiptap/pm/state"
import type { ScriptCommentAnchor } from "@/types/script"

const BLOCK_SEP = "\n"

/**
 * Plain-text projection of the script body used for {@link ScriptCommentAnchor}
 * when `space === "plain_text_utf16"`.
 * Uses the same block separator as Tiptap `getText({ blockSeparator: "\n" })` / ProseMirror
 * `textBetween` with `"\n"` between blocks so offsets stay stable for a given document.
 */
export function editorPlainTextForCommentOffsets(editor: Editor): string {
  return editor.getText({ blockSeparator: BLOCK_SEP })
}

/**
 * Maps the selection in `state` to UTF-16 offsets in the same plain-text projection as
 * `editor.getText({ blockSeparator: "\\n" })`.
 * - `startOffset` inclusive, `endOffset` exclusive (half-open `[start, end)`).
 * - Collapsed selection → `startOffset === endOffset`.
 */
export function commentAnchorOffsetsFromEditorState(state: EditorState): {
  startOffset: number
  endOffset: number
} {
  const { from, to } = state.selection
  const doc = state.doc
  const startOffset = doc.textBetween(0, from, BLOCK_SEP).length
  const endOffset = doc.textBetween(0, to, BLOCK_SEP).length
  return { startOffset, endOffset }
}

/** Same as {@link commentAnchorOffsetsFromEditorState} using the TipTap editor instance. */
export function commentAnchorFromEditorSelection(editor: Editor): {
  startOffset: number
  endOffset: number
} {
  return commentAnchorOffsetsFromEditorState(editor.state)
}

/**
 * UTF-16 offsets for an arbitrary document range `[from, to)` in the same plain-text
 * projection as {@link commentAnchorOffsetsFromEditorState}.
 */
export function commentAnchorOffsetsForRange(
  state: EditorState,
  from: number,
  to: number
): { startOffset: number; endOffset: number } {
  const doc = state.doc
  const startOffset = doc.textBetween(0, from, BLOCK_SEP).length
  const endOffset = doc.textBetween(0, to, BLOCK_SEP).length
  return { startOffset, endOffset }
}

/**
 * Maps a UTF-16 offset in the same plain-text projection as {@link commentAnchorOffsetsFromEditorState}
 * to a ProseMirror position (0…doc.content.size). Used to place inline stickers after `endOffset`
 * characters of body text for `plain_text_utf16` anchors from the API.
 */
export function proseMirrorPosFromPlainTextOffset(
  state: EditorState,
  offset: number
): number {
  const doc = state.doc
  const maxLen = doc.textBetween(0, doc.content.size, BLOCK_SEP).length
  const target = Math.max(0, Math.min(offset, maxLen))
  let low = 0
  let high = doc.content.size
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2)
    const len = doc.textBetween(0, mid, BLOCK_SEP).length
    if (len <= target) low = mid
    else high = mid - 1
  }
  return low
}

/**
 * ProseMirror position where an inline sticker should be inserted for a stored {@link ScriptCommentAnchor}.
 * Uses `endOffset` for both spaces (end of highlighted range / insertion point).
 */
export function insertionPosForCommentAnchor(
  state: EditorState,
  anchor: ScriptCommentAnchor
): number | null {
  if (anchor.space === "plain_text_utf16") {
    return proseMirrorPosFromPlainTextOffset(state, anchor.endOffset)
  }
  if (anchor.space === "prosemirror_pos") {
    const pos = anchor.endOffset
    if (!Number.isFinite(pos) || pos < 0 || pos > state.doc.content.size) return null
    return pos
  }
  return null
}

/**
 * Document range `[from, to)` for highlighting the passage tied to a comment anchor
 * (same coordinate space as {@link commentAnchorOffsetsFromEditorState}).
 */
export function commentHighlightRangeFromAnchor(
  state: EditorState,
  anchor: ScriptCommentAnchor
): { from: number; to: number } | null {
  if (anchor.space === "plain_text_utf16") {
    const from = proseMirrorPosFromPlainTextOffset(state, anchor.startOffset)
    const to = proseMirrorPosFromPlainTextOffset(state, anchor.endOffset)
    if (from >= to || from < 0 || to > state.doc.content.size) return null
    return { from, to }
  }
  if (anchor.space === "prosemirror_pos") {
    const from = anchor.startOffset
    const to = anchor.endOffset
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from >= to ||
      from < 0 ||
      to > state.doc.content.size
    ) {
      return null
    }
    return { from, to }
  }
  return null
}

/**
 * Best-effort plain text when there is no editor (e.g. SSR or validation on server).
 * Prefer computing offsets from the TipTap editor when the user is authoring.
 */
export function scriptHtmlToPlainTextForCommentOffsets(html: string): string {
  if (!html.trim()) return ""
  if (typeof document === "undefined") {
    return html
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  }
  const el = document.createElement("div")
  el.innerHTML = html
  return (el.innerText || el.textContent || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
}
