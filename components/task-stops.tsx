'use client'

import Link from 'next/link'
import { useOptimistic, useTransition } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { arrivedAt, isDone, mergeStops, stopKey, stopsFrom, stopTitle, type StopEv } from '@/lib/stops'
import { whenText } from '@/lib/loads-dashboard'
import type { LoadRecord } from '@/lib/map'
import { t, type Locale } from '@/lib/i18n'
import { notify } from '@/lib/notify'
import { Info } from '@/components/info'
import { saveTaskOrder, setStopState } from '@/app/actions'

// Цвет груза в ленте: точка у строки и та же точка в подписи, чтобы в одном задании
// было видно, какая точка чья. Больше двух партиалов в трейлере не бывает, но ряд
// длиннее — на случай сборного рейса.
const TONES = ['bg-haul-400', 'bg-cyan-400', 'bg-fuchsia-400', 'bg-good-400']

type StopState = 'none' | 'arrived' | 'done'

/**
 * Реальное задание водителя: остановки ВСЕХ грузов, которые едут в одном трейлере,
 * одной лентой по датам и окнам (lib/stops.ts mergeStops) — так, как он их проедет.
 *
 * Раньше и карточка трака, и страница груза показывали только свой груз: партиал
 * висел отдельной плашкой, и порядок точек — сначала выгрузка первого груза, потом
 * погрузка второго в том же городе — не читался ниоткуда.
 *
 * Порядок диспетчер поправляет стрелками (сохраняется на трак, по нему же лента в
 * приложении водителя), статус точки — маленьким списком справа (app/actions.ts
 * setStopState: те же отметки, что у водителя, и тот же статус груза).
 */
