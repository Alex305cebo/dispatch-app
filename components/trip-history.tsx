'use client'

// День трака как лента событий: где ехал, где стоял, во что это обошлось по времени.
// Считает не этот файл — вся арифметика в lib/trip-history.ts и покрыта тестами;
// здесь только показ и выбор отрезка.
//
// Устройство (переделано 25.09.2026 по просьбе владельца «улучшить дизайн и функционал»):
// - сверху — итог окна плитками с понятными подписями;
// - каждый день — лента суток с сеткой часов, отметкой «сейчас» и легендой цветов;
//   нажатие на отрезок ленты выделяет его строку в списке и прокручивает к ней;
// - список дня сворачивается: открыт только самый свежий день, остальные — лентой и
//   итогом, «Подробно» раскрывает. За 7 дней иначе выходило под сотню строк;
// - фильтр «Всё / Езда / Стоянки» — чтобы найти, где трак стоял, не листая рейсы;
// - город из «3.5mi NE from Flagstaff, AZ» — крупно, удаление — мелкой припиской.
// Стоянки в городе погрузки или выгрузки помечены отдельно — этого не знает ни один
// ELD, потому что груз знаем только мы.

import { Fragment, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  DAY_MS,
  dayTotals,
  daySpans,
  etDay,
  splitPlace,
  startOfDayEt,
  stopRole,
  summarize,
  type HistoryLeg,
  type LoadStop,
} from '@/lib/trip-history'
import { agoText, driveTime, usDate } from '@/lib/fmt'
import { t, type Locale } from '@/lib/i18n'

