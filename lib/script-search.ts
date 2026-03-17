import type { Script } from "@/types/script"

function stripHtml(html: string): string {
  if (typeof document === "undefined") {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  }
  const div = document.createElement("div")
  div.innerHTML = html
  return (div.textContent ?? div.innerText ?? "").replace(/\s+/g, " ").trim()
}

/**
 * Filter scripts by search query (case-insensitive).
 * Matches against title, insight, and content (plain text).
 */
export function filterScriptsBySearch(
  scripts: Script[],
  query: string
): Script[] {
  const q = query.trim().toLowerCase()
  if (!q) return scripts
  return scripts.filter((s) => {
    const title = (s.title ?? "").toLowerCase()
    const insight = (s.insight ?? "").toLowerCase()
    const content = stripHtml(s.content ?? "").toLowerCase()
    return title.includes(q) || insight.includes(q) || content.includes(q)
  })
}
