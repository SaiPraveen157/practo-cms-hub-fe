"use client"

import VideoPlayerTimeline from "@/components/VideoPlayerTimeline"
import { useLanguageVideoThreadComments } from "@/hooks/use-language-video-thread-comments"
import { addLanguageVideoComment } from "@/lib/language-packages-api"
import { canPostLanguageVideoThreadComment } from "@/lib/package-video-thread-comment-permissions"
import { useAuthStore } from "@/store"
import type { UserRole } from "@/types/auth"
import type { LanguageVideo } from "@/types/language-package"
import { toast } from "sonner"

export function LanguageVideoPlayerWithThread({
  languageVideo,
  fileUrl,
  mediaKey,
  videoClassName,
  onVideoError,
}: {
  languageVideo: LanguageVideo
  fileUrl: string
  mediaKey: string
  videoClassName?: string
  onVideoError?: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const role = user?.role as UserRole | undefined
  const { comments, refresh } = useLanguageVideoThreadComments(
    languageVideo.id,
    languageVideo.currentVersion
  )
  const allowPost = canPostLanguageVideoThreadComment(role, languageVideo)

  return (
    <VideoPlayerTimeline
      src={fileUrl}
      mediaKey={mediaKey}
      comments={comments}
      showCommentsUi
      commentFormDisabled={!allowPost}
      videoClassName={videoClassName}
      onVideoError={onVideoError}
      onAddComment={async ({ content, timestampSeconds }) => {
        if (!token) return
        await addLanguageVideoComment(token, languageVideo.id, {
          content,
          timestampSeconds,
          assetVersion: languageVideo.currentVersion,
        })
        await refresh()
        toast.success("Comment added")
      }}
    />
  )
}
