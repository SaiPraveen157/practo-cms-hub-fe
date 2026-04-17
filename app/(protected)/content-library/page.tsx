import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { ContentLibraryView } from "@/components/admin/content-library-view"

function LibraryFallback() {
  return (
    <div className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      <span className="text-sm">Loading…</span>
    </div>
  )
}

export default function ContentLibraryPage() {
  return (
    <Suspense fallback={<LibraryFallback />}>
      <ContentLibraryView />
    </Suspense>
  )
}
