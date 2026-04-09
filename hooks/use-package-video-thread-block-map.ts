"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { getPackageVideoComments } from "@/lib/packages-api"
import { videoThreadBlocksApprove } from "@/lib/video-comment"
import type { PackageVideo } from "@/types/package"

/**
 * For Phase 6 deliverables: whether each video still has timestamp comments on the
 * current asset version (blocks approve until cleared — see `videoThreadBlocksApprove`).
 */
export function usePackageVideoThreadBlockMap(
  token: string | null,
  videos: PackageVideo[]
) {
  const videosRef = useRef(videos)
  videosRef.current = videos

  const entriesKey = useMemo(
    () =>
      videos
        .map((v) => `${v.id}:${v.currentVersion}`)
        .sort()
        .join("|"),
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
            const comments = await getPackageVideoComments(token, v.id)
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
