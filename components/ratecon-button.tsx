// "Open the rate con" button, used everywhere a load is shown. Points at the in-app
// viewer (/view/[id]), NOT at the raw file: a direct file link obeys the browser's
// "download PDFs instead of opening them" setting, which saves the file and opens the
// downloads folder instead of showing the document.
//
// NOTE: never nest this inside a <Link> row — two anchors inside each other is
// invalid HTML; put it as a sibling of the row link.

export function RateConButton({
  docId,
  compact,
}: {
  docId: number
  /** Icon-only pill for list rows; full label for the load page. */
  compact?: boolean
}) {
  return (
    <a
      href={`/view/${docId}`}
      title="Открыть rate confirmation"
      aria-label="Открыть rate confirmation"
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
      {compact ? 'RC' : 'Открыть rate con'}
    </a>
  )
}
