"use client"

import { cn } from "@/lib/utils"

export function PackageListTabNav<T extends string = string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: readonly { key: T; label: string }[]
  active: T
  onChange: (key: T) => void
  ariaLabel: string
}) {
  return (
    <div className="border-b border-border">
      <nav
        className="flex flex-wrap gap-1"
        role="tablist"
        aria-label={ariaLabel}
      >
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            onClick={() => onChange(key)}
            className={cn(
              "border-b-2 px-4 py-3 text-sm font-medium transition-colors",
              active === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
