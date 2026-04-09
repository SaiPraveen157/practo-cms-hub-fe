/**
 * Deliverable video uploads (Phase 6 packages, Phase 7 language packages, video presign).
 * Backend accepts: mp4, mov, mxf, webm, avi — validate before calling upload-url.
 */

const EXTENSIONS = new Set(["mp4", "mov", "mxf", "webm", "avi"])

const MIME_ALLOWLIST = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/avi",
  "video/msvideo",
  "application/mxf",
  "video/mxf",
  "application/x-mxf",
])

export const DELIVERABLE_VIDEO_FILE_ERROR =
  "Only MP4, MOV, MXF, WebM, or AVI video files are allowed."

/** HTML `accept` for file inputs that only pick deliverable videos. */
export const DELIVERABLE_VIDEO_INPUT_ACCEPT =
  ".mp4,.mov,.mxf,.webm,.avi,video/mp4,video/quicktime,video/webm,video/x-msvideo,video/avi,video/msvideo,application/mxf,video/mxf,application/x-mxf"

/** Phase 4 First Line Up: video or storyboard PDF/image. */
export const FIRST_LINE_UP_MIXED_INPUT_ACCEPT = `${DELIVERABLE_VIDEO_INPUT_ACCEPT},application/pdf,image/jpeg,image/png`

export function getFileNameExtension(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? ""
  const i = base.lastIndexOf(".")
  if (i < 0) return ""
  return base.slice(i + 1).toLowerCase()
}

/** True if the user is uploading a video file (vs PDF / image storyboard). */
export function fileLooksLikeVideoFile(file: File): boolean {
  const t = (file.type || "").toLowerCase()
  if (t.startsWith("video/")) return true
  return EXTENSIONS.has(getFileNameExtension(file.name))
}

/**
 * Enforce allowed types for a deliverable video. Call from upload helpers.
 * For mixed FLU inputs (video + PDF + image), use `assertDeliverableVideoFileIfVideo`.
 */
export function assertDeliverableVideoFile(file: File): void {
  const ext = getFileNameExtension(file.name)
  const t = (file.type || "").toLowerCase()

  if (ext && EXTENSIONS.has(ext)) return
  if (MIME_ALLOWLIST.has(t)) return
  // Empty MIME with known extension
  if (!t && ext && EXTENSIONS.has(ext)) return

  throw new Error(DELIVERABLE_VIDEO_FILE_ERROR)
}

/** If the selection is a video, it must be an allowed deliverable type. */
export function assertDeliverableVideoFileIfVideo(file: File): void {
  if (!fileLooksLikeVideoFile(file)) return
  assertDeliverableVideoFile(file)
}
