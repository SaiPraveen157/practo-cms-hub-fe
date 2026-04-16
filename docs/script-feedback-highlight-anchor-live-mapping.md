# Script feedback highlight anchors — live mapping (frontend)

## Problem

Comment thread highlights are tied to `ScriptCommentAnchor` (`startOffset` / `endOffset` in `plain_text_utf16` or `prosemirror_pos`). If the UI recomputed highlights **only** from those stored offsets on every keystroke, edits **elsewhere** in the script shifted the plain-text stream so the highlight no longer covered the same words.

## Solution (implemented)

1. **ProseMirror plugin state** (`CommentRangeHighlight` in `components/tiptap/comment-range-highlight-extension.ts`) keeps a **live** `Map<stickerId, { from, to }>` in document positions.

2. On **document edits**, ranges are updated with `tr.mapping` (same approach as mapped marks / decorations in ProseMirror).

3. **Full body replace** (e.g. TipTap `setContent` when switching script version) is detected via `ReplaceStep` covering the whole document, or via an explicit `{ kind: "full-reset" }` meta after `contentSyncKey` loads. In those cases ranges are **rebuilt** from the current sticker anchors and document, not mapped from the previous unrelated document.

4. When the **sticker list** changes without a doc edit (new thread, removed thread), `{ kind: "sticker-sync" }` merges: remove missing ids, add new ids from `commentHighlightRangeFromAnchor`, **keep** existing ids’ live ranges (do not overwrite with stale API offsets).

5. **Persistence**: After edits, `ScriptRichTextEditor` **debounces** (400ms) and merges **updated anchors** into local `feedbackStickers` via `feedbackStickersWithAnchorsFromLiveRanges` (`lib/script-comment-anchor-live-sync.ts`). **`PATCH /api/scripts/:scriptId/comments/:commentId` is not used for anchor-only changes** (see `useScriptCommentsRemoteSync`: skip when only `anchor` drifted). Updated anchors are sent on **draft save** with `PATCH /api/scripts/:id` and `comments` (Medical Affairs + Agency POC `handleSave`), or when the user edits comment text / resolves a thread (comments sub-API).

## Backend / API

**No database or API schema changes are required.** The existing fields remain the source of truth for persistence:

- `anchor_space` (`plain_text_utf16` | `prosemirror_pos`)
- `start_offset`, `end_offset`
- Optional `anchor_content_version` (if the backend uses it for staleness)

### Behavioural note for API consumers

- On **script update** (`PATCH` / save body), the client may send **updated** `start_offset` / `end_offset` for feedback stickers when the user edited the script body, so anchors stay aligned with the revised HTML/plain-text projection.
- The backend should continue to **store** whatever offsets the client sends (subject to existing validation), same as today.

### Optional future backend improvements (not required for this feature)

- **Validation**: Reject or clamp offsets that are out of range for the saved `content` length (if not already done).
- **Conflict handling**: If two clients edit the same script concurrently, offsets may conflict; resolving that remains a general collaboration concern, not specific to this mapping layer.

## Related files

- `components/tiptap/comment-range-highlight-extension.ts` — plugin state, mapping, meta kinds
- `components/script-rich-text-editor.tsx` — debounced anchor sync, sticker-sync vs selection refresh
- `lib/script-comment-anchor-live-sync.ts` — merge live ranges into sticker records
- `lib/script-comment-offsets.ts` — `commentAnchorOffsetsForRange`, `commentHighlightRangeFromAnchor`
