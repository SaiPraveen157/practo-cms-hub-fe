"use client"

import { useEffect, useMemo, useState } from "react"
import { resolvePackageVideoTat } from "@/lib/package-tat"
import type { PackageVideo } from "@/types/package"
import { PackageTatProgress } from "@/components/packages/package-tat-card"

/** Live-updating bar when TAT is derived from `assignedAt` (ticks every minute). */
export function PackageVideoTatInline({
  video,
  className,
  compact = true,
}: {
  video: PackageVideo
  className?: string
  compact?: boolean
}) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const tat = useMemo(
    () => resolvePackageVideoTat(video),
    [video, tick]
  )

  if (!tat) return null
  return (
    <PackageTatProgress tat={tat} compact={compact} className={className} />
  )
}
