/**
 * Auth types aligned with backend (User model, login response).
 * See docs/database-schema.prisma for User and API for login/me.
 */

export type UserRole =
  | "SUPER_ADMIN"
  | "MEDICAL_AFFAIRS"
  | "CONTENT_BRAND"
  | "AGENCY_POC"
  | "CONTENT_APPROVER"

export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED"

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  status: UserStatus
  createdAt?: string
  updatedAt?: string
  lastLoginAt?: string | null
}

export interface LoginResponse {
  token: string
  user?: User
  permissions?: string[]
}

export interface LoginBody {
  email: string
  password: string
}
