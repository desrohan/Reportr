'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

// Reduced-motion preference as an external store: server snapshot is `false`
// (so SSR and first client render match), the client snapshot reads matchMedia,
// and the subscription keeps it in sync if the OS setting changes.
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false
  )
}

/**
 * Reveals its children with a gentle rise the first time they scroll into view.
 * Falls back to immediately visible when JS runs with reduced-motion enabled.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'li'
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [intersected, setIntersected] = useState(false)
  const prefersReduced = usePrefersReducedMotion()
  const shown = intersected || prefersReduced

  useEffect(() => {
    if (prefersReduced) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIntersected(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [prefersReduced])

  return (
    <Tag
      // @ts-expect-error - ref typing across the union of tags is fine at runtime
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
      className={`transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      } ${className}`}
    >
      {children}
    </Tag>
  )
}
