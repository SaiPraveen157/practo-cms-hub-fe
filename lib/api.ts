/**
 * API client for Practo CMS Hub V2.
 * Base URL from env; all requests (except login) send Authorization: Bearer <token>.
 */

const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://164.52.204.34:5001"

export function getApiBaseUrl(): string {
  return getBaseUrl()
}

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  body?: unknown
  token?: string | null
  headers?: Record<string, string>
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { method = "GET", body, token, headers: customHeaders = {} } = options
  const url = `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...customHeaders,
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  const res = await fetch(url, {
    method,
    headers,
    ...(body != null && { body: JSON.stringify(body) }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      typeof data.message === "string" ? data.message : "Request failed"
    )
  }
  return data as T
}
