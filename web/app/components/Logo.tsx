import Link from 'next/link'

/**
 * The Reportr wordmark: a blue "aperture" tile + the name. Used in the landing
 * nav and the dashboard sidebar so the brand reads the same everywhere.
 */
export function Logo({
  href = '/',
  size = 'md',
  showWordmark = true,
}: {
  href?: string | null
  size?: 'sm' | 'md'
  showWordmark?: boolean
}) {
  const tile = size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-9 w-9 rounded-xl'
  const glyph = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  const word = size === 'sm' ? 'text-lg' : 'text-xl'

  const mark = (
    <span className="flex items-center gap-2.5">
      <span
        className={`flex ${tile} items-center justify-center bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-600/25`}
      >
        <svg
          className={`${glyph} text-white`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9.5" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </span>
      {showWordmark && (
        <span className={`font-semibold tracking-tight text-white ${word}`}>Reportr</span>
      )}
    </span>
  )

  if (href === null) return mark
  return (
    <Link href={href} className="inline-flex items-center focus:outline-none">
      {mark}
    </Link>
  )
}
