"use client"

import { Loader2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export type VideoVersionHistoryOption = {
  version: number
  triggerLabel: string
  listLabel: string
}

type Props = {
  showToolbar: boolean
  listLoading: boolean
  selectValue: string
  onSelectValueChange: (v: string | null) => void
  versionOptions: VideoVersionHistoryOption[]
  isViewingArchived: boolean
  detailLoading: boolean
  id?: string
}

/** Version dropdown + archived banner for Phase 4–5 video timestamp threads (mirrors script sticker toolbar). */
export function VideoVersionHistoryToolbar({
  showToolbar,
  listLoading,
  selectValue,
  onSelectValueChange,
  versionOptions,
  isViewingArchived,
  detailLoading,
  id = "video-version-history-select",
}: Props) {
  if (!showToolbar) return null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id} className="shrink-0">
          File version
        </Label>
        {listLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {listLoading && !selectValue ? (
        <div className="flex min-h-10 w-full max-w-xl items-center rounded-md border border-dashed border-border bg-muted/30 px-3 text-sm text-muted-foreground">
          Loading versions…
        </div>
      ) : versionOptions.length > 0 && selectValue ? (
        <Select value={selectValue} onValueChange={onSelectValueChange}>
          <SelectTrigger
            id={id}
            className={cn(
              "h-auto min-h-10 w-full max-w-xl py-2",
              "[&_[data-slot=select-value]]:line-clamp-2 [&_[data-slot=select-value]]:whitespace-normal [&_[data-slot=select-value]]:text-left"
            )}
          >
            <SelectValue>
              {versionOptions.find((o) => String(o.version) === selectValue)
                ?.triggerLabel ?? `v${selectValue}`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {versionOptions.map((row) => (
              <SelectItem key={row.version} value={String(row.version)}>
                {row.listLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {isViewingArchived ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
          {detailLoading ? (
            <span className="flex items-center gap-2 text-muted-foreground dark:text-amber-100/90">
              <Loader2 className="size-3.5 animate-spin" />
              Loading this version…
            </span>
          ) : (
            <span>
              Viewing an archived file version — read-only. Timestamp comments
              shown are for this version only. Select the current version to add
              notes or use review actions.
            </span>
          )}
        </div>
      ) : null}
    </div>
  )
}