export function TaskStops({
  loads,
  events,
  locale,
  truckId = null,
  order = null,
  focusLoadId = null,
  className = '',
}: {
  /** Грузы в одном трейлере: текущий и партиалы. */
  loads: LoadRecord[]
  /** id груза → отметки водителя по нему. */
  events: Record<number, StopEv[]>
  locale: Locale
  /** Трак задания — без него порядок не сохранить, стрелок нет. */
  truckId?: number | null
  /** Сохранённый ручной порядок (settings task_order:<truck>). */
  order?: string[] | null
  /** Страница груза: его строки яркие, строки соседнего груза в трейлере приглушены. */
  focusLoadId?: number | null
  className?: string
}) {
  const [pending, start] = useTransition()
  // Новый порядок и новый статус видны сразу; сервер перерисует страницу и подтвердит.
  const [keys, setKeys] = useOptimistic(order)
  const [over, setOver] = useOptimistic<Record<string, StopState>, [string, StopState]>({}, (s, [k, v]) => ({ ...s, [k]: v }))
  if (loads.length === 0) return null
  const stopsOf = new Map(loads.map((l) => [l.id, stopsFrom(l)]))
  const merged = mergeStops(loads, keys)
  if (merged.length === 0) return null
  const stateOf = (m: (typeof merged)[number]): StopState => {
    const k = stopKey(m)
    if (over[k]) return over[k]
    const evs = events[m.loadId] ?? []
    const own = stopsOf.get(m.loadId) ?? []
    return isDone(m, evs, own) ? 'done' : arrivedAt(m, evs, own) ? 'arrived' : 'none'
  }
  const left = merged.filter((m) => stateOf(m) !== 'done').length
  const next = merged.find((m) => stateOf(m) !== 'done')

  const move = (i: number, dir: -1 | 1) => {
    if (truckId == null) return
    const list = merged.map(stopKey)
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j]!, list[i]!]
    start(async () => {
      setKeys(list)
      const res = await saveTaskOrder(truckId, list)
      if (res?.error) notify('error', res.error)
    })
  }
  const setState = (m: (typeof merged)[number], v: StopState) =>
    start(async () => {
      setOver([stopKey(m), v])
      const res = await setStopState(m.loadId, m.seq, v)
      if (res?.error) notify('error', res.error)
    })

  const arrow =
    'flex size-6 items-center justify-center rounded text-white/45 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent max-md:size-8'

  return (
    <section className={className} aria-busy={pending}>
      <h3 className="mb-1.5 flex flex-wrap items-center gap-x-1.5 text-[13px] font-semibold text-white/80">
        {t(locale, 'task.title')}
        <Info text={t(locale, 'task.info')} />
        <span className="nums text-[12px] font-medium text-white/45">
          {t(locale, 'task.left').replace('{n}', String(left))}
        </span>
        {truckId != null && !!keys?.length && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setKeys([])
                const res = await saveTaskOrder(truckId, [])
                if (res?.error) notify('error', res.error)
              })
            }
            className="ml-auto text-[11.5px] font-medium text-white/45 transition-colors hover:text-white max-md:min-h-9"
          >
            {t(locale, 'task.resetOrder')}
          </button>
        )}
      </h3>
      {/* Два груза в трейлере — сразу сказать, чьи строки: иначе лента из пяти точек
          выглядела остановками одного груза, у которого в рейт-коне их две. */}
      {loads.length > 1 && (
        <p className="mb-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-white/55">
          {loads.map((l, k) => (
            <span key={l.id} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${TONES[k % TONES.length]}`} aria-hidden />
              <span className="nums">#{l.referenceId ?? l.id}</span>
              {l.brokerName && <span>{l.brokerName}</span>}
              <span className="text-white/40">— {t(locale, 'task.stopsN').replace('{n}', String(stopsOf.get(l.id)?.length ?? 0))}</span>
            </span>
          ))}
        </p>
      )}
      <ol className="space-y-1">
        {merged.map((m, i) => {
          const state = stateOf(m)
          const isPast = state === 'done'
          const isNow = !isPast && m === next
          const tone = TONES[Math.max(0, loads.findIndex((l) => l.id === m.loadId)) % TONES.length]
          return (
            <li
              key={stopKey(m)}
              className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2.5 py-1.5 text-[13px] ${
                isNow ? 'bg-haul-500/[0.10] ring-1 ring-haul-400/30' : isPast ? 'bg-white/[0.02] text-white/45' : 'bg-white/[0.04]'
              } ${focusLoadId != null && m.loadId !== focusLoadId ? 'opacity-55' : ''}`}
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
              <span className="flex shrink-0 items-center gap-1">
                {truckId != null && (
                  <span className="flex items-center">
                    <button type="button" className={arrow} disabled={i === 0 || pending} onClick={() => move(i, -1)} aria-label={t(locale, 'task.moveUp')} title={t(locale, 'task.moveUp')}>
                      <ChevronUp size={14} strokeWidth={2.5} />
                    </button>
                    <button type="button" className={arrow} disabled={i === merged.length - 1 || pending} onClick={() => move(i, 1)} aria-label={t(locale, 'task.moveDown')} title={t(locale, 'task.moveDown')}>
                      <ChevronDown size={14} strokeWidth={2.5} />
                    </button>
                  </span>
                )}
                <select
                  value={state}
                  onChange={(e) => setState(m, e.target.value as StopState)}
                  aria-label={t(locale, 'task.stState')}
                  className={`h-7 rounded-md border px-1.5 text-[11.5px] font-medium outline-none focus:border-haul-500 max-md:h-9 ${
                    state === 'done'
                      ? 'border-good-400/30 bg-good-400/10 text-good-400'
                      : state === 'arrived'
                        ? 'border-haul-400/40 bg-haul-500/10 text-haul-300'
                        : 'border-white/12 bg-ink-900 text-white/70'
                  }`}
                >
                  <option value="none">{t(locale, 'task.stNone')}</option>
                  <option value="arrived">{t(locale, 'task.stArrived')}</option>
                  <option value="done">{t(locale, m.role === 'pickup' ? 'task.stLoaded' : 'task.stUnloaded')}</option>
                </select>
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
