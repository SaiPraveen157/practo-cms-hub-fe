"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus, Search, Shield } from "lucide-react"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  createUser,
  listUsers,
  normalizeUsersListResponse,
  patchUser,
  resetUserPassword,
  toggleUserStatus,
  updateUserRole,
  type CreateUserBody,
} from "@/lib/users-api"
import { useAuthStore } from "@/store"
import type { User, UserRole, UserStatus } from "@/types/auth"
import { AdminUserCard } from "@/components/admin/admin-user-card"

const ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "MEDICAL_AFFAIRS",
  "CONTENT_BRAND",
  "AGENCY_POC",
  "CONTENT_APPROVER",
]

export default function AdminUsersPage() {
  const token = useAuthStore((s) => s.token)
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("")
  const [statusFilter, setStatusFilter] = useState<UserStatus | "">("")
  const [page, setPage] = useState(1)
  const limit = 20

  const [users, setUsers] = useState<User[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<CreateUserBody>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "MEDICAL_AFFAIRS",
  })
  const [addSubmitting, setAddSubmitting] = useState(false)

  const [editUser, setEditUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
  })
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [roleUser, setRoleUser] = useState<User | null>(null)
  const [roleValue, setRoleValue] = useState<UserRole>("MEDICAL_AFFAIRS")
  const [roleSubmitting, setRoleSubmitting] = useState(false)

  const [resetUser, setResetUser] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [resetSubmitting, setResetSubmitting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, roleFilter, statusFilter])

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const raw = await listUsers(token, {
        search: debouncedQuery || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        page,
        limit,
        sort: "createdAt",
        order: "DESC",
      })
      const norm = normalizeUsersListResponse(raw)
      setUsers(norm.users)
      setTotal(norm.total)
      setTotalPages(norm.totalPages)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users")
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [token, debouncedQuery, roleFilter, statusFilter, page, limit])

  useEffect(() => {
    void load()
  }, [load])

  async function handleAddUser() {
    if (!token) return
    setAddSubmitting(true)
    try {
      await createUser(token, addForm)
      toast.success("User created")
      setAddOpen(false)
      setAddForm({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        role: "MEDICAL_AFFAIRS",
      })
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed")
    } finally {
      setAddSubmitting(false)
    }
  }

  function openEdit(u: User) {
    setEditUser(u)
    setEditForm({
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
    })
  }

  async function handleSaveEdit() {
    if (!token || !editUser) return
    setEditSubmitting(true)
    try {
      await patchUser(token, editUser.id, editForm)
      toast.success("User updated")
      setEditUser(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed")
    } finally {
      setEditSubmitting(false)
    }
  }

  async function handleRoleSave() {
    if (!token || !roleUser) return
    setRoleSubmitting(true)
    try {
      await updateUserRole(token, roleUser.id, roleValue)
      toast.success("Role updated")
      setRoleUser(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Role update failed")
    } finally {
      setRoleSubmitting(false)
    }
  }

  async function handleResetPassword() {
    if (!token || !resetUser) return
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }
    setResetSubmitting(true)
    try {
      await resetUserPassword(token, resetUser.id, newPassword)
      toast.success("Password reset")
      setResetUser(null)
      setNewPassword("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed")
    } finally {
      setResetSubmitting(false)
    }
  }

  async function handleToggle(u: User) {
    if (!token) return
    try {
      await toggleUserStatus(token, u.id)
      toast.success("Status updated")
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed")
    }
  }

  return (
    <AdminPageShell maxWidth="7xl">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              User Management
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage team members and their roles
            </p>
          </div>
          <Button
            type="button"
            className="shrink-0 gap-2 border-0 bg-linear-to-r from-[#518dcd] to-[#7ac0ca] text-white hover:opacity-90 sm:self-end"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-4" />
            Add User
          </Button>
        </div>

        <Card className="shadow-none ring-1 ring-border/80">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search users…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-11 pl-10"
                aria-label="Search users"
              />
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Select
                value={roleFilter || "all"}
                onValueChange={(v) =>
                  setRoleFilter(
                    v == null || v === "all" ? "" : (v as UserRole)
                  )
                }
              >
                <SelectTrigger className="h-11 w-full min-w-[140px] sm:w-[160px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={statusFilter || "all"}
                onValueChange={(v) =>
                  setStatusFilter(
                    v == null || v === "all" ? "" : (v as UserStatus)
                  )
                }
              >
                <SelectTrigger className="h-11 w-full min-w-[140px] sm:w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                  <SelectItem value="SUSPENDED">SUSPENDED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 gap-2 whitespace-nowrap"
              onClick={() =>
                toast.info("Role permissions matrix", {
                  description: "Configure fine-grained permissions when available.",
                })
              }
            >
              <Shield className="size-4" />
              Role Permissions
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="py-4 text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="mt-4 h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {users.map((u) => (
              <AdminUserCard
                key={u.id}
                user={u}
                onEdit={() => openEdit(u)}
                onChangeRole={() => {
                  setRoleUser(u)
                  setRoleValue(u.role)
                }}
                onResetPassword={() => setResetUser(u)}
                onToggleStatus={() => void handleToggle(u)}
              />
            ))}
          </div>
        )}

        {!loading && users.length === 0 && !error && (
          <Card className="shadow-none ring-1 ring-border/80">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No users match your filters.
            </CardContent>
          </Card>
        )}

        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages} ({total} users)
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Creates a new account with the selected role.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="add-fn">First name</Label>
                <Input
                  id="add-fn"
                  value={addForm.firstName}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, firstName: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-ln">Last name</Label>
                <Input
                  id="add-ln"
                  value={addForm.lastName}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, lastName: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={addForm.email}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-pw">Password</Label>
              <Input
                id="add-pw"
                type="password"
                autoComplete="new-password"
                value={addForm.password}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, password: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={addForm.role}
                onValueChange={(v) =>
                  setAddForm((f) => ({
                    ...f,
                    role: (v ?? "MEDICAL_AFFAIRS") as UserRole,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={addSubmitting}
              onClick={() => void handleAddUser()}
            >
              {addSubmitting ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>Update name and email.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ed-fn">First name</Label>
                <Input
                  id="ed-fn"
                  value={editForm.firstName}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, firstName: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ed-ln">Last name</Label>
                <Input
                  id="ed-ln"
                  value={editForm.lastName}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, lastName: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-email">Email</Label>
              <Input
                id="ed-email"
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={editSubmitting}
              onClick={() => void handleSaveEdit()}
            >
              {editSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!roleUser} onOpenChange={(o) => !o && setRoleUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              {roleUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>Role</Label>
            <Select
              value={roleValue}
              onValueChange={(v) =>
                setRoleValue((v ?? "MEDICAL_AFFAIRS") as UserRole)
              }
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRoleUser(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={roleSubmitting}
              onClick={() => void handleRoleSave()}
            >
              {roleSubmitting ? "Saving…" : "Update role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetUser} onOpenChange={(o) => !o && setResetUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetUser?.email}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="new-pw">New password</Label>
            <Input
              id="new-pw"
              type="password"
              autoComplete="new-password"
              className="mt-2"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetUser(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={resetSubmitting}
              onClick={() => void handleResetPassword()}
            >
              {resetSubmitting ? "Saving…" : "Reset password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageShell>
  )
}
