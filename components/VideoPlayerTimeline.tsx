"use client"

import * as React from "react"
import gsap from "gsap"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  filterVideoCommentsWithTimestamp,
  getVideoCommentTimestampSeconds,
} from "@/lib/video-comment"
import { formatVideoTimestamp } from "@/lib/video-timestamp"
import type { VideoComment } from "@/types/video"
import { VideoCommentTimestampPill } from "@/components/video-comment-timestamp-pill"
import {
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react"

/** @deprecated Import from `@/lib/video-timestamp` instead. */
export { formatVideoTimestamp } from "@/lib/video-timestamp"

export type VideoPlayerTimelineProps = {
  src: string
  poster?: string
  /** Remount video when URL changes (e.g. package asset id + file URL). Defaults to `src`. */
  mediaKey?: string
  /** Timestamp-only video thread comments; entries without `timestampSeconds` are not shown. */
  comments?: VideoComment[]
  /** Fired when the user picks a time on the timeline (seeks the player). */
  onTimestampSelect?: (seconds: number) => void
  /** Submit feedback tied to `selectedTimestampSeconds`. */
  onAddComment?: (payload: {
    content: string
    timestampSeconds: number
  }) => void | Promise<void>
  className?: string
  /** Extra classes on the `<video>` element (overrides default `aspect-video` when you pass sizing). */
  videoClassName?: string
  /** Inline playback on iOS; enabled by default. */
  playsInline?: boolean
  onVideoError?: () => void
  /** Disable the comment form (e.g. read-only role). */
  commentFormDisabled?: boolean
  /**
   * When false, only the player + scrub timeline are shown (no comment form, no comments list).
   * Use for package previews and other non–video-review contexts.
   */
  showCommentsUi?: boolean
}

function useVideoDuration(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  mediaSyncKey: string
) {
  const [duration, setDuration] = React.useState(0)

  React.useEffect(() => {
    const el = videoRef.current
    if (!el) return

    const onMeta = () => setDuration(el.duration || 0)

    el.addEventListener("loadedmetadata", onMeta)
    el.addEventListener("durationchange", onMeta)

    if (el.readyState >= 1) onMeta()

    return () => {
      el.removeEventListener("loadedmetadata", onMeta)
      el.removeEventListener("durationchange", onMeta)
    }
  }, [videoRef, mediaSyncKey])

  return duration
}

export default function VideoPlayerTimeline({
  src,
  poster,
  mediaKey,
  comments = [],
  onTimestampSelect,
  onAddComment,
  className,
  videoClassName,
  playsInline = true,
  onVideoError,
  commentFormDisabled = false,
  showCommentsUi = true,
}: VideoPlayerTimelineProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const trackRef = React.useRef<HTMLDivElement>(null)
  const playerContainerRef = React.useRef<HTMLDivElement>(null)
  const lastNonZeroVolumeRef = React.useRef(1)

  const videoSyncKey = mediaKey ?? src

  const duration = useVideoDuration(videoRef, videoSyncKey)

  const progressFillRef = React.useRef<HTMLDivElement>(null)
  const playheadRef = React.useRef<HTMLDivElement>(null)
  const timeElapsedRef = React.useRef<HTMLSpanElement>(null)
  const settersRef = React.useRef<{
    setWidth: ReturnType<typeof gsap.quickSetter>
    setLeft: ReturnType<typeof gsap.quickSetter>
  } | null>(null)
  const scrubPreviewRatioRef = React.useRef<number | null>(null)
  const isDraggingRef = React.useRef(false)
  const wasPlayingBeforeDragRef = React.useRef(false)
  const ariaThrottleRef = React.useRef(0)

  const [isDragging, setIsDragging] = React.useState(false)
  const [ariaSliderTime, setAriaSliderTime] = React.useState(0)

  const [selectedTimestampSeconds, setSelectedTimestampSeconds] =
    React.useState<number | null>(null)
  const [draft, setDraft] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [playing, setPlaying] = React.useState(false)
  const [volume, setVolume] = React.useState(1)
  const [muted, setMuted] = React.useState(false)
  const [fullscreen, setFullscreen] = React.useState(false)

  React.useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    el.addEventListener("play", onPlay)
    el.addEventListener("pause", onPause)
    setPlaying(!el.paused)
    return () => {
      el.removeEventListener("play", onPlay)
      el.removeEventListener("pause", onPause)
    }
  }, [videoSyncKey])

  React.useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const syncVol = () => {
      setVolume(el.volume)
      setMuted(el.muted)
      if (el.volume > 0 && !el.muted) {
        lastNonZeroVolumeRef.current = el.volume
      }
    }
    el.addEventListener("volumechange", syncVol)
    syncVol()
    return () => el.removeEventListener("volumechange", syncVol)
  }, [videoSyncKey])

  React.useEffect(() => {
    const onFs = () => {
      const node = playerContainerRef.current
      setFullscreen(
        !!document.fullscreenElement && document.fullscreenElement === node
      )
    }
    document.addEventListener("fullscreenchange", onFs)
    return () => document.removeEventListener("fullscreenchange", onFs)
  }, [])

  const toggleMute = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const el = videoRef.current
    if (!el) return
    if (el.muted || el.volume === 0) {
      el.muted = false
      const v =
        lastNonZeroVolumeRef.current > 0 ? lastNonZeroVolumeRef.current : 0.8
      el.volume = v
    } else {
      lastNonZeroVolumeRef.current = el.volume
      el.muted = true
    }
  }, [])

  const onVolumeInput = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation()
      const el = videoRef.current
      if (!el) return
      const v = Number(e.target.value)
      el.volume = v
      el.muted = v === 0
      if (v > 0) lastNonZeroVolumeRef.current = v
    },
    []
  )

  const toggleFullscreen = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const node = playerContainerRef.current
    if (!node) return
    if (!document.fullscreenElement) {
      void node.requestFullscreen().catch(() => {})
    } else {
      void document.exitFullscreen()
    }
  }, [])

  const effectiveDuration =
    Number.isFinite(duration) && duration > 0 ? duration : 0

  const syncProgressDisplay = React.useCallback(() => {
    const el = videoRef.current
    const setters = settersRef.current
    const timeEl = timeElapsedRef.current
    if (!setters || effectiveDuration <= 0) {
      if (timeEl && el) {
        timeEl.textContent = formatVideoTimestamp(el.currentTime)
      }
      return
    }

    let ratio: number
    if (isDraggingRef.current && scrubPreviewRatioRef.current != null) {
      ratio = scrubPreviewRatioRef.current
    } else if (el) {
      ratio = el.currentTime / effectiveDuration
    } else {
      return
    }
    const pct = Math.min(100, Math.max(0, ratio * 100))
    setters.setWidth(pct)
    setters.setLeft(pct)
    if (timeEl) {
      const t =
        isDraggingRef.current && scrubPreviewRatioRef.current != null
          ? scrubPreviewRatioRef.current * effectiveDuration
          : el!.currentTime
      timeEl.textContent = formatVideoTimestamp(t)
    }
  }, [effectiveDuration])

  React.useLayoutEffect(() => {
    const fill = progressFillRef.current
    const head = playheadRef.current
    if (!fill || !head) {
      settersRef.current = null
      return
    }
    settersRef.current = {
      setWidth: gsap.quickSetter(fill, "width", "%"),
      setLeft: gsap.quickSetter(head, "left", "%"),
    }
    syncProgressDisplay()
  }, [videoSyncKey, effectiveDuration, syncProgressDisplay])

  React.useEffect(() => {
    if (effectiveDuration <= 0) return
    if (!playing && !isDragging) {
      syncProgressDisplay()
      const el = videoRef.current
      setAriaSliderTime(el?.currentTime ?? 0)
      return
    }
    let rafId = 0
    const tick = () => {
      syncProgressDisplay()
      const el = videoRef.current
      // Keep comment timestamp pill in sync with playhead while playing (not while scrub-dragging).
      if (
        el &&
        showCommentsUi &&
        onAddComment &&
        !commentFormDisabled &&
        !isDraggingRef.current &&
        !el.paused
      ) {
        setSelectedTimestampSeconds(el.currentTime)
      }
      const now = performance.now()
      if (now - ariaThrottleRef.current > 200) {
        ariaThrottleRef.current = now
        const el = videoRef.current
        if (!el) return
        if (isDraggingRef.current && scrubPreviewRatioRef.current != null) {
          setAriaSliderTime(scrubPreviewRatioRef.current * effectiveDuration)
        } else {
          setAriaSliderTime(el.currentTime)
        }
      }
      rafId = requestAnimationFrame(tick)
    }
    ariaThrottleRef.current = performance.now()
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [
    playing,
    isDragging,
    effectiveDuration,
    syncProgressDisplay,
    showCommentsUi,
    onAddComment,
    commentFormDisabled,
  ])

  React.useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onSeeked = () => {
      if (!isDraggingRef.current) {
        requestAnimationFrame(() => syncProgressDisplay())
      }
    }
    el.addEventListener("seeked", onSeeked)
    return () => el.removeEventListener("seeked", onSeeked)
  }, [videoSyncKey, syncProgressDisplay])

  const seekTo = React.useCallback(
    (seconds: number) => {
      const el = videoRef.current
      if (!el || !Number.isFinite(seconds)) return
      const clamped = Math.max(0, Math.min(seconds, el.duration || seconds))
      el.currentTime = clamped
      if (showCommentsUi) {
        setSelectedTimestampSeconds(clamped)
      }
      onTimestampSelect?.(clamped)
      requestAnimationFrame(() => syncProgressDisplay())
    },
    [onTimestampSelect, showCommentsUi, syncProgressDisplay]
  )

  const getRatioFromClientX = React.useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track || effectiveDuration <= 0) return 0
      const rect = track.getBoundingClientRect()
      const w = rect.width
      if (w <= 0) return 0
      return Math.max(0, Math.min(1, (clientX - rect.left) / w))
    },
    [effectiveDuration]
  )

  const togglePlay = React.useCallback(() => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) void el.play().catch(() => {})
    else el.pause()
  }, [])

  const onTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (effectiveDuration <= 0) return
    e.preventDefault()
    e.stopPropagation()
    const el = videoRef.current
    if (!el) return
    wasPlayingBeforeDragRef.current = !el.paused
    el.pause()
    scrubPreviewRatioRef.current = getRatioFromClientX(e.clientX)
    if (showCommentsUi && scrubPreviewRatioRef.current != null) {
      setSelectedTimestampSeconds(
        scrubPreviewRatioRef.current * effectiveDuration
      )
    }
    isDraggingRef.current = true
    setIsDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    scrubPreviewRatioRef.current = getRatioFromClientX(e.clientX)
    if (
      showCommentsUi &&
      effectiveDuration > 0 &&
      scrubPreviewRatioRef.current != null
    ) {
      setSelectedTimestampSeconds(
        scrubPreviewRatioRef.current * effectiveDuration
      )
    }
  }

  const finishTimelineScrub = React.useCallback(() => {
    if (!isDraggingRef.current) return
    const el = videoRef.current
    const ratio = scrubPreviewRatioRef.current
    isDraggingRef.current = false
    scrubPreviewRatioRef.current = null
    setIsDragging(false)
    if (el && effectiveDuration > 0 && ratio != null) {
      seekTo(ratio * effectiveDuration)
    }
    if (el && wasPlayingBeforeDragRef.current) {
      void el.play()
    }
    if (el) setAriaSliderTime(el.currentTime)
  }, [effectiveDuration, seekTo])

  const onTrackPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    finishTimelineScrub()
  }

  const onTrackKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return
    e.preventDefault()
    const track = trackRef.current
    if (!track || effectiveDuration <= 0) return
    const rect = track.getBoundingClientRect()
    const ratio = Math.max(
      0,
      Math.min(1, (rect.left + rect.width / 2 - rect.left) / rect.width)
    )
    seekTo(ratio * effectiveDuration)
  }

  async function handleSubmit() {
    if (
      commentFormDisabled ||
      !onAddComment ||
      selectedTimestampSeconds == null ||
      !draft.trim()
    ) {
      return
    }
    setSubmitting(true)
    try {
      await onAddComment({
        content: draft.trim(),
        timestampSeconds: selectedTimestampSeconds,
      })
      setDraft("")
    } finally {
      setSubmitting(false)
    }
  }

  const timestamped = React.useMemo(
    () => comments.filter((c) => getVideoCommentTimestampSeconds(c) != null),
    [comments]
  )

  const sortedForList = React.useMemo(() => {
    const list = filterVideoCommentsWithTimestamp([...comments])
    list.sort((a, b) => {
      const ta = getVideoCommentTimestampSeconds(a)!
      const tb = getVideoCommentTimestampSeconds(b)!
      if (ta !== tb) return ta - tb
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
    return list
  }, [comments])

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Player shell — video, bottom chrome, timeline; fullscreen target; optional panels follow below */}
      <div
        ref={playerContainerRef}
        className={cn(
          "group relative w-full overflow-hidden rounded-lg border border-border bg-black outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          videoClassName ?? "aspect-video"
        )}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Spacebar") {
            e.preventDefault()
            togglePlay()
          }
        }}
      >
        {/* Video surface (click toggles play/pause) */}
        <video
          key={videoSyncKey}
          ref={videoRef}
          src={src}
          poster={poster}
          controls={false}
          playsInline={playsInline}
          className="block h-full max-h-full w-full cursor-pointer object-contain"
          preload="metadata"
          onError={onVideoError}
          onClick={(e) => {
            e.stopPropagation()
            togglePlay()
          }}
          aria-label="Video — click to play or pause"
        />

        {/* Bottom chrome: gradient + controls; outer layer ignores pointer events except on children */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
          <div className="pointer-events-auto flex flex-col gap-2 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2 pt-10 pb-2 sm:px-3 sm:pb-3">
            {/* Control row: primary transport (left) · secondary (right) */}
            <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1.5 sm:flex-nowrap">
              {/* Play + elapsed / total time */}
              <div className="flex min-w-0 items-center gap-x-2 sm:gap-x-3">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0 text-white hover:bg-white/15 hover:text-white"
                  aria-label={playing ? "Pause" : "Play"}
                  onClick={(e) => {
                    e.stopPropagation()
                    togglePlay()
                  }}
                >
                  {playing ? (
                    <Pause className="size-5" />
                  ) : (
                    <Play className="size-5" />
                  )}
                </Button>
                <span className="min-w-0 text-xs text-white/95 tabular-nums">
                  <span ref={timeElapsedRef} className="font-mono">
                    0:00
                  </span>
                  {effectiveDuration > 0 ? (
                    <>
                      {" "}
                      <span className="text-white/60">/</span>{" "}
                      <span className="font-mono text-white/80">
                        {formatVideoTimestamp(effectiveDuration)}
                      </span>
                    </>
                  ) : null}
                </span>
              </div>

              {/* Mute + fullscreen */}
              <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0 text-white hover:bg-white/15 hover:text-white"
                  aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
                  onClick={toggleMute}
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="size-5" />
                  ) : (
                    <Volume2 className="size-5" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0 text-white hover:bg-white/15 hover:text-white"
                  aria-label={fullscreen ? "Exit full screen" : "Full screen"}
                  onClick={toggleFullscreen}
                >
                  {fullscreen ? (
                    <Minimize2 className="size-5" />
                  ) : (
                    <Maximize2 className="size-5" />
                  )}
                </Button>
              </div>
            </div>

            {/* Timeline scrubber: seek + (when review UI) set comment timestamp; markers = comment times */}
            <div
              ref={trackRef}
              role="slider"
              tabIndex={0}
              aria-valuemin={0}
              aria-valuemax={effectiveDuration}
              aria-valuenow={ariaSliderTime}
              aria-label={
                showCommentsUi
                  ? "Video timeline — scrub to seek and set comment timestamp"
                  : "Video timeline — scrub to seek"
              }
              className={cn(
                "relative h-2.5 w-full cursor-pointer rounded-full bg-white/20 ring-1 ring-white/25 sm:h-3",
                effectiveDuration <= 0 && "pointer-events-none opacity-40"
              )}
              onPointerDown={onTrackPointerDown}
              onPointerMove={onTrackPointerMove}
              onPointerUp={onTrackPointerUp}
              onPointerCancel={onTrackPointerUp}
              onKeyDown={onTrackKeyDown}
            >
              {/* Buffered progress fill (elapsed) — width driven by GSAP quickSetter + rAF */}
              <div
                ref={progressFillRef}
                className="pointer-events-none absolute inset-y-0 left-0 w-0 rounded-full bg-blue-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
              />
              {/* Playhead / scrub handle — left driven by GSAP quickSetter + rAF */}
              {effectiveDuration > 0 ? (
                <div
                  ref={playheadRef}
                  className="pointer-events-none absolute top-1/2 left-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500 shadow-md shadow-blue-500/40 will-change-transform"
                />
              ) : null}
              {/* Timestamped comment markers on the rail */}
              {timestamped.map((c) => {
                const t = getVideoCommentTimestampSeconds(c)!
                const leftPct =
                  effectiveDuration > 0
                    ? Math.min(100, Math.max(0, (t / effectiveDuration) * 100))
                    : 0
                return (
                  <button
                    key={c.id}
                    type="button"
                    title={`${formatVideoTimestamp(t)} — ${c.content.slice(0, 80)}${c.content.length > 80 ? "…" : ""}`}
                    className="absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-500 shadow hover:scale-125 hover:bg-amber-400 sm:h-3 sm:w-3"
                    style={{ left: `${leftPct}%` }}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      seekTo(t)
                    }}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Review: compose a comment tied to the selected timeline position */}
      {showCommentsUi && !commentFormDisabled && onAddComment ? (
        <Card size="sm">
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-base">
              Add comment at timestamp
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="space-y-2">
              <Label htmlFor="timeline-comment">Comment</Label>
              {/* Pill sits inside the textarea frame (native textarea cannot nest nodes). */}
              <div className="relative">
                <VideoCommentTimestampPill
                  seconds={selectedTimestampSeconds}
                  className="pointer-events-none absolute top-2.5 left-3 z-10"
                />
                <Textarea
                  id="timeline-comment"
                  rows={4}
                  className="min-h-24 w-full resize-y pt-12 pr-3 pb-2.5 pl-3"
                  placeholder="Review feedback for the selected moment…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={submitting || selectedTimestampSeconds == null}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                While the video plays, the timestamp matches the playhead. Scrub
                the timeline to jump; the pill updates with playback and is
                saved with this comment.
              </p>
            </div>
            <Button
              type="button"
              disabled={
                submitting || selectedTimestampSeconds == null || !draft.trim()
              }
              onClick={() => void handleSubmit()}
            >
              {submitting ? "Sending…" : "Add comment"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Review: list of comments (click an item with a time to seek) */}
      {showCommentsUi ? (
        <Card size="sm">
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-base">
              Timestamp comments ({sortedForList.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-72 overflow-y-auto pt-4">
            {sortedForList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No timestamped comments yet. Scrub the timeline, then add a
                comment at that moment.
              </p>
            ) : (
              <ul className="space-y-3">
                {sortedForList.map((c) => {
                  const ts = getVideoCommentTimestampSeconds(c)!
                  return (
                    <li key={c.id}>
                      <div className="flex gap-3 rounded-lg border border-l-4 border-border border-l-amber-500 bg-card px-3 py-2 text-left text-sm transition-colors">
                        <div className="shrink-0 pt-0.5">
                          <VideoCommentTimestampPill
                            seconds={ts}
                            onClick={() => seekTo(ts)}
                          />
                        </div>
                        <div
                          className="min-w-0 flex-1 cursor-pointer rounded-md hover:bg-muted/50"
                          onClick={() => seekTo(ts)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              seekTo(ts)
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          {c.author ? (
                            <div className="text-xs text-muted-foreground">
                              {c.author.firstName} {c.author.lastName}
                            </div>
                          ) : null}
                          <p className="mt-1 whitespace-pre-wrap text-foreground">
                            {c.content}
                          </p>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export { VideoPlayerTimeline }
