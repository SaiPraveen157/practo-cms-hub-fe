import { ProtectedRoute } from "@/components/protected-route"
import { AppSidebar } from "@/components/app-sidebar"

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute>
      <div className="flex min-h-svh">
        <AppSidebar />
        <main className="min-w-0 flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  )
}
