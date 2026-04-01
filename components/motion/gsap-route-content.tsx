"use client"

import { useLayoutEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import gsap from "gsap"

import { GSAP_DURATION, GSAP_EASE, prefersReducedMotion } from "@/lib/gsap-motion"
import { cn } from "@/lib/utils"

type GsapRouteContentProps = {
  children: React.ReactNode
  className?: string
}

/**
 * Fades/slides main content on route change. Respects `prefers-reduced-motion`.
 */
export function GsapRouteContent({ children, className }: GsapRouteContentProps) {
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    if (prefersReducedMotion()) {
      gsap.set(el, { opacity: 1, y: 0, scale: 1, clearProps: "transform" })
      return
    }

    gsap.killTweensOf(el)
    gsap.set(el, { opacity: 0, y: 16, scale: 0.985 })
    const tween = gsap.to(el, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: GSAP_DURATION.page,
      ease: GSAP_EASE,
    })

    return () => {
      tween.kill()
    }
  }, [pathname])

  return (
    <div ref={ref} className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      {children}
    </div>
  )
}
