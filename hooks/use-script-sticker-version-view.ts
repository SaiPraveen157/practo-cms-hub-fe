"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  getScriptCommentVersions,
  getScriptCommentVersionDetail,
} from "@/lib/script-comments-api"
import type { ScriptCommentVersionSummary } from "@/types/script"
import type { ScriptFeedbackSticker } from "@/types/script"
import { recordFromStickerArray } from "@/lib/feedback-sticker-sync"

export type UseScriptStickerVersionViewOptions = {
  token: string | null
  scriptId: string
  enabled: boolean
  /** Resets selection to live when script revision changes. */
  refreshKey?: string | number
}

/**
 * Version dropdown lists API versions only (latest / current is the default selection).
 * Parent state is used when the selected version equals currentVersion; older versions
 * load GET /comments/versions/:v for read-only snapshot + stickers.
 */
export function useScriptStickerVersionView({
  token,
  scriptId,
  enabled,
  refreshKey,
}: UseScriptStickerVersionViewOptions) {
  const [pastVersions, setPastVersions] = useState<ScriptCommentVersionSummary[]>(
    []
  )
  const [currentVersion, setCurrentVersion] = useState<number | null>(null)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  /** Selected script version (stringified number). Defaults to currentVersion from API. */
  const [selectValue, setSelectValue] = useState("")
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [snapshotContent, setSnapshotContent] = useState<string | null>(null)
  const [snapshotStickers, setSnapshotStickers] = useState<
    Record<string, ScriptFeedbackSticker>
  >({})

  const loadVersionList = useCallback(() => {
    if (!token || !scriptId || !enabled) return
    setListLoading(true)
    setListError(null)
    getScriptCommentVersions(token, scriptId)
      .then((res) => {
        const past = res.versions ?? []
        const cv = res.currentVersion ?? null
        setCurrentVersion(cv)
        setPastVersions(past)
        const defaultVersion =
          cv ??
          (past.length > 0
            ? Math.max(...past.map((p) => p.version))
            : null)
        if (defaultVersion != null) {
          setSelectValue(String(defaultVersion))
        }
      })
      .catch((e) => {
        setListError(e instanceof Error ? e.message : "Failed to load versions")
        setPastVersions([])
        setCurrentVersion(null)
        setSelectValue("")
      })
      .finally(() => setListLoading(false))
  }, [token, scriptId, enabled])

  useEffect(() => {
    loadVersionList()
  }, [loadVersionList, refreshKey])

  useEffect(() => {
    setSelectValue("")
    setPastVersions([])
    setCurrentVersion(null)
  }, [refreshKey, scriptId])

  const selectedVersionNum = useMemo(() => {
    const n = parseInt(selectValue, 10)
    return Number.isNaN(n) ? null : n
  }, [selectValue])

  /** True when viewing an older (non-current) version — read-only snapshot from API. */
  const isViewingSnapshot = Boolean(
    currentVersion != null &&
      selectedVersionNum != null &&
      selectedVersionNum !== currentVersion
  )

  useEffect(() => {
    if (!token || !scriptId || !isViewingSnapshot || selectedVersionNum == null) {
      setSnapshotContent(null)
      setSnapshotStickers({})
      setSnapshotError(null)
      return
    }
    const n = selectedVersionNum
    let cancelled = false
    setSnapshotLoading(true)
    setSnapshotError(null)
    getScriptCommentVersionDetail(token, scriptId, n)
      .then((res) => {
        if (cancelled) return
        setSnapshotContent(res.content ?? null)
        setSnapshotStickers(recordFromStickerArray(res.comments ?? []))
      })
      .catch((e) => {
        if (!cancelled)
          setSnapshotError(
            e instanceof Error ? e.message : "Failed to load version"
          )
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, scriptId, isViewingSnapshot, selectedVersionNum])

  const versionOptions = useMemo(() => {
    const seen = new Set<number>()
    const nums: number[] = []
    if (currentVersion != null) {
      seen.add(currentVersion)
      nums.push(currentVersion)
    }
    for (const v of pastVersions) {
      if (!seen.has(v.version)) {
        seen.add(v.version)
        nums.push(v.version)
      }
    }
    nums.sort((a, b) => b - a)
    return nums.map((num) => {
      const isCur = currentVersion != null && num === currentVersion
      const summary = pastVersions.find((p) => p.version === num)
      /** Short label for the closed select — always `Version N`. */
      const triggerLabel = `Version ${num}`
      if (isCur) {
        return {
          version: num,
          triggerLabel,
          listLabel: `Version ${num} (current)`,
        }
      }
      if (summary) {
        return {
          version: num,
          triggerLabel,
          listLabel: `Version ${num} · ${summary.commentCount} comments${summary.openCount > 0 ? ` · ${summary.openCount} open` : ""}`,
        }
      }
      return {
        version: num,
        triggerLabel,
        listLabel: `Version ${num}`,
      }
    })
  }, [currentVersion, pastVersions])

  const hasVersionChoices = currentVersion != null || pastVersions.length > 0
  const showToolbar = Boolean(enabled && hasVersionChoices)

  const onSelectValueChange = useCallback((v: string | null) => {
    if (v == null || v === "") return
    setSelectValue(v)
  }, [])

  return {
    showToolbar,
    listLoading,
    listError,
    selectValue,
    onSelectValueChange,
    versionOptions,
    isViewingSnapshot,
    snapshotLoading,
    snapshotError,
    snapshotContent,
    snapshotStickers,
  }
}
