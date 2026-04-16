import type { ScriptComment, ScriptStatus } from "@/types/script"

/** When set, resolve/edit/delete are gated per comment (recipient resolve, author edit). */
export type ScriptStickerPermissionContext = {
  scriptStatus: ScriptStatus
  currentUserId: string | null
  currentUserRole: string | null
}

/** Roles that may tick ✓ / reopen when the script is at `status` (recipient chain). */
export function recipientRolesForStickerResolve(
  status: ScriptStatus
): readonly string[] {
  switch (status) {
    case "DRAFT":
      return ["MEDICAL_AFFAIRS"]
    case "CONTENT_BRAND_REVIEW":
      return ["CONTENT_BRAND"]
    case "AGENCY_PRODUCTION":
      return ["AGENCY_POC"]
    case "MEDICAL_REVIEW":
      return ["MEDICAL_AFFAIRS"]
    case "CONTENT_BRAND_APPROVAL":
      return ["CONTENT_BRAND", "MEDICAL_AFFAIRS"]
    case "CONTENT_APPROVER_REVIEW":
      return ["CONTENT_APPROVER"]
    default:
      return []
  }
}

export function canResolveScriptSticker(
  status: ScriptStatus | null | undefined,
  userRole: string | null | undefined,
  sticker: Pick<ScriptComment, "authorId">,
  currentUserId: string | null | undefined
): boolean {
  if (!status || !userRole) return false
  if (userRole === "SUPER_ADMIN") return true
  if (sticker.authorId && currentUserId && sticker.authorId === currentUserId) {
    return true
  }
  return recipientRolesForStickerResolve(status).includes(userRole)
}

/** Body / anchor / delete — author or Super Admin only (server mirrors). */
export function canEditScriptStickerBody(
  userRole: string | null | undefined,
  sticker: Pick<ScriptComment, "authorId">,
  currentUserId: string | null | undefined
): boolean {
  if (!userRole) return false
  if (userRole === "SUPER_ADMIN") return true
  return Boolean(
    sticker.authorId && currentUserId && sticker.authorId === currentUserId
  )
}
