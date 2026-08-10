'use client'

// "Open the rate con" button, used everywhere a load is shown. Opens the document in a
// modal over the current page instead of navigating to /view/[id]: a dispatcher who
// glances at a rate con should not lose their place in the list, their scroll position
// or the tab they were on, and then have to find it again with the back button.
//
// Never a plain link to the file itself: a direct file link obeys the browser's
// "download PDFs instead of opening them" setting, which saves the file and opens the
// downloads folder instead of showing the document.
//
// A <button>, not an <a>, so it is also safe next to a row link — two nested anchors
// are invalid HTML, which the old version had to warn callers about.
//
// ponytail: 'use client' + useLocale() (context, not a prop) so every server-page
// caller across the app keeps working unchanged — no locale prop to thread through
// files outside this domain.

import { useState } from 'react'
import { DocModal } from '@/components/doc-modal'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function RateConButton({
  docId,
  compact,
}: {
  docId: number
  /** Icon-only pill for list rows; full label for the load page. */
  compact?: boolean
}) {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  return (
    <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      title={t(locale, 'rateconButton.openTitle')}
      aria-label={t(locale, 'rateconButton.openTitle')}
      className={
        compact
          ? 'flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] font-semibold text-white/70 transition-colors hover:border-haul-500 hover:text-haul-400'
          : 'inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-[13px] font-semibold text-white/85 transition-colors hover:border-haul-500 hover:text-haul-400'
      }
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={compact ? 'size-3.5' : 'size-4'}
        aria-hidden
      >
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
      </svg>
      {compact ? 'RC' : t(locale, 'rateconButton.openLabel')}
    </button>
    {open && <DocModal docId={docId} onClose={() => setOpen(false)} />}
    </>
  )
}
