import type { PackageTat, PackageVideo } from "@/types/package"

const DEFAULT_LIMIT_HOURS = 24
const DEFAULT_REPEAT_HOURS = 6

export function normalizePackageTat(raw: unknown): PackageTat | null {
  if (!raw || typeof raw !== "object") return null
  const t = raw as Record<string, unknown>
  const tatLimitHours = Number(t.tatLimitHours ?? t.tat_limit_hours ?? 0)
  if (!Number.isFinite(tatLimitHours) || tatLimitHours <= 0) return null
  const repeatCycleHours =
    Number(t.repeatCycleHours ?? t.repeat_cycle_hours ?? DEFAULT_REPEAT_HOURS) ||
    DEFAULT_REPEAT_HOURS
  return {
    hoursElapsed: Number(t.hoursElapsed ?? t.hours_elapsed ?? 0) || 0,
    isOverdue: Boolean(t.isOverdue ?? t.is_overdue),
    tatLimitHours,
    repeatCycleHours,
    hoursInCurrentCycle:
      Number(t.hoursInCurrentCycle ?? t.hours_in_current_cycle ?? 0) || 0,
    cycleNumber: Number(t.cycleNumber ?? t.cycle_number ?? 0) || 0,
  }
}

function tatRelevantVideoStatus(status: PackageVideo["status"]): boolean {
  return (
    status === "MEDICAL_REVIEW" ||
    status === "BRAND_VIDEO_REVIEW" ||
    status === "AWAITING_APPROVER"
  )
}

/**
 * Prefer API `video.tat`; otherwise derive SLA progress from `assignedAt` for
 * active review stages (24h window + 6h repeat cycles, same defaults as queue samples).
 */
export function resolvePackageVideoTat(
  video: PackageVideo,
  options?: { limitHours?: number; repeatCycleHours?: number }
): PackageTat | null {
  const limitHours = options?.limitHours ?? DEFAULT_LIMIT_HOURS
  const repeatCycleHours = options?.repeatCycleHours ?? DEFAULT_REPEAT_HOURS

  if (video.tat && video.tat.tatLimitHours > 0) {
    return video.tat
  }
  if (!tatRelevantVideoStatus(video.status)) return null
  const assigned = video.assignedAt
  if (!assigned) return null
  const start = new Date(assigned).getTime()
  if (Number.isNaN(start)) return null
  const hoursElapsed = Math.max(0, (Date.now() - start) / 3_600_000)
  const isOverdue = hoursElapsed > limitHours
  if (!isOverdue) {
    return {
      hoursElapsed,
      isOverdue: false,
      tatLimitHours: limitHours,
      repeatCycleHours,
      hoursInCurrentCycle: hoursElapsed,
      cycleNumber: 0,
    }
  }
  const overdueHours = hoursElapsed - limitHours
  const cycleNumber = Math.floor(overdueHours / repeatCycleHours) + 1
  const hoursInCurrentCycle = overdueHours % repeatCycleHours
  return {
    hoursElapsed,
    isOverdue: true,
    tatLimitHours: limitHours,
    repeatCycleHours,
    hoursInCurrentCycle,
    cycleNumber,
  }
}
