import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function ScriptDetailSkeleton() {
  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-4">
          <Skeleton className="h-9 w-32" />
          <div>
            <Skeleton className="h-8 w-[80%] max-w-md" />
            <div className="mt-2 flex items-center gap-2">
              <Skeleton className="h-5 w-36 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-full max-w-md" />
              <Skeleton className="h-5 w-[90%]" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[80%]" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
