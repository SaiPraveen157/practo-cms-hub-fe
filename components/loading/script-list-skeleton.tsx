import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const CARD_COUNT = 4

export function ScriptListSkeleton() {
  return (
    <ul className="space-y-4">
      {Array.from({ length: CARD_COUNT }).map((_, i) => (
        <li key={i}>
          <Card className="overflow-hidden shadow-sm">
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-6 flex-1 max-w-[70%]" />
                <Skeleton className="h-5 w-24 shrink-0 rounded-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[85%]" />
              </div>
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-9 w-32" />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}
