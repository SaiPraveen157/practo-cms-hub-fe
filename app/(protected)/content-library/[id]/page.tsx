import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { ContentDetailView } from "@/components/admin/content-detail-view"

function DetailFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      <span className="text-sm">Loading…</span>
    </div>
  )
}

export default function ContentLibraryDetailPage() {
  return (
    <Suspense fallback={<DetailFallback />}>
      <ContentDetailView />
    </Suspense>
  )
}
