import type { Editor } from "@tiptap/core"
import type { EditorState } from "@tiptap/pm/state"

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
