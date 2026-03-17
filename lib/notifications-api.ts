/**
 * Notifications API — list, unread count, mark read, mark all read.
 * Aligned with postman/Practo CMS V2 — Complete (Part 1 + Part 2).
 */

import { apiRequest } from "@/lib/api"
import type {
  Notification,
  NotificationListResponse,
  UnreadCountResponse,
} from "@/types/notification"

function checkToken(token: string | null): asserts token is string {
  if (!token) throw new Error("Not authenticated")
}

function normalizeNotification(raw: Record<string, unknown>): Notification {
  return {
    id: String(raw.id),
    userId: String(raw.userId ?? raw.user_id),
    type: String(raw.type ?? "IN_APP"),
    title: String(raw.title ?? ""),
    message: String(raw.message ?? ""),
    isRead: Boolean(raw.isRead ?? raw.is_read),
    readAt: raw.readAt != null || raw.read_at != null
      ? String(raw.readAt ?? raw.read_at)
      : null,
    metadata: (raw.metadata as Notification["metadata"]) ?? null,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
  }
}

/** GET /api/notifications — list current user's notifications */
export async function getNotifications(
  token: string | null
): Promise<Notification[]> {
  checkToken(token)
  const response = await apiRequest<NotificationListResponse>(
    "/api/notifications",
    { token }
  )
  const list = response?.data?.notifications ?? []
  return list.map((n) =>
    normalizeNotification(n as unknown as Record<string, unknown>)
  )
}

/** GET /api/notifications/unread-count */
export async function getUnreadCount(
  token: string | null
): Promise<number> {
  checkToken(token)
  const data = await apiRequest<UnreadCountResponse | number>(
    "/api/notifications/unread-count",
    { token }
  )
  if (typeof data === "number") return data
  if (data?.data?.unreadCount != null) return Number(data.data.unreadCount)
  if (data?.data?.count != null) return Number(data.data.count)
  if (data && "count" in data && typeof (data as UnreadCountResponse).count === "number") {
    return (data as UnreadCountResponse).count!
  }
  return 0
}

/** PATCH /api/notifications/:id/read — mark one as read */
export async function markNotificationRead(
  token: string | null,
  notificationId: string
): Promise<void> {
  checkToken(token)
  await apiRequest(`/api/notifications/${notificationId}/read`, {
    method: "PATCH",
    token,
  })
}

/** PATCH /api/notifications/read-all — mark all as read */
export async function markAllNotificationsRead(
  token: string | null
): Promise<void> {
  checkToken(token)
  await apiRequest("/api/notifications/read-all", {
    method: "PATCH",
    token,
  })
}
