"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getScriptDisplayInfo } from "@/lib/script-status-styles"
import {
  getWordCountFromHtml,
  getRelativeTime,
  getAuthorDisplayName,
  getAuthorInitials,
} from "@/lib/script-card-utils"
import { ScriptTatBar } from "@/components/script-tat-bar"
import type { Script } from "@/types/script"
import { Clock, FileText, Eye } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ScriptListingCardProps {
  script: Script
  detailHref: string
  authorSubtitle?: string
  onCardClick?: () => void
  /** Extra action buttons beside Preview — omit when read-only (e.g. informational list). */
  actions?: React.ReactNode
}

export function ScriptListingCard({
  script,
  detailHref,
  authorSubtitle = "Content Creator",
  onCardClick,
  actions,
}: ScriptListingCardProps) {
  const displayInfo = getScriptDisplayInfo(script)
  const wordCount = getWordCountFromHtml(script.content ?? "")
  const timeAgo = getRelativeTime(script.updatedAt ?? script.createdAt ?? "")
  const authorName = getAuthorDisplayName(script.createdBy)
  const initials = getAuthorInitials(script.createdBy)

  const cardInteractive = Boolean(onCardClick)

  return (
    <Card
      className={cn(
        "flex flex-col overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border/50 transition-shadow",
        cardInteractive &&
          "cursor-pointer hover:shadow-md"
      )}
      onClick={onCardClick}
      role={cardInteractive ? "button" : undefined}
      tabIndex={cardInteractive ? 0 : undefined}
      onKeyDown={
        cardInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onCardClick?.()
              }
            }
          : undefined
      }
    >
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium uppercase",
              displayInfo.pillClassName
            )}
          >
            <Clock className="size-3.5 shrink-0" />
            {displayInfo.label}
          </span>
          <span className="text-xs text-muted-foreground">Version {script.version}</span>
        </div>

        <h3 className="min-w-0 flex-1 text-lg font-semibold leading-tight text-foreground">
          {script.title || "Untitled script"}
        </h3>

        <div className="flex items-center gap-3">
          <Avatar size="sm" className="size-9 shrink-0">
            <AvatarFallback className="bg-teal-100 text-sm font-medium text-teal-800 dark:bg-teal-900/50 dark:text-teal-200">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{authorName}</p>
            <p className="text-xs text-muted-foreground">{authorSubtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <FileText className="size-3.5 shrink-0" />
            {wordCount} word{wordCount !== 1 ? "s" : ""}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5 shrink-0" />
            {timeAgo}
          </span>
        </div>

        <ScriptTatBar script={script} />

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/50 pt-4">
          <Button variant="outline" size="sm" className="gap-1.5" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <Link href={detailHref}>
              <Eye className="size-4 shrink-0" />
              Preview
            </Link>
          </Button>
          {actions}
        </div>
      </CardContent>
    </Card>
  )
}
