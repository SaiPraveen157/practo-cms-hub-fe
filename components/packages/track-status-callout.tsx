import type { ReactNode } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TRACK_STATUS_LABELS, trackStatusSurfaceClass } from "@/lib/package-ui"
import type { PackageTrackStatus } from "@/types/package"
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

export function TrackStatusCallout({
  status,
  title,
  children,
  /** When set, drives icon, border tint, and badge variant (e.g. “approved” track still waiting on another reviewer). */
  appearanceStatus,
  badgeLabel,
  headerDescription,
}: {
  status: PackageTrackStatus
  title: string
  children: ReactNode
  appearanceStatus?: PackageTrackStatus
  badgeLabel?: string
  headerDescription?: ReactNode
}) {
  const vis = appearanceStatus ?? status
  return (
    <Card className={cn("border-2 shadow-none", trackStatusSurfaceClass(vis))}>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2.5 text-lg leading-tight font-semibold">
            {vis === "APPROVED" && (
              <CheckCircle2 className="size-5 shrink-0 text-green-600 dark:text-green-400" />
            )}
            {vis === "PENDING" && (
              <Clock className="size-5 shrink-0 text-muted-foreground" />
            )}
            {vis === "REJECTED" && (
              <AlertTriangle className="size-5 shrink-0 text-destructive" />
            )}
            {title}
          </CardTitle>
          <Badge
            variant={
              vis === "REJECTED"
                ? "destructive"
                : vis === "APPROVED"
                  ? "default"
                  : "secondary"
            }
            className={cn(
              "shrink-0",
              badgeLabel
                ? "max-w-[min(100%,20rem)] text-center text-xs leading-tight font-medium whitespace-normal normal-case"
                : "uppercase"
            )}
          >
            {badgeLabel ?? TRACK_STATUS_LABELS[status]}
          </Badge>
        </div>
        <CardDescription className="text-xs font-normal text-muted-foreground">
          {headerDescription !== undefined ? (
            headerDescription
          ) : (
            <>
              {status === "APPROVED" &&
                "You do not need to upload or edit anything for this track."}
              {status === "PENDING" &&
                "Waiting on reviewers — nothing for you to do on this track yet."}
              {status === "REJECTED" &&
                "Reviewers asked for changes — follow the steps below this card."}
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="border-t border-border/60 pt-4 text-sm leading-relaxed">
        <div className="text-foreground [&_p]:leading-relaxed">{children}</div>
      </CardContent>
    </Card>
  )
}
