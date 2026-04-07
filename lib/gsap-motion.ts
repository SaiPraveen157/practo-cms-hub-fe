/** Shared timing for UI motion (GSAP). Slightly pronounced so entrances read clearly. */

export const GSAP_EASE = "power3.out" as const

export const GSAP_DURATION = {
  page: 0.52,
  fade: 0.58,
  navItem: 0.4,
} as const

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}
