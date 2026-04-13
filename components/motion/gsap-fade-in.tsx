"use client"

import { useLayoutEffect, useRef } from "react"
import gsap from "gsap"

import { GSAP_DURATION, GSAP_EASE, prefersReducedMotion } from "@/lib/gsap-motion"
import { cn } from "@/lib/utils"

type GsapFadeInProps = {
  children: React.ReactNode
  className?: string
  /** Extra delay before the tween (seconds). */
  delay?: number
}

/**
 * One-shot fade + slight rise for hero panels (login, etc.).
 */
export function GsapFadeIn({ children, className, delay = 0 }: GsapFadeInProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    if (prefersReducedMotion()) {
      gsap.set(el, { opacity: 1, y: 0 })
      return
    }

    gsap.killTweensOf(el)
    gsap.set(el, { opacity: 0, y: 22 })
    const tween = gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: GSAP_DURATION.fade,
      ease: GSAP_EASE,
      delay,
    })

    return () => {
      tween.kill()
    }
  }, [delay])

  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  )
}
