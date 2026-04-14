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

type VersionOption = {
  version: number
  /** Closed trigger — always "Version N" */
  triggerLabel: string
  /** Open dropdown row — no resolved counts */
  listLabel: string
}

type Props = {
  showToolbar: boolean
  listLoading: boolean
  selectValue: string
  onSelectValueChange: (v: string | null) => void
  versionOptions: VersionOption[]
  isViewingSnapshot: boolean
  snapshotLoading: boolean
  id?: string
}

export function ScriptStickerVersionToolbar({
  showToolbar,
  listLoading,
  selectValue,
  onSelectValueChange,
  versionOptions,
  isViewingSnapshot,
  snapshotLoading,
  id = "script-version-view-select",
}: Props) {
  if (!showToolbar) return null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id} className="shrink-0">
          Version
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
                ?.triggerLabel ?? `Version ${selectValue}`}
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
      {isViewingSnapshot ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {snapshotLoading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Loading version…
            </>
          ) : (
            <span>
              Viewing an archived script version (read-only). Select the
              current version to edit.
            </span>
          )}
        </div>
      ) : null}
    </div>
  )
}
