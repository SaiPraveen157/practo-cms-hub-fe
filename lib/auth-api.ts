import { apiRequest } from "@/lib/api"
import type { LoginBody, LoginResponse, User } from "@/types/auth"

export async function login(body: LoginBody): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    body,
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
