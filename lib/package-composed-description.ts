/**
 * Parses composed `package.description` (legacy) or builds blocks from nested
 * per-video fields on `PackageAsset` (redesigned API).
 */

import type { FinalPackage } from "@/types/package"
import { videoAssets } from "@/lib/package-ui"

export type PackageDescriptionBlock = {
  heading: string
  body: string
}

export function parsePerVideoPackageDescriptionBlocks(
  full: string
): PackageDescriptionBlock[] {
  const trimmed = full.trim()
  if (!trimmed) return []

  const withoutIntro = trimmed
    .replace(
      /^\s*Per-video metadata for all deliverables below\.?\s*/i,
      ""
    )
    .trim()

  const headerRe = /^──\s*(.+?)\s*──\s*$/gm
  const markers: { index: number; endOfLine: number; heading: string }[] = []
  let m: RegExpExecArray | null
  while ((m = headerRe.exec(withoutIntro)) !== null) {
    const lineStart = m.index
    const lineEnd = withoutIntro.indexOf("\n", lineStart)
    const eol = lineEnd === -1 ? withoutIntro.length : lineEnd
    markers.push({
      index: lineStart,
      endOfLine: eol,
      heading: m[1].trim(),
    })
  }

  if (markers.length === 0) {
    return [{ heading: "Package description", body: trimmed }]
  }

  return markers.map((mark, i) => {
    const contentStart =
      mark.endOfLine >= withoutIntro.length
        ? withoutIntro.length
        : mark.endOfLine + 1
    const nextStart =
      i + 1 < markers.length ? markers[i + 1].index : withoutIntro.length
    const body = withoutIntro.slice(contentStart, nextStart).trim()
    return { heading: mark.heading, body }
  })
}

/** Drops non-video appendix sections (e.g. thumbnail pairing note from Agency submit). */
export function filterVideoDeliverableDescriptionBlocks(
  blocks: PackageDescriptionBlock[]
): PackageDescriptionBlock[] {
  if (blocks.length <= 1) return blocks
  const filtered = blocks.filter(
    (b) =>
      b.heading === "Long-form video" ||
      /^Short-form video \d+$/i.test(b.heading)
  )
  return filtered.length > 0 ? filtered : blocks
}

/**
 * Parses one deliverable body from `buildComposedPackageDescription` `fmt()`:
 * Title / Description / Tags lines. If none match, returns the whole body as description.
 */
export function parseAgencyDeliverableBlockBody(body: string): {
  title: string
  description: string
  tags: string[]
} {
  const raw = body.trim()
  if (!raw) {
    return { title: "", description: "", tags: [] }
  }

  const lines = raw.split(/\r?\n/)
  let title = ""
  const descLines: string[] = []
  const tags: string[] = []
  let mode: "seek_title" | "description" = "seek_title"

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""

    if (mode === "seek_title") {
      const tm = line.match(/^Title:\s*(.*)$/)
      if (tm) {
        title = (tm[1] ?? "").trim()
        continue
      }
      if (/^Description:\s*$/.test(line)) {
        mode = "description"
        continue
      }
      if (line.startsWith("Description:")) {
        const rest = line.slice("Description:".length).trim()
        if (rest) descLines.push(rest)
        mode = "description"
        continue
      }
      continue
    }

    const tagm = line.match(/^Tags:\s*(.*)$/)
    if (tagm) {
      tagm[1]!.split(",").forEach((t) => {
        const x = t.trim()
        if (x) tags.push(x)
      })
      break
    }
    descLines.push(line)
  }

  const description = descLines.join("\n").trim()
  if (!title && !description && tags.length === 0) {
    return { title: "", description: raw, tags: [] }
  }
  return { title, description, tags }
}

/** Human-readable copy for a single deliverable (e.g. under a video player). */
export function formatAgencyDeliverableBlockForDisplay(
  block: PackageDescriptionBlock | undefined
): string | null {
  if (!block?.body.trim()) return null
  const p = parseAgencyDeliverableBlockBody(block.body)
  const parts: string[] = []
  if (p.title) parts.push(`Title: ${p.title}`)
  if (p.description) parts.push(`Description:\n${p.description}`)
  if (p.tags.length) parts.push(`Tags: ${p.tags.join(", ")}`)
  if (parts.length > 0) return parts.join("\n\n")
  return block.body.trim()
}

/** Blocks for UI: prefer nested `title`/`description`/`tags` on video assets, else legacy description. */
export function videoDeliverableBlocksFromPackage(
  pkg: FinalPackage
): PackageDescriptionBlock[] {
  const videos = [...videoAssets(pkg)].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  )
  const hasPerVideoFields = videos.some(
    (v) =>
      Boolean(v.title?.trim()) ||
      Boolean(v.description?.trim()) ||
      (v.tags?.length ?? 0) > 0
  )
  if (hasPerVideoFields && videos.length > 0) {
    let shortNum = 0
    return videos.map((v) => {
      const heading =
        v.type === "LONG_FORM"
          ? "Long-form video"
          : `Short-form video ${++shortNum}`
      const lines = [
        v.title?.trim() ? `Title: ${v.title.trim()}` : "",
        "Description:",
        v.description?.trim() ?? "",
        v.tags?.length ? `Tags: ${v.tags!.join(", ")}` : "",
      ].filter((line) => line !== "")
      return { heading, body: lines.join("\n") }
    })
  }
  return filterVideoDeliverableDescriptionBlocks(
    parsePerVideoPackageDescriptionBlocks(pkg.description ?? "")
  )
}

/**
 * Agency copy string for a video review step index (long-form first, then shorts).
 * Uses filtered video-deliverable blocks only.
 */
export function agencyCopyForVideoReviewStep(
  blocks: PackageDescriptionBlock[],
  videoStepIndex: number
): string | null {
  if (blocks.length === 0) return null
  if (blocks.length > 1) {
    return formatAgencyDeliverableBlockForDisplay(blocks[videoStepIndex])
  }
  return videoStepIndex === 0
    ? formatAgencyDeliverableBlockForDisplay(blocks[0])
    : null
}
