"use client"

import type { Script } from "@/types/script"

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return s
  }
}

function formatRejectedBy(role: string): string {
  const map: Record<string, string> = {
    CONTENT_BRAND: "Content/Brand",
    MEDICAL_AFFAIRS: "Medical Affairs",
    CONTENT_APPROVER: "Content Approver",
  }
  return map[role] ?? role.replace(/_/g, " ")
}

export function ScriptRejectionFeedback({ script }: { script: Script }) {
  const rejection = script.latestRejection
  if (!rejection?.comments) return null

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Rejection feedback</p>
      <div className="border-l-2 border-destructive/40 pl-4 py-1">
        <p className="text-xs text-muted-foreground">
          Rejected by {formatRejectedBy(rejection.rejectedBy)} · {formatDate(rejection.reviewedAt)}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{rejection.comments}</p>
      </div>
    </div>
  )
}
