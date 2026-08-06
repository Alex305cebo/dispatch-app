'use client'

// Shown the instant a navigation starts, until the new page's server render arrives.
//
// Before this file the app had NO loading boundary anywhere, and every page is
// `force-dynamic` — so a click on a tab or a card left the old page on screen,
// untouched, for the whole round-trip, and the click read as "didn't register".
// It also fixes prefetch: <Link> prefetching a dynamic route can only fetch its
// loading boundary, so with none there was nothing to warm.
//
// A client component on purpose: the placeholder has to say "loading" in the user's
// own language, and locale lives in LocaleProvider. It must NOT be async — an async
// fallback would itself suspend, which is the one thing a fallback may never do.
//
// Blocks are `.panel`, not hand-rolled `bg-white/[0.03]`: the first version used the
// latter and was all but invisible on the light theme (reported live, with a
// screenshot of a near-blank page). `.panel` carries its own light-theme override,
// so the skeleton looks like the cards it stands in for in BOTH themes.
//
// Deliberately generic — one file covers every route. A route whose shape is worth
// mirroring exactly can drop its own loading.tsx beside its page.tsx and win.

import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70 ${className}`}
    />
  )
}

export default function Loading() {
  const locale = useLocale()
  const label = t(locale, 'common.loading')

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      {/* One unmistakable status line at the top. role=status so a screen reader
          announces it too — a pulsing rectangle says nothing out loud. */}
      <div role="status" className="flex items-center gap-2 text-[13px] font-medium text-white/70">
        <Spinner />
        {label}
      </div>

      <div className="mt-4 animate-pulse space-y-4">
        <div className="panel h-24" />
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            // The label repeats on every card because the ask was explicit: it must be
            // readable ON the card that a real card will replace, not only at the top.
            <div key={i} className="panel flex h-20 items-center gap-2 px-4 text-[12px] text-white/40">
              <Spinner className="size-3" />
              {label}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
