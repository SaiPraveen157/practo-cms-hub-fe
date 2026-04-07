import { ProtectedRoute } from "@/components/protected-route"
import { AppSidebar } from "@/components/app-sidebar"
import { GsapRouteContent } from "@/components/motion"

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute>
      <div className="flex min-h-svh">
        <AppSidebar />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-background">
          <GsapRouteContent>{children}</GsapRouteContent>
        </main>
      </div>
    </ProtectedRoute>
  )
}
