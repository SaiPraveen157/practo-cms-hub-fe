import { apiRequest } from "@/lib/api"
import type { User, UserRole, UserStatus } from "@/types/auth"

export type UsersListQuery = {
  role?: UserRole | ""
  status?: UserStatus | ""
  search?: string
  page?: number
  limit?: number
  sort?: string
  order?: "ASC" | "DESC"
}

export type UsersListResponse = {
  success?: boolean
  users?: User[]
  data?: User[]
  total?: number
  page?: number
  limit?: number
  totalPages?: number
}

export function normalizeUsersListResponse(
  raw: UsersListResponse
): { users: User[]; total: number; page: number; limit: number; totalPages: number } {
  const users = raw.users ?? raw.data ?? []
  const page = raw.page ?? 1
  const limit = raw.limit ?? 20
  const total = raw.total ?? users.length
  const totalPages =
    raw.totalPages ?? Math.max(1, Math.ceil(total / Math.max(1, limit)))
  return { users, total, page, limit, totalPages }
}

export async function listUsers(
  token: string,
  query: UsersListQuery = {}
): Promise<UsersListResponse> {
  const q = new URLSearchParams()
  if (query.role) q.set("role", query.role)
  if (query.status) q.set("status", query.status)
  if (query.search) q.set("search", query.search)
  if (query.page != null) q.set("page", String(query.page))
  if (query.limit != null) q.set("limit", String(query.limit))
  if (query.sort) q.set("sort", query.sort)
  if (query.order) q.set("order", query.order)
  const qs = q.toString()
  return apiRequest<UsersListResponse>(
    `/api/users${qs ? `?${qs}` : ""}`,
    { token }
  )
}

export type CreateUserBody = {
  firstName: string
  lastName: string
  email: string
  password: string
  role: UserRole
}

export async function createUser(
  token: string,
  body: CreateUserBody
): Promise<{ success?: boolean; user?: User; message?: string }> {
  return apiRequest(`/api/users`, {
    method: "POST",
    token,
    body,
  })
}

export type PatchUserBody = {
  firstName?: string
  lastName?: string
  email?: string
}

export async function patchUser(
  token: string,
  userId: string,
  body: PatchUserBody
): Promise<{ success?: boolean; user?: User; message?: string }> {
  return apiRequest(`/api/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    token,
    body,
  })
}

export async function resetUserPassword(
  token: string,
  userId: string,
  newPassword: string
): Promise<{ success?: boolean; message?: string }> {
  return apiRequest(`/api/users/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST",
    token,
    body: { newPassword },
  })
}

export async function toggleUserStatus(
  token: string,
  userId: string
): Promise<{ success?: boolean; message?: string }> {
  return apiRequest(`/api/users/toggle-status`, {
    method: "POST",
    token,
    body: { userId },
  })
}

export async function updateUserRole(
  token: string,
  userId: string,
  role: UserRole
): Promise<{ success?: boolean; message?: string }> {
  return apiRequest(`/api/users/update-role`, {
    method: "POST",
    token,
    body: { userId, role },
  })
}

export async function forceMoveWorkflow(
  token: string,
  contentId: string,
  targetStage: string
): Promise<{ success?: boolean; message?: string }> {
  return apiRequest(`/api/users/force-move-workflow`, {
    method: "POST",
    token,
    body: { contentId, targetStage },
  })
}

export async function unlockScriptContent(
  token: string,
  contentId: string
): Promise<{ success?: boolean; message?: string }> {
  return apiRequest(`/api/users/unlock-content`, {
    method: "POST",
    token,
    body: { contentId },
  })
}
