'use client'

// «Требуют внимания» на /loads. Список без собственной прокрутки: первые PAGE
// строк, дальше кнопка «ещё N». Вложенный скролл на телефоне ловил палец и прятал
// хвост списка, а подгрузка по скроллу отодвигала доску грузов всё дальше.
// Строки разделены линиями, а не вложенными капсулами; маршрут на телефоне
// занимает всю первую строку, причины — под ним.

import { useState } from 'react'
import Link from 'next/link'

export type AttentionItem = {
  id: number
  route: string
  /** Pre-translated on the server — the chip text, and whether it's a red one. */
  reasons: { label: string; bad: boolean }[]
}

const PAGE = 8

export function AttentionList({ items, moreLabel }: { items: AttentionItem[]; moreLabel: string }) {
  const [shown, setShown] = useState(Math.min(PAGE, items.length))

  return (
    <div className="flex flex-col divide-y divide-white/8">
      {items.slice(0, shown).map((it) => (
        <Link
          key={it.id}
          href={`/loads/${it.id}`}
          className="flex min-h-11 flex-col justify-center gap-1 rounded-md px-1.5 py-2 transition-colors hover:bg-white/[0.04] sm:flex-row sm:items-center sm:gap-2"
        >
          <span className="min-w-0 flex-1 text-[13px] font-medium sm:truncate">{it.route}</span>
          <span className="flex shrink-0 flex-wrap gap-1 sm:justify-end">
            {it.reasons.map((r) => (
              <span
                key={r.label}
                className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ${
                  r.bad ? 'bg-bad-500/15 text-bad-400' : 'bg-warn-400/15 text-warn-400'
                }`}
              >
                {r.label}
              </span>
            ))}
          </span>
        </Link>
      ))}
      {shown < items.length && (
        <button
          type="button"
          onClick={() => setShown((n) => Math.min(n + PAGE, items.length))}
          className="min-h-11 rounded-md px-1.5 text-left text-[12.5px] font-medium text-haul-400 hover:underline"
        >
          {moreLabel.replace('{n}', String(items.length - shown))}
        </button>
      )}
    </div>
  )
}
