'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { usDate } from '@/lib/fmt'

const pad = (n: number) => String(n).padStart(2, '0')

/** День yyyy-mm-dd по местному времени браузера — как дата, что видна в строке. */
export const localDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Длинный список: первые `limit` строк видны, остальное — не лентой «ещё N», а по дню.
 * Кнопка открывает мини-календарь, где нажимаются только дни, в которые что-то есть
 * (цифра — сколько); выбранный день показывает свои строки под кнопкой.
 */
export function DateMore({ items, limit }: { items: { day: string; node: ReactNode }[]; limit: number }) {
  const locale = useLocale()
  const hidden = items.slice(limit)
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of items.slice(limit)) m.set(i.day, (m.get(i.day) ?? 0) + 1)
    return m
  }, [items, limit])
  const months = [...counts.keys()].map((k) => k.slice(0, 7)).sort()
  const [open, setOpen] = useState(false)
  const [day, setDay] = useState<string | null>(null)
  const [month, setMonth] = useState(months.at(-1) ?? '')
  if (!hidden.length) return <>{items.map((i) => i.node)}</>

  const [y, m] = month.split('-').map(Number) as [number, number]
  const first = new Date(y, m - 1, 1)
  const cells: (number | null)[] = [
    ...Array<null>(first.getDay()).fill(null),
    ...Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => i + 1),
  ]
  const shift = (n: number) => {
    const d = new Date(y, m - 1 + n, 1)
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
  const arrow =
    'flex size-8 items-center justify-center rounded-md text-white/70 hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent'

  return (
    <>
      {items.slice(0, limit).map((i) => i.node)}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/12 py-1.5 text-[13px] font-semibold text-white/75 transition-colors hover:border-white/25 hover:text-white/80 max-md:min-h-11"
      >
        <CalendarDays size={13} strokeWidth={2.5} />
        {t(locale, 'more.byDate').replace('{n}', String(hidden.length))}
      </button>
      {open && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
          <div className="mb-1 flex items-center justify-between">
            <button type="button" className={arrow} disabled={month <= months[0]!} onClick={() => shift(-1)} aria-label={t(locale, 'more.prevMonth')}>
              <ChevronLeft size={15} />
            </button>
            <span className="text-[13px] font-semibold capitalize">
              {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(first)}
            </span>
            <button type="button" className={arrow} disabled={month >= months.at(-1)!} onClick={() => shift(1)} aria-label={t(locale, 'more.nextMonth')}>
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={`w${i}`} className="pb-0.5 text-[10.5px] text-white/40">
                {weekday.format(new Date(2026, 0, 4 + i))}
              </span>
            ))}
            {cells.map((d, i) => {
              if (!d) return <span key={i} />
              const k = `${month}-${pad(d)}`
              const n = counts.get(k)
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!n}
                  onClick={() => {
                    setDay(k)
                    setOpen(false)
                  }}
                  className={`nums relative h-8 rounded-md text-[12px] transition-colors ${
                    day === k
                      ? 'bg-haul-500 font-semibold text-white'
                      : n
                        ? 'bg-haul-500/15 font-semibold text-haul-300 hover:bg-haul-500/30'
                        : 'text-white/25'
                  }`}
                >
                  {d}
                  {n && n > 1 ? <span className="absolute right-0.5 top-0 text-[8.5px] leading-3 opacity-80">{n}</span> : null}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {day && (
        <>
          <div className="flex items-center justify-between px-1 text-[12px] font-semibold text-white/65">
            <span className="nums">
              {usDate(day)} · {counts.get(day)}
            </span>
            <button type="button" onClick={() => setDay(null)} aria-label={t(locale, 'more.clear')} className="flex size-7 items-center justify-center rounded-md hover:bg-white/10">
              <X size={13} />
            </button>
          </div>
          {hidden.filter((i) => i.day === day).map((i) => i.node)}
        </>
      )}
    </>
  )
}
