"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { getLanguageVideoComments } from "@/lib/language-packages-api"
import { videoThreadBlocksApprove } from "@/lib/video-comment"
import type { LanguageVideo } from "@/types/language-package"

function languageVideoKey(v: LanguageVideo) {
  return `${v.id}:${v.currentVersion}`
}

/**
 * Phase 7: per-video map of whether timestamp comments on the current version block approval.
 */
export function useLanguageVideoThreadBlockMap(
  token: string | null,
  videos: LanguageVideo[]
) {
  const videosRef = useRef(videos)
  videosRef.current = videos

  const entriesKey = useMemo(
    () => videos.map(languageVideoKey).sort().join("|"),
    [videos]
  )

  const [threadBlockByVideoId, setThreadBlockByVideoId] = useState<
    Record<string, boolean>
  >({})
  const [loading, setLoading] = useState(false)

  const recheckThreadBlocks = useCallback(async () => {
    const list = videosRef.current
    if (!token || list.length === 0) {
      setThreadBlockByVideoId({})
      return
    }
    setLoading(true)
    try {
      const next: Record<string, boolean> = {}
      await Promise.all(
        list.map(async (v) => {
          try {
            const comments = await getLanguageVideoComments(token, v.id)
            next[v.id] = videoThreadBlocksApprove(comments, v.currentVersion)
          } catch {
            next[v.id] = false
          }
        })
      )
      setThreadBlockByVideoId(next)
    } finally {
      setLoading(false)
    }
  }, [token, entriesKey])

  useEffect(() => {
    void recheckThreadBlocks()
  }, [recheckThreadBlocks])

  return { threadBlockByVideoId, recheckThreadBlocks, loading }
}
