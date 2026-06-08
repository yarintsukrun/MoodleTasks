import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
  /** Accessible label for scroll buttons. */
  label?: string
}

export function ScrollRow({ children, className = '', label = 'Scroll for more options' }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setCanScrollLeft(el.scrollLeft > 6)
    setCanScrollRight(maxScroll - el.scrollLeft > 6)
  }, [])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    updateScrollState()
    const observer = new ResizeObserver(updateScrollState)
    observer.observe(el)
    el.addEventListener('scroll', updateScrollState, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', updateScrollState)
    }
  }, [updateScrollState, children])

  function scrollBy(direction: 'left' | 'right') {
    trackRef.current?.scrollBy({
      left: direction === 'left' ? -180 : 180,
      behavior: 'smooth',
    })
  }

  const overflow = canScrollLeft || canScrollRight

  return (
    <div className={`scroll-row ${overflow ? 'has-overflow' : ''} ${className}`.trim()}>
      <div ref={trackRef} className="scroll-row-track">
        {children}
      </div>

      {canScrollLeft && (
        <>
          <div className="scroll-row-fade scroll-row-fade-left" aria-hidden />
          <button
            type="button"
            className="scroll-row-arrow scroll-row-arrow-left"
            onClick={() => scrollBy('left')}
            aria-label={`${label} — previous`}
          >
            ‹
          </button>
        </>
      )}

      {canScrollRight && (
        <>
          <div className="scroll-row-fade scroll-row-fade-right" aria-hidden />
          <button
            type="button"
            className="scroll-row-arrow scroll-row-arrow-right"
            onClick={() => scrollBy('right')}
            aria-label={`${label} — next`}
          >
            ›
          </button>
          <span className="scroll-row-more muted" aria-hidden>
            More →
          </span>
        </>
      )}
    </div>
  )
}
