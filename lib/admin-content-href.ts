import type { AdminContentItem } from "@/types/admin"

/** Best-effort in-app navigation for admin content rows. */
export function getAdminContentHref(item: AdminContentItem): string | null {
  switch (item.contentType) {
    case "script":
      return `/medical-affairs-scripts/${item.id}`
    case "video":
      return `/medical-affairs-videos/${item.id}`
    case "packageVideo":
      return `/content-brand-packages`
    case "languageVideo":
      return `/content-brand-language-packages/${item.id}`
    default:
      return null
  }
}
