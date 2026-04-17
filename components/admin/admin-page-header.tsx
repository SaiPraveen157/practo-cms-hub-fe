import { cn } from "@/lib/utils"

export function AdminPageHeader({
  title,
  description,
  className,
}: {
  title: string
  description?: string
  className?: string
}) {
  return (
    <header className={cn(className)}>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        {title}
      </h1>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </header>
  )
}

export function AdminSectionTitle({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h2
      className={cn(
        "text-sm font-medium tracking-wider text-muted-foreground uppercase",
        className
      )}
    >
      {children}
    </h2>
  )
}
