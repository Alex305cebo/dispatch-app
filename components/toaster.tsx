'use client'

// Transient toasts for actions the user just took.
//
// The app already had notify() — but it fed only the bell in the nav, so marking a load
// paid or changing a status produced no visible response at all unless you thought to
// open the dropdown afterwards. The action felt like it hadn't registered. This surfaces
// the same notes for a few seconds where the eye already is, then lets them fall back to
// the bell as history. One store, two views — a separate toast queue would eventually
// disagree with the feed about what happened.

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { useNotes, type NoteKind } from '@/lib/notify'

const TONE: Record<NoteKind, { ring: string; icon: string; Icon: typeof CircleCheck }> = {
  ok: { ring: 'ring-good-500/30', icon: 'text-good-400', Icon: CircleCheck },
  warn: { ring: 'ring-warn-400/30', icon: 'text-warn-400', Icon: TriangleAlert },
  error: { ring: 'ring-bad-500/35', icon: 'text-bad-400', Icon: CircleAlert },
  msg: { ring: 'ring-haul-400/30', icon: 'text-haul-300', Icon: Info },
}

/** How long a toast stays up. Long enough to read a short sentence, short enough that a
 * burst of them (a batch action) doesn't stack into a wall. Errors get longer — they're
 * the ones worth reading twice. */
const LIFETIME = { ok: 3200, msg: 3200, warn: 5000, error: 6500 } as const

export function Toaster() {
  const notes = useNotes()
  const [live, setLive] = useState<{ id: number; kind: NoteKind; text: string }[]>([])
  // Notes that already existed when this mounted are history, not news — without this
  // the whole backlog would fly in as toasts on every full page load.
  const seen = useRef<Set<number> | null>(null)

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(notes.map((n) => n.id))
      return
    }
    const fresh = notes.filter((n) => !seen.current!.has(n.id))
    if (fresh.length === 0) return
    fresh.forEach((n) => seen.current!.add(n.id))
    setLive((cur) => [...fresh.map((n) => ({ id: n.id, kind: n.kind, text: n.text })), ...cur].slice(0, 4))
    for (const n of fresh) {
      setTimeout(() => setLive((cur) => cur.filter((x) => x.id !== n.id)), LIFETIME[n.kind])
    }
  }, [notes])

  return (
    // bottom-24 on phones clears the floating tab bar; bottom-6 once the nav is a
    // desktop sidebar. pointer-events-none on the stack so a toast never blocks a
    // click on whatever is underneath — only the toast itself takes the pointer.
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:left-auto md:right-6 md:items-end md:px-0">
      <AnimatePresence initial={false}>
        {live.map((n) => {
          const tone = TONE[n.kind]
          return (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              role="status"
              onClick={() => setLive((cur) => cur.filter((x) => x.id !== n.id))}
              className={`panel pointer-events-auto flex max-w-sm cursor-pointer items-center gap-2.5 px-3.5 py-2.5 ring-1 ${tone.ring}`}
            >
              <tone.Icon size={16} strokeWidth={2.5} className={`shrink-0 ${tone.icon}`} />
              <span className="text-base text-white/85">{n.text}</span>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
