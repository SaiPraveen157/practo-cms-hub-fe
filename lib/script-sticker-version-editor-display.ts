import type { ScriptFeedbackSticker } from "@/types/script"

type VersionViewSlice = {
  isViewingSnapshot: boolean
  snapshotLoading: boolean
  snapshotError: string | null
  snapshotContent: string | null
  snapshotStickers: Record<string, ScriptFeedbackSticker>
}

export type VersionedEditorDisplay =
  | { mode: "live"; html: string; stickers: Record<string, ScriptFeedbackSticker> }
  | { mode: "loading" }
  | { mode: "error"; message: string }
  | {
      mode: "snapshot"
      html: string
      stickers: Record<string, ScriptFeedbackSticker>
      contentMissing: boolean
    }

/** Maps live editor state + version dropdown into what the single editor should show. */
export function getVersionedScriptEditorDisplay(
  versionView: VersionViewSlice,
  liveHtml: string,
  liveStickers: Record<string, ScriptFeedbackSticker>
): VersionedEditorDisplay {
  if (!versionView.isViewingSnapshot) {
    return { mode: "live", html: liveHtml, stickers: liveStickers }
  }
  if (versionView.snapshotLoading) return { mode: "loading" }
  if (versionView.snapshotError) {
    return { mode: "error", message: versionView.snapshotError }
  }
  return {
    mode: "snapshot",
    html: versionView.snapshotContent ?? "<p></p>",
    stickers: versionView.snapshotStickers,
    contentMissing: versionView.snapshotContent == null,
  }
}
