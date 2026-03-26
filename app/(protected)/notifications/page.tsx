"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/store"
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications-api"
import type { Notification } from "@/types/notification"
import { Bell, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

function formatDateTime(s: string) {
  try {
    return new Date(s).toLocaleString(undefined, {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    })
  } catch {
    return s
  }
}

export default function NotificationsPage() {
  const token = useAuthStore((s) => s.token)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const list = await getNotifications(token)
      setNotifications(list)
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to load notifications"
      setError(message)
      toast.error("Error", { description: message })
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const unreadCount = notifications.filter((n) => !n.isRead).length

  async function handleMarkAsRead(n: Notification) {
    if (n.isRead) return
    if (!token) return
    setMarkingId(n.id)
    try {
      await markNotificationRead(token, n.id)
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === n.id
            ? { ...item, isRead: true, readAt: new Date().toISOString() }
            : item
        )
      )
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("notifications-updated"))
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to mark as read"
      toast.error("Error", { description: message })
    } finally {
      setMarkingId(null)
    }
  }

  async function handleMarkAllAsRead() {
    if (unreadCount === 0) return
    if (!token) return
    setMarkingAll(true)
    try {
      await markAllNotificationsRead(token)
      setNotifications((prev) =>
        prev.map((item) =>
          item.isRead
            ? item
            : { ...item, isRead: true, readAt: new Date().toISOString() }
        )
      )
      toast.success("All notifications marked as read")
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("notifications-updated"))
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to mark all as read"
      toast.error("Error", { description: message })
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-1 text-muted-foreground">
          Stay updated with system and content activities
        </p>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={fetchNotifications}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {!error && (
        <>
          {/* Summary card */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div>
                <h2 className="font-semibold">All Notifications</h2>
                <p className="text-sm text-muted-foreground">
                  You have {unreadCount} unread notification
                  {unreadCount !== 1 ? "s" : ""}
                </p>
              </div>
              {unreadCount > 0 && (
                <Button
                  variant="link"
                  className="h-auto p-0 text-primary"
                  onClick={handleMarkAllAsRead}
                  disabled={markingAll}
                >
                  {markingAll ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  Mark all as read
                </Button>
              )}
            </CardContent>
          </Card>

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="size-12 text-muted-foreground" />
                <p className="mt-4 font-medium">No notifications yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  When you have notifications, they will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {[...notifications]
                .sort((a, b) => Number(a.isRead) - Number(b.isRead))
                .map((n) => {
                  const isMarking = markingId === n.id
                  return (
                    <li key={n.id}>
                      <Card
                        className={cn(
                          "cursor-pointer transition-colors hover:shadow-md",
                          !n.isRead &&
                            "bg-blue-50 ring-1 ring-blue-200/80 dark:bg-blue-950/40 dark:ring-blue-800/50"
                        )}
                        onClick={() => handleMarkAsRead(n)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            handleMarkAsRead(n)
                          }
                        }}
                      >
                        <CardContent className="flex flex-col gap-1 py-4">
                          <div className="flex items-start gap-2">
                            {!n.isRead && (
                              <span
                                className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500"
                                aria-hidden
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="leading-tight font-semibold">
                                  {n.title}
                                </p>
                                {!n.isRead && (
                                  <Badge
                                    variant="secondary"
                                    className="shrink-0 bg-blue-100 text-xs text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                                  >
                                    NEW
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {n.message}
                              </p>
                              <p className="mt-2 text-xs text-muted-foreground">
                                {formatDateTime(n.createdAt)}
                                {isMarking && (
                                  <span className="ml-2 inline-flex items-center gap-1">
                                    <Loader2 className="size-3 animate-spin" />
                                    Marking…
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  )
                })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
