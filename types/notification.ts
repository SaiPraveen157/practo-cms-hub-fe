/**
 * Notification types aligned with backend (Notification model, API responses).
 * See docs/database-schema.prisma and Postman collection.
 */

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  message: string
  isRead: boolean
  readAt: string | null
  metadata?: Record<string, unknown> | null
  createdAt: string
}

/** API response: { success, data: { notifications, total?, unreadCount? } } */
export interface NotificationListResponse {
  success?: boolean
  data?: {
    notifications?: Notification[]
    total?: number
    unreadCount?: number
  }
}

export interface UnreadCountResponse {
  count?: number
  success?: boolean
  data?: { count?: number; unreadCount?: number }
}
