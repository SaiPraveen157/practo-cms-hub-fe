import { apiRequest } from "@/lib/api"
import type { LoginBody, LoginResponse, User } from "@/types/auth"

export async function login(body: LoginBody): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    body,
  })
}

/** POST /api/auth/oauth/google with { token: googleIdToken }. Returns same shape as login. */
export async function loginWithGoogle(idToken: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/api/auth/oauth/google", {
    method: "POST",
    body: { token: idToken },
  })
}

export async function getMe(token: string): Promise<User> {
  const data = await apiRequest<{ user?: User } & Record<string, unknown>>(
    "/api/auth/me",
    { token }
  )
  if (data.user) return data.user
  throw new Error("Invalid me response")
}

export type ForgotPasswordResponse = {
  success?: boolean
  message?: string
}

export async function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  return apiRequest<ForgotPasswordResponse>("/api/auth/forgot-password", {
    method: "POST",
    body: { email },
  })
}
