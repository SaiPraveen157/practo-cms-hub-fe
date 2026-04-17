import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type UserDirectoryEntry = {
  id: string
  name: string
  email: string
  initials: string
  avatarBgClass: string
  roleLabel: string
  roleBadgeClass: string
  department: string
  contentCount: number
  status: "Active"
}

export function UserDirectoryCard({
  user,
  onViewProfile,
  onEditRole,
}: {
  user: UserDirectoryEntry
  onViewProfile?: () => void
  onEditRole?: () => void
}) {
  return (
    <Card className="overflow-hidden shadow-none ring-1 ring-border/80">
      <CardContent className="p-5">
        <div className="flex gap-4">
          <Avatar className="size-14 shrink-0">
            <AvatarFallback
              className={cn(
                "font-semibold text-white",
                user.initials.length > 2 ? "text-[11px]" : "text-sm",
                user.avatarBgClass
              )}
            >
              {user.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="font-semibold leading-tight text-foreground">
                {user.name}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {user.email}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                  user.roleBadgeClass
                )}
              >
                {user.roleLabel}
              </span>
              <Badge variant="secondary" className="font-normal">
                {user.department}
              </Badge>
            </div>
          </div>
        </div>

        <div className="my-4 border-t border-border" />

        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Content
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
              {user.contentCount}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <div className="mt-1">
              <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                {user.status}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onViewProfile}
          >
            View Profile
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onEditRole}
          >
            Edit Role
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
