// Shown the instant a navigation starts, until the new page's server render arrives.
//
// Before this file the app had NO loading boundary anywhere, and every page is
// `force-dynamic` — so a click on a tab or a card left the old page on screen,
// untouched, for the whole round-trip. Measured against production: a truck page
// answers in 0.4–0.7s and a list in ~0.3s, which is not slow — but with nothing
// changing on screen it reads as "the click didn't register", and people click again.
//
// It also fixes prefetch: <Link> prefetching a dynamic route can only fetch its
// loading boundary. With none, prefetch had nothing to warm and every navigation
// started from zero.
//
// Deliberately generic — one file covers every route. A route whose shape is worth
// mirroring exactly can drop its own loading.tsx beside its page.tsx and win.
export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl animate-pulse px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      {/* Heading block — every page opens with a title and a subtitle line. */}
      <div className="h-7 w-52 rounded-lg bg-white/8" />
      <div className="mt-2 h-4 w-80 max-w-full rounded bg-white/5" />

      {/* Content: a wide panel, then a few rows. Close enough to the loads, trucks,
          tracking and detail pages that the swap doesn't jump when the real page lands. */}
      <div className="mt-5 h-24 rounded-3xl border border-white/8 bg-white/[0.03]" />
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-20 rounded-3xl border border-white/8 bg-white/[0.03]" />
        ))}
      </div>
    </main>
  )
}
