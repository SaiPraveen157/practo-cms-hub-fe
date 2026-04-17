import { UploadCloud } from "lucide-react"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { Card, CardContent } from "@/components/ui/card"

export default function UploadPage() {
  return (
    <AdminPageShell>
      <div className="space-y-6">
        <AdminPageHeader
          title="Upload"
          description="Upload new content — wiring to APIs will follow."
        />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <UploadCloud className="size-12 text-muted-foreground" />
            <p className="mt-4 font-medium">Upload flow coming soon</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              This area will support uploading videos and assets using the same
              patterns as the rest of Practo Hub CMS.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminPageShell>
  )
}
