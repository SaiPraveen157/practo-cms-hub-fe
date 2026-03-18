"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAuthStore } from "@/store"
import { getVideoQueue, getVideoStats } from "@/lib/videos-api"
import { filterStaleContentBrandVideos } from "@/lib/video-queue-utils"
import type { Video, VideoPhase, VideoStatus } from "@/types/video"
import { VideoTatBar, resolveVideoTat } from "@/components/video-tat-bar"
import { ArrowRight, Loader2, Search, Video as VideoIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const PHASE_LABELS: Record<VideoPhase, string> = {
  FIRST_LINE_UP: "First Line Up",
  FIRST_CUT: "First Cut",
}

const STATUS_LABELS: Record<VideoStatus, string> = {
  AGENCY_UPLOAD_PENDING: "Awaiting upload",
  MEDICAL_REVIEW: "Medical Review",
  CONTENT_BRAND_REVIEW: "Content/Brand Review",
  APPROVED: "Approved",
}

function getStatusPillClass(status: VideoStatus): string {
  switch (status) {
    case "AGENCY_UPLOAD_PENDING":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
    case "MEDICAL_REVIEW":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
    case "CONTENT_BRAND_REVIEW":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200"
    case "APPROVED":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
    default:
      return "bg-muted text-muted-foreground"
  }
}

const LIST_PATH = "/content-brand-videos"

export default function ContentBrandVideosPage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getVideoStats>> | null>(null)

  const isContentBrand = user?.role === "CONTENT_BRAND"

  const fetchQueue = useCallback(async () => {
    if (!token || !isContentBrand) return
    setLoading(true)
    setError(null)
    try {
      const res = await getVideoQueue(token)
      const combined = [...(res.available ?? []), ...(res.myReviews ?? [])]
      setVideos(filterStaleContentBrandVideos(combined))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load videos")
      toast.error("Failed to load videos")
    } finally {
      setLoading(false)
    }
  }, [token, isContentBrand])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  useEffect(() => {
    if (!token || !isContentBrand) return
    getVideoStats(token).then(setStats).catch(() => setStats(null))
  }, [token, isContentBrand])

  const filteredVideos = searchQuery.trim()
    ? videos.filter((v) => {
        const title = v.script?.title ?? ""
        const fileName = v.fileName ?? ""
        return (
          title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          fileName.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })
    : videos

  if (!isContentBrand) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Only Content/Brand can access this page.</p>
            <Button variant="outline" className="mt-4" onClick={() => router.back()}>
              Go back
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Content/Brand — Videos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <strong>Phase 4</strong> — Approve First Line Up after Medical (approve only).{" "}
            <strong>Phase 5</strong> — Review First Cut: approve or request changes; loop until both
            Medical and Brand sign off. TAT 24 hours.
          </p>
        </div>

        {stats && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.firstLineUp && (
              <>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">First Line Up — Pending</p>
                    <p className="text-2xl font-semibold">{stats.firstLineUp.pending}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">First Line Up — Approved</p>
                    <p className="text-2xl font-semibold">{stats.firstLineUp.approved}</p>
                  </CardContent>
                </Card>
              </>
            )}
            {stats.firstCut && (
              <>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">First Cut — Pending</p>
                    <p className="text-2xl font-semibold">{stats.firstCut.pending}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">First Cut — Approved</p>
                    <p className="text-2xl font-semibold">{stats.firstCut.approved}</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by script title or file name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 pl-9"
          />
        </div>

        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={fetchQueue}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredVideos.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <VideoIcon className="size-12 text-muted-foreground" />
              <p className="mt-4 font-medium">
                {searchQuery.trim() ? "No videos match your search" : "No videos in your queue"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Videos awaiting your approval will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {filteredVideos.map((video) => {
              const limitH = stats?.tatConfig?.limitHours ?? 24
              const repeatH = stats?.tatConfig?.repeatCycleHours ?? 6
              return (
              <Card
                key={video.id}
                className="flex cursor-pointer flex-col overflow-hidden rounded-xl shadow-sm ring-1 ring-border/50 transition-shadow hover:shadow-md"
                onClick={() => router.push(`${LIST_PATH}/${video.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    router.push(`${LIST_PATH}/${video.id}`)
                  }
                }}
              >
                <CardContent className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium uppercase",
                        getStatusPillClass(video.status)
                      )}
                    >
                      {STATUS_LABELS[video.status]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {PHASE_LABELS[video.phase]} · v{video.version}
                    </span>
                  </div>
                  <h3 className="min-w-0 text-lg font-semibold leading-tight text-foreground">
                    {video.script?.title ?? "Untitled script"}
                  </h3>
                  <div className="text-sm text-muted-foreground">
                    {video.fileUrl ? (
                      <span>{video.fileName ?? "File attached"}</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">Awaiting upload</span>
                    )}
                    {video.uploadedBy && (
                      <span className="ml-2">
                        · {video.uploadedBy.firstName} {video.uploadedBy.lastName}
                      </span>
                    )}
                  </div>
                  <VideoTatBar
                    className="pt-1"
                    tat={resolveVideoTat(video, limitH)}
                    repeatCycleHours={repeatH}
                  />
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`${LIST_PATH}/${video.id}`)
                      }}
                    >
                      <ArrowRight className="size-4" />
                      View
                    </Button>
                  </div>
                </CardContent>
              </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
