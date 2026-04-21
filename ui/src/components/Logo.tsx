interface LogoProps {
  size?: number
  className?: string
}

/**
 * Riverflow brand mark — a single continuous double-wave glyph.
 * Uses currentColor so it inherits ink from its parent.
 */
export function Logo({ size = 20, className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-label="Riverflow"
    >
      <path
        d="M3 12 Q9 6 15 12 T27 12 M3 20 Q9 14 15 20 T27 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

