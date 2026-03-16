"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const Pagination = ({ className, ...props }: React.ComponentProps<"nav">) => (
  <nav
    role="navigation"
    aria-label="pagination"
    className={cn("mx-auto w-full", className)}
    {...props}
  />
)
Pagination.displayName = "Pagination"

const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn(
      "flex flex-wrap items-center justify-center gap-1",
      className
    )}
    {...props}
  />
))
PaginationContent.displayName = "PaginationContent"

const PaginationItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("list-none", className)} {...props} />
))
PaginationItem.displayName = "PaginationItem"

type PaginationLinkProps = {
  isActive?: boolean
} & React.ComponentProps<"button">

const PaginationLink = ({
  className,
  isActive,
  ...props
}: PaginationLinkProps) => (
  <Button
    aria-current={isActive ? "page" : undefined}
    variant={isActive ? "default" : "outline"}
    size="sm"
    className={cn("min-w-8", isActive && "pointer-events-none", className)}
    {...props}
  />
)
PaginationLink.displayName = "PaginationLink"

const PaginationPrevious = ({
  className,
  onClick,
  disabled,
  ...props
}: React.ComponentProps<"button">) => (
  <Button
    aria-label="Go to previous page"
    variant="outline"
    size="sm"
    className={cn("gap-1", className)}
    onClick={onClick}
    disabled={disabled}
    {...props}
  >
    <ChevronLeft className="size-4" />
  </Button>
)
PaginationPrevious.displayName = "PaginationPrevious"

const PaginationNext = ({
  className,
  onClick,
  disabled,
  ...props
}: React.ComponentProps<"button">) => (
  <Button
    aria-label="Go to next page"
    variant="outline"
    size="sm"
    className={cn("gap-1", className)}
    onClick={onClick}
    disabled={disabled}
    {...props}
  >
    <ChevronRight className="size-4" />
  </Button>
)
PaginationNext.displayName = "PaginationNext"

const PaginationEllipsis = ({
  className,
  ...props
}: React.ComponentProps<"span">) => (
  <span
    aria-hidden
    className={cn("flex size-8 items-center justify-center", className)}
    {...props}
  >
    <MoreHorizontal className="size-4" />
  </span>
)
PaginationEllipsis.displayName = "PaginationEllipsis"

/** Props for the high-level pagination used on script list pages */
interface ScriptListPaginationProps {
  page: number
  totalPages: number
  total?: number
  limit: number
  onPageChange: (page: number) => void
  className?: string
}

function getPageRange(page: number, totalPages: number) {
  const delta = 1
  const range: number[] = []
  const rangeWithDots: (number | "ellipsis")[] = []
  let l: number | undefined
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= page - delta && i <= page + delta)
    ) {
      range.push(i)
    }
  }
  for (const i of range) {
    if (l !== undefined && i - l !== 1) {
      rangeWithDots.push("ellipsis")
    }
    rangeWithDots.push(i)
    l = i
  }
  return rangeWithDots
}

/** High-level pagination: "Showing X–Y of Z" + shadcn-style page controls. Sticks to bottom. */
function ScriptListPagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  className,
}: ScriptListPaginationProps) {
  const start = total !== undefined ? (page - 1) * limit + 1 : null
  const end = total !== undefined ? Math.min(page * limit, total) : null
  const hasPrev = page > 1
  const hasNext = page < totalPages

  if (totalPages <= 1 && (total === undefined || total <= limit)) return null

  const pageRange = getPageRange(page, totalPages)

  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-6 mt-6 -mb-6 border-t bg-background/95 px-6 pt-4 pb-6 backdrop-blur supports-backdrop-filter:bg-background/80 md:-mx-8 md:-mb-8 md:px-8 md:pb-8",
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="whitespace-nowrap text-sm text-muted-foreground">
          {total !== undefined && start != null && end != null ? (
            <>
              Showing{" "}
              <span className="font-medium text-foreground">{start}</span>–
              <span className="font-medium text-foreground">{end}</span> of{" "}
              <span className="font-medium text-foreground">{total}</span>
            </>
          ) : (
            <>
              Page <span className="font-medium text-foreground">{page}</span>{" "}
              of{" "}
              <span className="font-medium text-foreground">{totalPages}</span>
            </>
          )}
        </p>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => onPageChange(page - 1)}
                disabled={!hasPrev}
              />
            </PaginationItem>
            {pageRange.map((p, i) =>
              p === "ellipsis" ? (
                <PaginationItem key={`ellipsis-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <PaginationLink
                    isActive={page === p}
                    onClick={() => onPageChange(p)}
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              )
            )}
            <PaginationItem>
              <PaginationNext
                onClick={() => onPageChange(page + 1)}
                disabled={!hasNext}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  ScriptListPagination,
}
