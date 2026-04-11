'use client'

import React from 'react'

export type CanvasBlurOverlayProps = {
  /** When false, nothing is rendered (no layout impact). */
  show: boolean
  /** Optional extra classes on the backdrop (e.g. z-index). */
  className?: string
  /** Stronger blur (default matches a frosted modal over the canvas). */
  blur?: 'sm' | 'md' | 'lg'
  children?: React.ReactNode
}

const blurClass = {
  sm: 'backdrop-blur-[2px]',
  md: 'backdrop-blur-sm',
  lg: 'backdrop-blur-md',
} as const

/**
 * Full-bleed overlay for the drawing area: blur + dim so you can stack any content (word pick, notices, etc.).
 */
export function CanvasBlurOverlay({
  show,
  className = 'z-20',
  blur = 'md',
  children,
}: CanvasBlurOverlayProps) {
  if (!show) return null

  return (
    <div
      className={`pointer-events-auto absolute inset-0 flex items-center justify-center rounded border-2 border-gray-300 ${blurClass[blur]} bg-black/60 ${className}`}
      role="dialog"
      aria-modal="true"
    >
      <div className="max-w-lg px-4 py-6 text-center text-white">{children}</div>
    </div>
  )
}
