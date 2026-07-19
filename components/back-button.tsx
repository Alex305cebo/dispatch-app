import Link from 'next/link'

// A plain "← text" link reads as decoration at a glance, not a control — dispatchers
// were missing it and using the browser's own back button instead. A bordered pill
// with a real icon reads as a button, matching every other secondary action in the app.
export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-[13px] font-semibold text-white/85 transition-colors hover:border-haul-500 hover:bg-white/[0.06] hover:text-haul-400"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
        aria-hidden
      >
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
      {label}
    </Link>
  )
}
