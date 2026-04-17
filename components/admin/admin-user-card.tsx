import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { User, UserRole } from "@/types/auth"

const ROLE_BADGE: Record<
  UserRole,
  string
> = {
  SUPER_ADMIN:
    "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-100",
  MEDICAL_AFFAIRS:
    "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-100",
  CONTENT_BRAND:
    "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100",
  AGENCY_POC:
    "bg-teal-100 text-teal-900 dark:bg-teal-950/60 dark:text-teal-100",
  CONTENT_APPROVER:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100",
}

function initials(u: User) {
  const a = (u.firstName?.[0] ?? "").toUpperCase()
  const b = (u.lastName?.[0] ?? "").toUpperCase()
  if (a && b) return `${a}${b}`
  if (a) return `${a}${a}`
  return u.email.slice(0, 2).toUpperCase()
}

function roleLabel(role: UserRole) {
  return role.replace(/_/g, " ")
}

export function AdminUserCard({
  user,
  onEdit,
  onChangeRole,
  onResetPassword,
  onToggleStatus,
}: {
  user: User
  onEdit: () => void
  onChangeRole: () => void
  onResetPassword: () => void
  onToggleStatus: () => void
}) {
  const active = user.status === "ACTIVE"
  return (
    <Card className="overflow-hidden shadow-none ring-1 ring-border/80">
      <CardContent className="p-5">
        <div className="flex gap-4">
          <Avatar className="size-14 shrink-0">
            <AvatarFallback
              className={cn(
                "text-sm font-semibold text-white",
                "bg-linear-to-br from-[#518dcd] to-[#7ac0ca]"
              )}
            >
              {initials(user)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="font-semibold leading-tight text-foreground">
                {[user.firstName, user.lastName].filter(Boolean).join(" ") ||
                  user.email}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {user.email}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                  ROLE_BADGE[user.role] ?? "bg-muted text-foreground"
                )}
              >
                {roleLabel(user.role)}
              </span>
              <Badge variant="secondary" className="font-normal">
                {user.status}
              </Badge>
            </div>
          </div>
        </div>

        <div className="my-4 border-t border-border" />

        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Account
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {user.lastLoginAt
                ? `Last login ${new Date(user.lastLoginAt).toLocaleDateString()}`
                : "No recent login"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <div className="mt-1">
              <span
                className={cn(
                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                  active
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                    : "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                )}
              >
                {active ? "Active" : user.status}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="w-full" onClick={onEdit}>
            Edit profile
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onChangeRole}
          >
            Edit role
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onResetPassword}
          >
            Reset password
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onToggleStatus}
          >
            {active ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