// Часы и дни — по ET (lib/trip-history.ts, etDay/startOfDayEt): сервер и браузер
// обязаны нарисовать одно и то же, иначе гидратация падает с #418.
const loc = (locale: Locale) => (locale === 'en' ? 'en-US' : 'ru-RU')
const timeOf = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleTimeString(loc(locale), { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
const dateOf = (iso: string) => usDate(etDay(Date.parse(iso)))

function rangeLabel(from: string, to: string, locale: Locale): string {
  const tf = timeOf(from, locale)
  const tt = timeOf(to, locale)
  // Отрезок через полночь: одно время конца («15:34–15:00») читалось бы бессмыслицей.
  return dateOf(from) === dateOf(to) ? `${tf}–${tt}` : `${tf}–${tt} (${dateOf(to)})`
}

type Kind = 'drive' | 'stop' | 'rest' | 'load'
const kindOf = (leg: HistoryLeg, stops: LoadStop[]): Kind =>
  leg.kind === 'drive' ? 'drive' : stopRole(leg.location, leg.from, stops) ? 'load' : leg.long ? 'rest' : 'stop'

/** Один цвет на смысл — и в ленте, и в точке строки, и в легенде. */
const FILL: Record<Kind, string> = {
  drive: 'bg-good-400',
  stop: 'bg-white/30',
  rest: 'bg-warn-400/85',
  load: 'bg-haul-400',
}
const LEGEND_KEY = {
  drive: 'trucks.trip.legendDrive',
  stop: 'trucks.trip.legendStop',
  rest: 'trucks.trip.legendRest',
  load: 'trucks.trip.legendLoad',
} as const

type Filter = 'all' | 'drive' | 'stop'

/** Место словами: город крупно, «3.5 mi NE» от него — мелко и приглушённо. */
function Place({ value, fallback }: { value: string | null; fallback: string }) {
  const p = splitPlace(value)
  if (!p) return <span className="truncate text-t1">{fallback}</span>
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="truncate text-t1">{p.city}</span>
      {p.near && <span className="nums shrink-0 text-2xs text-t3">{p.near}</span>}
    </span>
  )
}

function Tile({ value, label, tone }: { value: string; label: string; tone?: 'warn' | 'good' | 'load' }) {
  return (
    <div className="panel-inset min-w-0 rounded-xl border border-white/10 px-3 py-2">
      <div
        className={`nums truncate text-lg font-semibold ${
          tone === 'warn'
            ? 'text-warn-400'
            : tone === 'good'
              ? 'text-good-400'
              : tone === 'load'
                ? 'text-haul-300'
                : 'text-t1'
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs leading-snug font-medium text-t2">{label}</div>
    </div>
  )
}

/**
 * Сутки одной лентой с сеткой по 6 часов. Отрезки обрезаны по суткам, поэтому рейс
 * через полночь рисуется на обоих днях. Ещё не наступившие часы сегодняшнего дня
 * заштрихованы, иначе лента выглядит так, будто трак полдня простоял.
 */
function DayRibbon({
  dayMs,
  legs,
  allLegs,
  locale,
  stops,
  selected,
  onSelect,
  nowMs,
}: {
  dayMs: number
  legs: HistoryLeg[]
  allLegs: HistoryLeg[]
  locale: Locale
  stops: LoadStop[]
  selected: number | null
  onSelect: (i: number) => void
  nowMs: number | null
}) {
  const spans = daySpans(legs, dayMs)
  const nowPct = nowMs !== null && nowMs > dayMs && nowMs < dayMs + DAY_MS ? ((nowMs - dayMs) / DAY_MS) * 100 : null

  return (
    <div className="px-1">
      <div className="relative h-5 overflow-hidden rounded-md bg-white/[0.05]">
        {/* Сетка часов под отрезками: 06, 12, 18. */}
        {[25, 50, 75].map((p) => (
          <span key={p} aria-hidden className="absolute inset-y-0 w-px bg-white/10" style={{ left: `${p}%` }} />
        ))}
        {spans.map((s, i) => {
          const idx = allLegs.indexOf(s.leg)
          const kind = kindOf(s.leg, stops)
          const place =
            s.leg.kind === 'drive'
              ? `${splitPlace(s.leg.fromLocation)?.city ?? '—'} → ${splitPlace(s.leg.toLocation)?.city ?? '—'}`
              : (splitPlace(s.leg.location)?.city ?? '')
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(idx)}
              title={`${t(locale, LEGEND_KEY[kind])} · ${timeOf(new Date(s.fromMs).toISOString(), locale)}–${timeOf(
                new Date(s.toMs).toISOString(),
                locale,
              )} · ${driveTime(Math.round((s.toMs - s.fromMs) / 60000), locale)}${place ? ` · ${place}` : ''}`}
              className={`absolute inset-y-0.5 rounded-[3px] transition-[filter] hover:brightness-125 ${FILL[kind]} ${
                selected === idx ? 'z-[1] ring-2 ring-white' : ''
              }`}
              style={{ left: `${s.leftPct}%`, width: `max(${s.widthPct}%, 3px)` }}
            />
          )
        })}
        {nowPct !== null && (
          <>
            <span
              aria-hidden
              className="trip-future absolute inset-y-0 right-0"
              style={{ width: `${100 - nowPct}%` }}
            />
            <span aria-hidden className="absolute inset-y-0 z-[2] w-0.5 bg-white" style={{ left: `${nowPct}%` }} />
          </>
        )}
      </div>
      <div className="relative mt-1 h-3.5 text-2xs tabular-nums text-t3">
        {['00', '06', '12', '18', '24'].map((h, i) => (
          // Час под отметкой «сейчас» прячем — иначе подписи наезжают друг на друга.
          nowPct !== null && nowPct > 6 && nowPct < 94 && Math.abs(i * 25 - nowPct) < 10 ? null : <span
            key={h}
            className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
            style={{ left: `${i * 25}%` }}
          >
            {h}
          </span>
        ))}
        {nowPct !== null && nowPct > 6 && nowPct < 94 && (
          <span
            className="absolute -translate-x-1/2 rounded bg-white px-1 text-[10px] leading-3.5 font-semibold text-ink-950"
            style={{ left: `${nowPct}%` }}
          >
            {t(locale, 'trucks.trip.now')}
          </span>
        )}
      </div>
    </div>
  )
}

export function TripHistory({
  legs,
  locale,
  stops = [],
}: {
  legs: HistoryLeg[]
  locale: Locale
  /** Города и даты погрузок-выгрузок этого трака — по ним стоянка узнаётся как
   * ожидание под грузом. Пусто — просто не будет пометок. */
  stops?: LoadStop[]
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  // Раскрытые дни; null — по умолчанию (открыт только самый свежий).
  const [open, setOpen] = useState<Set<string> | null>(null)
  const rowRefs = useRef(new Map<number, HTMLElement>())
  // Время берём после монтирования: на сервере оно другое, и отрисованное там
  // затемнение «будущего» разошлось бы с браузерным при гидратации.
  const [nowMs, setNowMs] = useState<number | null>(null)
  useEffect(() => setNowMs(Date.now()), [])
  // Новое окно (24 ч → 7 дней) — новый список: старые номера строк и раскрытые дни
  // к нему не относятся.
  useEffect(() => {
    setSelected(null)
    setOpen(null)
  }, [legs])

  if (legs.length === 0) {
    return <p className="text-base leading-relaxed text-t3">{t(locale, 'trucks.trip.empty')}</p>
  }

  // Свежее — сверху: историю открывают, чтобы узнать, что с траком СЕЙЧАС. Выбор
  // отрезка ищется по индексу в ЭТОМ массиве.
  const ordered = [...legs].reverse()
  const freshest = ordered[0]?.to ?? null
  const isToday = freshest && nowMs !== null ? dateOf(freshest) === dateOf(new Date(nowMs).toISOString()) : false

  const total = summarize(legs)
  const waitMin = legs.reduce((sum, l) => (kindOf(l, stops) === 'load' ? sum + l.minutes : sum), 0)

  // Дни по порядку — свежий первым. Отрезок принадлежит дню своего начала.
  const days: { key: string; dayMs: number; idx: number[] }[] = []
  ordered.forEach((leg, i) => {
    const key = dateOf(leg.from)
    const last = days[days.length - 1]
    if (last && last.key === key) last.idx.push(i)
    else days.push({ key, dayMs: startOfDayEt(Date.parse(leg.from)), idx: [i] })
  })
  const isOpen = (key: string) => (open ? open.has(key) : key === days[0]!.key)
  const toggle = (key: string) =>
    setOpen((cur) => {
      const next = new Set(cur ?? [days[0]!.key])
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const shown = (leg: HistoryLeg) => filter === 'all' || (filter === 'drive') === (leg.kind === 'drive')

  // Нажатие на отрезок ленты: день раскрывается, фильтр не прячет строку, строка
  // выделяется и приезжает в поле зрения.
  const pick = (dayKey: string, i: number) => {
    if (selected === i) {
      setSelected(null)
      return
    }
    setSelected(i)
    if (!isOpen(dayKey)) toggle(dayKey)
    if (!shown(ordered[i]!)) setFilter('all')
    requestAnimationFrame(() => rowRefs.current.get(i)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }

  const kindsSeen = new Set(legs.map((l) => kindOf(l, stops)))

  return (
    <div>
      {/* Свежесть данных — первой строкой: показывает лента сегодняшний день или
          трак молчит со вчера. */}
      {freshest && nowMs !== null && (
        <p className="mb-2.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`size-1.5 rounded-full ${isToday ? 'bg-good-400' : 'bg-warn-400'}`} />
          <span className={isToday ? 'text-good-400' : 'text-warn-400'}>
            {t(locale, isToday ? 'trucks.trip.freshToday' : 'trucks.trip.freshOld')}
          </span>
          <span className="nums text-t3">
            {timeOf(freshest, locale)} ET · {agoText(freshest, locale)}
          </span>
        </p>
      )}

      {/* Итог окна: сколько наездили и где потеряли время. */}
      <div className="mb-3 grid grid-cols-2 gap-2 @lg:grid-cols-3 @4xl:grid-cols-6">
        <Tile value={`${total.miles.toLocaleString('en-US')} mi`} label={t(locale, 'trucks.trip.tileMiles')} />
        <Tile value={driveTime(total.driveMin, locale)} label={t(locale, 'trucks.trip.tileDrive')} tone="good" />
        <Tile value={driveTime(total.stopMin, locale)} label={t(locale, 'trucks.trip.tileStopped')} />
        <Tile value={String(total.stops)} label={t(locale, 'trucks.trip.tileStops')} />
        <Tile
          value={total.avgMph !== null ? `${total.avgMph} mi/h` : '—'}
          label={t(locale, 'trucks.trip.tileAvg')}
        />
        <Tile
          value={waitMin > 0 ? driveTime(waitMin, locale) : '—'}
          label={t(locale, 'trucks.trip.tileWait')}
          tone={waitMin >= 120 ? 'warn' : waitMin > 0 ? 'load' : undefined}
        />
      </div>

      {/* Легенда цветов ленты и фильтр списка — одной строкой. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-t2">
          {(['drive', 'stop', 'rest', 'load'] as Kind[])
            .filter((k) => k === 'drive' || k === 'stop' || kindsSeen.has(k))
            .map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-4 rounded-sm ${FILL[k]}`} />
                {t(locale, LEGEND_KEY[k])}
              </span>
            ))}
          <span className="flex items-center gap-1.5">
            <span className="trip-future h-2.5 w-4 rounded-sm border border-white/10" />
            {t(locale, 'trucks.trip.legendFuture')}
          </span>
        </div>
        <div className="panel-inset flex rounded-lg border border-white/10 p-0.5" role="group">
          {(['all', 'drive', 'stop'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`min-h-8 rounded-md px-3 text-xs font-medium transition-colors ${
                filter === f ? 'bg-haul-500/30 text-t1' : 'text-t3 hover:text-t1'
              }`}
            >
              {t(
                locale,
                f === 'all' ? 'trucks.trip.filterAll' : f === 'drive' ? 'trucks.trip.filterDrive' : 'trucks.trip.filterStops',
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {days.map((d) => {
          // Все отрезки этого календарного дня, а не только начатые в нём: рейс,
          // начавшийся вчера вечером, занимает и сегодняшние часы.
          const ofDay = ordered.filter(
            (l) => Date.parse(l.to) > d.dayMs && Date.parse(l.from) < d.dayMs + DAY_MS,
          )
          const totals = dayTotals(ofDay, d.dayMs)
          const expanded = isOpen(d.key)
          const rows = d.idx.filter((i) => shown(ordered[i]!))
          return (
            <section key={d.key}>
              <button
                type="button"
                onClick={() => toggle(d.key)}
                aria-expanded={expanded}
                className="mb-1.5 flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-1 text-left hover:bg-white/[0.03]"
              >
                <span className="nums text-base font-semibold text-t1">{d.key}</span>
                {totals.driveMin > 0 && (
                  <span className="nums text-xs whitespace-nowrap text-t3">
                    {totals.miles.toLocaleString('en-US')} mi ·{' '}
                    <span className="text-good-400">{driveTime(totals.driveMin, locale)}</span>{' '}
                    {t(locale, 'trucks.trip.behindWheel')}
                  </span>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-t3">
                  {expanded
                    ? t(locale, 'trucks.trip.hideDay')
                    : t(locale, 'trucks.trip.showDay').replace('{n}', String(d.idx.length))}
                  <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </span>
              </button>
              <DayRibbon
                dayMs={d.dayMs}
                legs={ofDay}
                allLegs={ordered}
                locale={locale}
                stops={stops}
                selected={selected}
                onSelect={(i) => pick(d.key, i)}
                nowMs={nowMs}
              />
              {expanded && (
                <ol className="mt-2 flex flex-col gap-1.5">
                  {rows.length === 0 && <li className="px-1 text-xs text-t3">{t(locale, 'trucks.trip.nothing')}</li>}
                  {rows.map((i) => (
                    <Fragment key={i}>
                      <LegRow
                        leg={ordered[i]!}
                        kind={kindOf(ordered[i]!, stops)}
                        role={
                          ordered[i]!.kind === 'stop'
                            ? stopRole((ordered[i] as { location: string | null }).location, ordered[i]!.from, stops)
                            : null
                        }
                        locale={locale}
                        selected={selected === i}
                        onClick={() => setSelected(selected === i ? null : i)}
                        bind={(el) => {
                          if (el) rowRefs.current.set(i, el)
                          else rowRefs.current.delete(i)
                        }}
                      />
                    </Fragment>
                  ))}
                </ol>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function LegRow({
  leg,
  kind,
  role,
  locale,
  selected,
  onClick,
  bind,
}: {
  leg: HistoryLeg
  kind: Kind
  role: 'pickup' | 'delivery' | null
  locale: Locale
  selected: boolean
  onClick: () => void
  bind: (el: HTMLElement | null) => void
}) {
  const avg = leg.kind === 'drive' && leg.minutes >= 30 ? Math.round(leg.miles / (leg.minutes / 60)) : null
  const tone =
    kind === 'load'
      ? 'border-haul-500/30 bg-haul-500/[0.07]'
      : kind === 'rest'
        ? 'border-warn-400/25 bg-warn-400/[0.06]'
        : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
  return (
    <li ref={bind} className="scroll-mt-20">
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
          selected ? 'border-white/40 bg-white/[0.08]' : tone
        }`}
      >
        <span className={`h-8 w-1 shrink-0 rounded-full ${FILL[kind]}`} aria-hidden />
        {leg.kind === 'drive' ? (
          <>
            <span className="min-w-0 flex-1">
              {/* Переносом, а не обрезкой: в узкой плитке «Casa …→ South …» не
                  говорил ни откуда, ни куда. */}
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                <span className="min-w-0 max-w-full">
                  <Place value={leg.fromLocation} fallback="—" />
                </span>
                <span className="flex min-w-0 max-w-full items-baseline gap-1.5">
                  <span className="shrink-0 text-t3">→</span>
                  <Place value={leg.toLocation} fallback="—" />
                </span>
              </span>
              <span className="nums block text-xs text-t3">
                {rangeLabel(leg.from, leg.to, locale)}
                {avg !== null && ` · ${avg} mi/h ${t(locale, 'trucks.trip.avgShort')}`}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="nums block font-semibold text-t1">{leg.miles.toLocaleString('en-US')} mi</span>
              <span className="nums block text-xs text-good-400">{driveTime(leg.minutes, locale)}</span>
            </span>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="min-w-0 max-w-full">
                  <Place
                    value={leg.location}
                    fallback={t(locale, leg.long ? 'trucks.trip.longRest' : 'trucks.trip.stop')}
                  />
                </span>
                {role && (
                  <span className="shrink-0 rounded-full bg-haul-500/20 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-haul-300">
                    {t(locale, role === 'pickup' ? 'trucks.trip.atPickup' : 'trucks.trip.atDelivery')}
                  </span>
                )}
                {!role && leg.long && (
                  <span className="shrink-0 rounded-full bg-warn-400/15 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-warn-400">
                    {t(locale, 'trucks.trip.longRest')}
                  </span>
                )}
              </span>
              <span className="nums block text-xs text-t3">{rangeLabel(leg.from, leg.to, locale)}</span>
            </span>
            <span className="shrink-0 text-right">
              <span
                className={`nums block font-semibold ${
                  kind === 'load' ? 'text-haul-300' : kind === 'rest' ? 'text-warn-400' : 'text-t2'
                }`}
              >
                {driveTime(leg.minutes, locale)}
              </span>
              <span className="block text-xs text-t3">
                {t(locale, role ? 'trucks.trip.underLoad' : 'trucks.trip.standing')}
              </span>
            </span>
          </>
        )}
      </button>
    </li>
  )
}
