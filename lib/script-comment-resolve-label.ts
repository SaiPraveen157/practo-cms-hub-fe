import type { ScriptComment } from "@/types/script"

function formatResolvedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

/**
 * Short line for resolved stickers: manual resolver vs system auto-close on version bump.
 */
export function formatStickerResolvedHint(c: ScriptComment): string | null {
  if (!c.resolved) return null
  if (c.resolvedBy) {
    const name =
      `${c.resolvedBy.firstName ?? ""} ${c.resolvedBy.lastName ?? ""}`.trim() ||
      "User"
    const t = c.resolvedAt ? formatResolvedAt(c.resolvedAt) : ""
    return t ? `Done — ${name} · ${t}` : `Done — ${name}`
  }
  if (c.resolvedAt) {
    return `Closed on new version · ${formatResolvedAt(c.resolvedAt)}`
  }
  return "Closed on new version"
}
