"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { getPackageVideoComments } from "@/lib/packages-api"
import {
  filterVideoCommentsForAssetVersion,
  filterVideoCommentsWithTimestamp,
} from "@/lib/video-comment"
import { useAuthStore } from "@/store"
import type { VideoComment } from "@/types/video"

export function usePackageVideoThreadComments(
  videoId: string | null | undefined,
  /** When set, only comments for this package video `currentVersion` are shown. */
  assetVersion?: number | null
) {
  const token = useAuthStore((s) => s.token)
  const [comments, setComments] = useState<VideoComment[]>([])

  const refresh = useCallback(async () => {
    if (!token || !videoId) {
      setComments([])
      return
    }
    try {
      const list = await getPackageVideoComments(token, videoId)
      setComments(list)
    } catch {
      setComments([])
    }
  }, [token, videoId])

  useEffect(() => {
    void refresh()
  }, [refresh, assetVersion])

  const scoped = useMemo(() => {
    const byVersion =
      assetVersion == null ||
      !Number.isFinite(assetVersion) ||
      assetVersion < 1
        ? comments
        : filterVideoCommentsForAssetVersion(comments, assetVersion)
    return filterVideoCommentsWithTimestamp(byVersion)
  }, [comments, assetVersion])

  return { comments: scoped, refresh }
}
