import Link from 'next/link'
import { isDone, mergeStops, stopsFrom, stopTitle, type StopEv } from '@/lib/stops'
import { whenText } from '@/lib/loads-dashboard'
import type { LoadRecord } from '@/lib/map'
import { t, type Locale } from '@/lib/i18n'
import { Info } from '@/components/info'

// Цвет груза в ленте: точка у строки и та же точка в подписи, чтобы в одном задании
// было видно, какая точка чья. Больше двух партиалов в трейлере не бывает, но ряд
// длиннее — на случай сборного рейса.
const TONES = ['bg-haul-400', 'bg-cyan-400', 'bg-fuchsia-400', 'bg-good-400']

/**
 * Реальное задание водителя: остановки ВСЕХ грузов, которые едут в одном трейлере,
 * одной лентой по датам и окнам (lib/stops.ts mergeStops) — так, как он их проедет.
 *
 * Раньше и карточка трака, и страница груза показывали только свой груз: партиал
 * висел отдельной плашкой, и порядок точек — сначала выгрузка первого груза, потом
 * погрузка второго в том же городе — не читался ниоткуда.
 *
 * Пройденные точки серые с галочкой, ближайшая выделена. Пройденность берётся из
 * отметок водителя по каждому грузу отдельно (у партиала свои отметки).
 */
export function TaskStops({
  loads,
  events,
  locale,
  className = '',
}: {
  /** Грузы в одном трейлере: текущий и партиалы. */
  loads: LoadRecord[]
  /** id груза → отметки водителя по нему. */
  events: Record<number, StopEv[]>
  locale: Locale
  className?: string
}) {
  if (loads.length === 0) return null
  const stopsOf = new Map(loads.map((l) => [l.id, stopsFrom(l)]))
  const merged = mergeStops(loads)
  if (merged.length === 0) return null
  const done = (m: (typeof merged)[number]) => isDone(m, events[m.loadId] ?? [], stopsOf.get(m.loadId) ?? [])
  const left = merged.filter((m) => !done(m)).length
  const next = merged.find((m) => !done(m))

  return (
    <section className={className}>
      <h3 className="mb-1.5 flex flex-wrap items-center gap-x-1.5 text-[13px] font-semibold text-white/80">
        {t(locale, 'task.title')}
        <Info text={t(locale, 'task.info')} />
        <span className="nums text-[12px] font-medium text-white/45">
          {t(locale, 'task.left').replace('{n}', String(left))}
        </span>
      </h3>
      <ol className="space-y-1">
        {merged.map((m, i) => {
          const isPast = done(m)
          const isNow = !isPast && m === next
          const tone = TONES[Math.max(0, loads.findIndex((l) => l.id === m.loadId)) % TONES.length]
          return (
            <li
              key={`${m.loadId}-${m.seq}`}
              className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg px-2.5 py-1.5 text-[13px] ${
                isNow ? 'bg-haul-500/[0.10] ring-1 ring-haul-400/30' : isPast ? 'bg-white/[0.02] text-white/45' : 'bg-white/[0.04]'
              }`}
            >
              <span className={`nums w-4 shrink-0 text-[12px] ${isPast ? 'text-good-400' : 'text-white/45'}`}>
                {isPast ? '✓' : i + 1}
              </span>
              <span className={`shrink-0 font-semibold ${isNow ? 'text-haul-300' : ''}`}>
                {stopTitle(m, stopsOf.get(m.loadId) ?? [], locale)}
              </span>
              <span className="min-w-0 break-words">{m.city ?? m.address ?? '—'}</span>
              <span className="nums text-[12px] text-white/60">
                {whenText(m.date, m.time, t(locale, 'loads.dash.noDate'), t(locale, 'loads.dash.noTime'))}
              </span>
              {/* Чей это груз — всегда рядом со строкой: в трейлере едут бумаги двух брокеров. */}
              <Link
                href={`/loads/${m.loadId}`}
                className="ml-auto flex shrink-0 items-center gap-1.5 text-[11.5px] text-white/45 transition-colors hover:text-white"
              >
                <span className={`size-2 rounded-full ${tone}`} aria-hidden />
                <span className="nums">{m.ref ? `#${m.ref}` : `#${m.loadId}`}</span>
                {m.broker && <span className="max-w-[9rem] truncate">· {m.broker}</span>}
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
