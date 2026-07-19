'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { clearNotes, markAllRead, useNotes, type NoteKind } from '@/lib/notify'

const TONE: Record<NoteKind, { dot: string; text: string }> = {
  ok: { dot: 'bg-good-400', text: 'text-good-400' },
  warn: { dot: 'bg-amber-400', text: 'text-amber-300' },
  error: { dot: 'bg-bad-400', text: 'text-bad-400' },
  msg: { dot: 'bg-haul-400', text: 'text-haul-400' },
}

export function Notifier() {
  const notes = useNotes()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unread = notes.filter((n) => !n.read).length
  const worst: NoteKind | null = notes.some((n) => !n.read && n.kind === 'error')
    ? 'error'
    : notes.some((n) => !n.read && n.kind === 'warn')
      ? 'warn'
      : unread > 0
        ? 'msg'
        : null

  useEffect(() => {
    if (!open) return
    // Depends on `notes` too: while the panel is open the user is looking at them,
    // so an arriving note is already read — the badge must not light up behind it.
    markAllRead()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open, notes])

  return (
    // Lives inside the nav now (see components/nav.tsx) — no longer floats over the
    // page. The panel is absolute to this button and opens upward, spilling out of
    // the narrow sidebar over the content, which is what we want.
    <div ref={ref} className="relative">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            // Opaque: this floats over page content, and the translucent .panel fill
            // let cards show through. The var keeps it correct in both themes.
            style={{ transformOrigin: 'bottom center', background: 'var(--color-ink-800)' }}
            // Phone: the bell sits at the right edge, so open leftwards (right-0) or the
            // panel runs off screen. Desktop: the bell is in the narrow sidebar, so open
            // rightwards (left-0) out over the page.
            className="panel absolute bottom-12 right-0 z-[60] max-h-[60vh] w-[min(20rem,calc(100vw-2rem))] overflow-hidden md:left-0 md:right-auto"
          >
            <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/65">
                Уведомления
              </span>
              {notes.length > 0 && (
                <button
                  onClick={clearNotes}
                  className="text-[11px] text-white/62 transition-colors hover:text-white/85"
                >
                  очистить
                </button>
              )}
            </div>

            <div className="max-h-[calc(60vh-2.5rem)] overflow-y-auto">
              {notes.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-white/55">Пока тихо</p>
              ) : (
                notes.map((n) => (
                  <motion.div
                    key={n.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex gap-2.5 border-b border-white/5 px-3 py-2.5 last:border-0"
                  >
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${TONE[n.kind].dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug text-white/90">{n.text}</p>
                      <p className="mt-0.5 text-[10px] text-white/55">
                        {n.from ? `${n.from} · ` : ''}
                        {new Date(n.at).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        // Pulse only while something is unread — an always-animating button is noise.
        animate={worst && !open ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={
          worst && !open
            ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
            : { type: 'spring', stiffness: 400, damping: 25 }
        }
        aria-label={unread > 0 ? `Уведомления: ${unread} новых` : 'Уведомления'}
        aria-expanded={open}
        className={`relative flex size-9 items-center justify-center rounded-full border backdrop-blur-xl transition-colors ${
          worst === 'error'
            ? 'border-bad-500/40 bg-bad-500/15 text-bad-400'
            : worst === 'warn'
              ? 'border-amber-400/40 bg-amber-400/12 text-amber-300'
              : 'border-white/10 bg-ink-800/80 text-white/72 hover:text-white/90'
        }`}
        style={{ boxShadow: '0 8px 30px -8px rgba(0,0,0,0.8)' }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[18px]"
          aria-hidden
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>

        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-haul-500 px-1 text-[10px] font-bold text-white ring-2 ring-ink-950"
            >
              {unread > 9 ? '9+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
