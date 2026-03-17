/**
 * Helpers for script listing cards: word count from HTML, relative time.
 */

export function getWordCountFromHtml(html: string): number {
  if (!html || typeof html !== "string") return 0
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  return text ? text.split(" ").filter(Boolean).length : 0
}

export function getRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined })
  } catch {
    return dateStr
  }
}

export function getAuthorDisplayName(createdBy: { firstName?: string; lastName?: string } | null | undefined): string {
  if (!createdBy) return "Unknown"
  const first = createdBy.firstName ?? ""
  const last = createdBy.lastName ?? ""
  return [first, last].filter(Boolean).join(" ") || "Unknown"
}

export function getAuthorInitials(createdBy: { firstName?: string; lastName?: string; email?: string } | null | undefined): string {
  if (!createdBy) return "?"
  const first = createdBy.firstName ?? ""
  const last = createdBy.lastName ?? ""
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase()
  if (first) return first.slice(0, 2).toUpperCase()
  const email = (createdBy as { email?: string }).email
  if (email) return email.slice(0, 2).toUpperCase()
  return "?"
}
