import { Settings2 } from "lucide-react"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { Card, CardContent } from "@/components/ui/card"

export default function SettingsPage() {
  return (
    <AdminPageShell>
      <div className="space-y-6">
        <AdminPageHeader
          title="Settings"
          description="Account and system preferences — coming soon."
        />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Settings2 className="size-12 text-muted-foreground" />
            <p className="mt-4 font-medium">Settings not configured yet</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Notification, theme, and workspace options will align with the
              profile and app-wide settings patterns.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminPageShell>
  )
}
