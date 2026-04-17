/**
 * Admin dashboard APIs sometimes return `{ data: { ... } }` or snake_case
 * video stats. Coerce to the shapes used by the Super Admin UI.
 */

import type {
  AdminContentFilterOptions,
  AdminContentItem,
  AdminContentResponse,
  AdminOverdueItem,
  AdminOverdueResponse,
  AdminOverviewResponse,
  AdminVideoPhaseStats,
  AdminVideoStats,
  ScriptTimelineResponse,
} from "@/types/admin"

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v != null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>
  }
  return null
}

/** If the API wrapped the payload in `data`, peel it when it holds real fields. */
function unwrapAdminRoot(raw: unknown): Record<string, unknown> {
  const top = asRecord(raw) ?? {}
  const inner = asRecord(top.data)
  if (!inner) return top
  if (
    "items" in inner ||
    "scripts" in inner ||
    "videos" in inner ||
    "timeline" in inner ||
    "total" in inner
  ) {
    return { ...top, ...inner }
  }
  return top
}

function coercePhaseStats(node: unknown): AdminVideoPhaseStats {
  const o = asRecord(node) ?? {}
  return {
    total: num(o.total),
    awaitingUpload: num(
      o.awaitingUpload ?? o.awaiting_upload ?? o.agency_upload_pending
    ),
    medicalReview: num(o.medicalReview ?? o.medical_review),
    brandReview: num(o.brandReview ?? o.brand_review),
    approved: num(o.approved),
    overdue: num(o.overdue),
  }
}

function coerceVideoStats(v: unknown): AdminVideoStats {
  const o = asRecord(v) ?? {}
  const flu =
    o.firstLineUp ??
    o.first_line_up ??
    o.FIRST_LINE_UP ??
    o.firstLineup
  const fc = o.firstCut ?? o.first_cut ?? o.FIRST_CUT
  return {
    firstLineUp: coercePhaseStats(flu),
    firstCut: coercePhaseStats(fc),
  }
}

export function coerceAdminOverviewResponse(
  raw: unknown
): AdminOverviewResponse {
  const r = unwrapAdminRoot(raw)
  const videos = coerceVideoStats(r.videos)
  return { ...(r as unknown as AdminOverviewResponse), videos }
}

export function coerceAdminOverdueResponse(raw: unknown): AdminOverdueResponse {
  const r = unwrapAdminRoot(raw)
  const items = Array.isArray(r.items) ? (r.items as AdminOverdueItem[]) : []
  return {
    success: r.success as boolean | undefined,
    items,
    total: num(r.total, items.length),
  }
}

function normalizeContentItem(row: AdminContentItem): AdminContentItem {
  const ct =
    typeof row.contentType === "string"
      ? row.contentType.trim().toLowerCase()
      : row.contentType
  return { ...row, contentType: ct }
}

export function coerceAdminContentResponse(raw: unknown): AdminContentResponse {
  const r = unwrapAdminRoot(raw)
  const rawItems = Array.isArray(r.items) ? r.items : []
  const items = rawItems.map((it) =>
    normalizeContentItem(it as AdminContentItem)
  )
  const fo = asRecord(r.filterOptions) ?? {}
  const filterOptions: AdminContentFilterOptions = {
    phases: Array.isArray(fo.phases) ? (fo.phases as string[]) : [],
    statuses: Array.isArray(fo.statuses) ? (fo.statuses as string[]) : [],
    specialties: Array.isArray(fo.specialties)
      ? (fo.specialties as string[])
      : [],
    languages: Array.isArray(fo.languages) ? (fo.languages as string[]) : [],
    assetTypes: Array.isArray(fo.assetTypes)
      ? (fo.assetTypes as string[])
      : [],
  }
  return {
    success: r.success as boolean | undefined,
    items,
    total: num(r.total, items.length),
    page: num(r.page, 1) || 1,
    limit: num(r.limit, 20) || 20,
    totalPages: num(r.totalPages, 1) || 1,
    filterOptions,
  }
}

export function coerceScriptTimelineResponse(
  raw: unknown
): ScriptTimelineResponse {
  const r = unwrapAdminRoot(raw)
  const videos = Array.isArray(r.videos)
    ? r.videos
    : Array.isArray(r.Videos)
      ? r.Videos
      : []
  const packages = Array.isArray(r.packages)
    ? r.packages
    : Array.isArray(r.Packages)
      ? r.Packages
      : []
  const timeline = Array.isArray(r.timeline)
    ? r.timeline
    : Array.isArray(r.Timeline)
      ? r.Timeline
      : []
  return {
    ...(r as unknown as ScriptTimelineResponse),
    videos: videos as ScriptTimelineResponse["videos"],
    packages: packages as ScriptTimelineResponse["packages"],
    timeline: timeline as ScriptTimelineResponse["timeline"],
  }
}
