"use client"

import { useMemo } from "react"
import VideoPlayerTimeline from "@/components/VideoPlayerTimeline"
import { VideoVersionHistoryToolbar } from "@/components/video-version-history-toolbar"
import { useLanguageVideoThreadComments } from "@/hooks/use-language-video-thread-comments"
import { useVideoTimestampVersionView } from "@/hooks/use-video-timestamp-version-view"
import {
  addLanguageVideoComment,
  languageVideoTimestampVersionApis,
} from "@/lib/language-packages-api"
import { canPostLanguageVideoThreadComment } from "@/lib/package-video-thread-comment-permissions"
import { useAuthStore } from "@/store"
import type { UserRole } from "@/types/auth"
import type { LanguageVideo } from "@/types/language-package"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

export function LanguageVideoPlayerWithThread({
  languageVideo,
  fileUrl,
  mediaKey: _mediaKey,
  videoClassName,
  onVideoError,
  onCommentsUpdated,
}: {
  languageVideo: LanguageVideo
  fileUrl: string
  /** @deprecated Ignored — media key is derived from version selection. */
  mediaKey?: string
  videoClassName?: string
  onVideoError?: () => void
  /** After a timestamp comment is saved — parent can refresh thread-block / approve state. */
  onCommentsUpdated?: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const role = user?.role as UserRole | undefined
  const { comments, refresh } = useLanguageVideoThreadComments(
    languageVideo.id,
    languageVideo.currentVersion
  )
  const allowPost = canPostLanguageVideoThreadComment(role, languageVideo)

  const versionHistoryEnabled = Boolean(fileUrl && languageVideo.id)

  const versionHistory = useVideoTimestampVersionView({
    token,
    currentVideoId: languageVideo.id,
    liveVideoVersion: languageVideo.currentVersion ?? 1,
    enabled: versionHistoryEnabled,
    refreshKey: `${languageVideo.id}-${languageVideo.currentVersion ?? 0}`,
    apis: languageVideoTimestampVersionApis,
  })

  const timelineComments = useMemo(() => {
    if (
      versionHistory.isViewingArchived &&
      versionHistory.archivedDetail?.comments
    ) {
      return versionHistory.archivedDetail.comments
    }
    return comments
  }, [
    versionHistory.isViewingArchived,
    versionHistory.archivedDetail,
    comments,
  ])

  const timelineSrc =
    versionHistory.isViewingArchived &&
    versionHistory.archivedDetail?.fileUrl
      ? versionHistory.archivedDetail.fileUrl
      : fileUrl

  const timelineMediaKey =
    versionHistory.isViewingArchived && versionHistory.archivedDetail
      ? `${versionHistory.archivedDetail.id}-v${versionHistory.archivedDetail.version}`
      : `${languageVideo.id}-v${languageVideo.currentVersion ?? 1}`

  return (
    <div className="space-y-4">
      {versionHistory.listError ? (
        <p className="text-xs text-muted-foreground">{versionHistory.listError}</p>
      ) : null}
      {versionHistory.detailError ? (
        <p className="text-xs text-destructive">{versionHistory.detailError}</p>
      ) : null}
      <VideoVersionHistoryToolbar
        showToolbar={versionHistory.showToolbar}
        listLoading={versionHistory.listLoading}
        selectValue={versionHistory.selectValue}
        onSelectValueChange={versionHistory.onSelectValueChange}
        versionOptions={versionHistory.versionOptions}
        isViewingArchived={versionHistory.isViewingArchived}
        detailLoading={versionHistory.detailLoading}
        id={`lang-video-version-${languageVideo.id}`}
      />
      {timelineSrc ? (
        <VideoPlayerTimeline
          src={timelineSrc}
          mediaKey={timelineMediaKey}
          comments={timelineComments}
          showCommentsUi
          commentFormDisabled={
            !allowPost || versionHistory.isViewingArchived
          }
          videoClassName={videoClassName}
          onVideoError={onVideoError}
          onAddComment={
            allowPost && !versionHistory.isViewingArchived
              ? async ({ content, timestampSeconds }) => {
                  if (!token) return
                  await addLanguageVideoComment(token, languageVideo.id, {
                    content,
                    timestampSeconds,
                    assetVersion: languageVideo.currentVersion,
                  })
                  await refresh()
                  onCommentsUpdated?.()
                  toast.success("Comment added")
                }
              : undefined
          }
        />
      ) : versionHistory.isViewingArchived && versionHistory.detailLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading file for this version…
        </p>
      ) : versionHistory.isViewingArchived ? (
        <p className="text-sm text-muted-foreground">
          No video file for this version.
        </p>
      ) : null}
    </div>
  )
}
