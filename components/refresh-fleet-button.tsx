'use client'

import { useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { refreshFleetStatus } from '@/app/actions'
import { notify } from '@/lib/notify'

/** GPS older than this on page open = pull fresh automatically. */
const STALE_MINUTES = 10

/** While the page is open, poll this often so the fleet visibly moves instead of
 * sitting still until someone reloads. 30s: often enough to read as "live" against a
 * ~1-2min real GPS ping rate from the trucks themselves, without hammering the
 * third-party Live Share endpoints (7 trucks × 2 requests ≈ 14 req/30s, only while
 * this tab is open and visible — paused in a background tab). */
const POLL_MS = 30_000

/** Pulls fresh GPS from Live Share (+ vendor API if configured) right now, instead
 * of waiting for the external cron — which only runs against a deployed URL, so on
 * a local/dev instance this button (plus the auto-catch-up and live poll below) is
 * the ONLY thing that ever refreshes position data. */
export function RefreshFleetButton({ staleMinutes }: { staleMinutes: number | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  // Effects run twice in dev StrictMode; without this the auto-refresh would fire
  // two ELD polls back-to-back on every page open.
  const autoFired = useRef(false)

  function refresh(silent = false) {
    start(async () => {
      const res = await refreshFleetStatus()
      if (res.errors.length && !silent) notify('warn', res.errors.join(' · '))
      else if (!silent)
        notify('ok', res.updated > 0 ? `Обновлено траков: ${res.updated}` : 'Новых данных нет')
      router.refresh()
    })
  }

  useEffect(() => {
    if (autoFired.current) return
    if (staleMinutes === null || staleMinutes < STALE_MINUTES) return
    autoFired.current = true
    refresh(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staleMinutes])

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh(true)
    }, POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="flex items-center gap-1 text-[10px] text-good-400" title="Обновляется само каждые 30с">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-good-400 opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-good-500" />
        </span>
        live
      </span>
      <button
        disabled={pending}
        onClick={() => refresh()}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
      >
        <span className={pending ? 'animate-spin' : ''}>↻</span>
        {pending ? 'Обновляю…' : 'Обновить'}
      </button>
    </div>
  )
}
