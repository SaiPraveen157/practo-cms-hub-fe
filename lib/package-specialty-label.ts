import type { PackageSpecialtyOption } from "@/types/package"

/** Map API specialty value to dropdown label; falls back to raw value. */
export function labelForSpecialtyValue(
  value: string | null | undefined,
  options: PackageSpecialtyOption[]
): string {
  if (value == null || String(value).trim() === "") return ""
  const v = String(value).trim()
  const hit = options.find((o) => o.value === v)
  return hit?.label ?? v
}

/** Non-empty strings only — for optional `doctorName` / `specialty` on API bodies. */
export function optionalDoctorSpecialtyPayload(meta: {
  doctorName?: string
  specialty?: string
}): { doctorName?: string; specialty?: string } {
  const d = meta.doctorName?.trim()
  const s = meta.specialty?.trim()
  const out: { doctorName?: string; specialty?: string } = {}
  if (d) out.doctorName = d
  if (s) out.specialty = s
  return out
}
