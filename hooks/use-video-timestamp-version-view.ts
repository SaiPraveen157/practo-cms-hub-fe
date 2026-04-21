"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  getVideoVersionDetail,
  getVideoVersionsList,
} from "@/lib/videos-api"
import type { VideoVersionDetailView, VideoVersionListEntry } from "@/types/video"

export type UseVideoTimestampVersionViewOptions = {
  token: string | null
  /** Current video row id from the route (same id sent to GET …/versions). */
  currentVideoId: string
  /** `video.version` from GET /api/videos/:id — live row. */
  liveVideoVersion: number
  /** When false, skip version APIs (e.g. non-video file). */
  enabled: boolean
  /** Bump when the current row or its version changes so selection resets to live. */
  refreshKey: string | number
}

/**
 * Version dropdown for Phase 4–5 timestamp comments (same UX pattern as
 * {@link useScriptStickerVersionView}).
 *
 * - GET /api/videos/:id/versions for the list
 * - GET /api/videos/:id/versions/:version when user picks an older version
 * - Live row uses parent-fetched comments; archived rows use detail.comments
 */
export function useVideoTimestampVersionView({
  token,
  currentVideoId,
  liveVideoVersion,
  enabled,
  refreshKey,
}: UseVideoTimestampVersionViewOptions) {
  const [rows, setRows] = useState<VideoVersionListEntry[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selectValue, setSelectValue] = useState("")
  const [detail, setDetail] = useState<VideoVersionDetailView | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const loadList = useCallback(() => {
    if (!token || !currentVideoId || !enabled) {
      setRows([])
      setListError(null)
      return
    }
    setListLoading(true)
    setListError(null)
    getVideoVersionsList(token, currentVideoId)
      .then((res) => {
        setRows(res.versions ?? [])
        const cv =
          res.currentVersion ??
          (res.versions.length > 0
            ? Math.max(...res.versions.map((r) => r.version))
            : null)
        const pick =
          cv != null && Number.isFinite(cv)
            ? cv
            : Number.isFinite(liveVideoVersion) && liveVideoVersion >= 1
              ? liveVideoVersion
              : null
        if (pick != null) setSelectValue(String(pick))
      })
      .catch((e) => {
        setListError(e instanceof Error ? e.message : "Failed to load versions")
        setRows([])
        setSelectValue(
          Number.isFinite(liveVideoVersion) && liveVideoVersion >= 1
            ? String(liveVideoVersion)
            : ""
        )
      })
      .finally(() => setListLoading(false))
  }, [token, currentVideoId, enabled, liveVideoVersion])

  useEffect(() => {
    loadList()
  }, [loadList, refreshKey])

  const selectedVersionNum = useMemo(() => {
    const n = parseInt(selectValue, 10)
    return Number.isNaN(n) ? null : n
  }, [selectValue])

  const isViewingArchived = Boolean(
    selectedVersionNum != null &&
      selectedVersionNum !== liveVideoVersion
  )

  useEffect(() => {
    if (!token || !currentVideoId || !isViewingArchived || selectedVersionNum == null) {
      setDetail(null)
      setDetailError(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    getVideoVersionDetail(token, currentVideoId, selectedVersionNum)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((e) => {
        if (!cancelled)
          setDetailError(
            e instanceof Error ? e.message : "Failed to load version"
          )
        if (!cancelled) setDetail(null)
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, currentVideoId, isViewingArchived, selectedVersionNum])

  const versionOptions = useMemo(() => {
    const seen = new Set<number>()
    const nums: number[] = []
    if (Number.isFinite(liveVideoVersion) && liveVideoVersion >= 1) {
      seen.add(liveVideoVersion)
      nums.push(liveVideoVersion)
    }
    for (const r of rows) {
      if (!seen.has(r.version)) {
        seen.add(r.version)
        nums.push(r.version)
      }
    }
    nums.sort((a, b) => b - a)
    return nums.map((num) => {
      const summary = rows.find((p) => p.version === num)
      const cc = summary?.commentCount
      const label =
        typeof cc === "number"
          ? `v${num} ${cc} comment${cc === 1 ? "" : "s"}`
          : `v${num}`
      return { version: num, triggerLabel: label, listLabel: label }
    })
  }, [liveVideoVersion, rows])

  /** Hide toolbar when only one version exists and list loaded successfully. */
  const showToolbarResolved = useMemo(() => {
    if (!enabled) return false
    if (listLoading && rows.length === 0) return true
    if (listError) return false
    if (rows.length === 0) return false
    const distinct = new Set(rows.map((r) => r.version))
    distinct.add(liveVideoVersion)
    return distinct.size > 1
  }, [enabled, listLoading, listError, rows, liveVideoVersion])

  const onSelectValueChange = useCallback((v: string | null) => {
    if (v == null || v === "") return
    setSelectValue(v)
  }, [])

  return {
    showToolbar: showToolbarResolved,
    listLoading,
    listError,
    selectValue,
    onSelectValueChange,
    versionOptions,
    isViewingArchived,
    detailLoading,
    detailError,
    archivedDetail: detail,
  }
}
