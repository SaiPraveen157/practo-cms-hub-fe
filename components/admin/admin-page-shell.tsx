import { cn } from "@/lib/utils"

type MaxWidth = "6xl" | "7xl"

export function AdminPageShell({
  children,
  className,
  maxWidth = "6xl",
}: {
  children: React.ReactNode
  className?: string
  /** Wider layout for dense tables (e.g. content library). */
  maxWidth?: MaxWidth
}) {
  return (
    <div className={cn("min-h-full bg-background", className)}>
      <div
        className={cn(
          "mx-auto space-y-6 p-6 md:p-8",
          maxWidth === "7xl" ? "max-w-7xl" : "max-w-6xl"
        )}
      >
        {children}
      </div>
    </div>
  )
}
