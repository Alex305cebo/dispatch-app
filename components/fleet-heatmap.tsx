'use client'

// «Загрузка парка» — расписание парка по дням: строка — трак, полоса — рейс от погрузки
// до выгрузки. Раньше рейс рисовался россыпью значков по клеткам (точка, стрелки,
// ромб), и без легенды было не понять, где один груз кончается и начинается другой.
// Полоса читается сразу: длина — дни в пути, цвет — где груз сейчас (выгружен / едет /
// только запланирован), подпись — куда везёт. Пустое место — трак стоял.
//
// Окно заканчивается не сегодня, а на пару дней вперёд: запланированные грузы и дата
// освобождения видны на той же сетке, столбец «Сегодня» подсвечен.
//
// Сколько дней показывать и как раскладывать строку, решает ширина САМОЙ плитки
// (ResizeObserver), а не экрана: плитку можно сделать маленькой и на компьютере.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { usd, usDate } from '@/lib/fmt'
import { statusLabel } from '@/components/status'
import { Info } from '@/components/info'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale } from '@/lib/i18n'
import { daySpan, heatSegments, idleDays, type HeatDayLoad, type HeatRow } from '@/lib/heatmap'
import { shiftDay } from '@/lib/loads-dashboard'

type Hover = { x: number; top: number; bottom: number; label: string; load: HeatDayLoad }

const TAG: Record<Locale, string> = { ru: 'ru-RU', en: 'en-US', es: 'es-ES', uk: 'uk-UA', ro: 'ro-RO', kk: 'kk-KZ' }

type Phase = 'done' | 'moving' | 'planned'
const phaseOf = (l: HeatDayLoad): Phase =>
  l.status === 'in_transit' ? 'moving' : l.status === 'delivered' || l.status === 'paid' ? 'done' : 'planned'

const BAR: Record<Phase, string> = {
  done: 'border-good-400/45 bg-good-500/25 text-good-100',
  moving: 'heat-live border-haul-300/70 bg-haul-500/45 text-white',
  planned: 'border-dashed border-haul-300/60 bg-haul-500/[0.08] text-haul-100',
}
const PHASE_KEY = {
  done: 'trucks.heatmap.done',
  moving: 'trucks.heatmap.moving',
  planned: 'trucks.heatmap.planned',
} as const

const city = (p: string | null) => (p ? p.split(',')[0]!.trim() : '')

/** today — день yyyy-mm-dd по ET с сервера (todayEt), а не new Date() здесь: сервер в
 * UTC после 20:00 ET живёт уже завтра, и его сетка расходилась с браузерной на
 * колонку — React #418 на обзоре и /trucks каждый вечер. */
export function FleetHeatmap({ rows, today }: { rows: HeatRow[]; today: string }) {
  const locale = useLocale()
  const rootRef = useRef<HTMLDivElement>(null)
  // 0 до первого замера: сервер и первый кадр в браузере рисуют одинаково (широко).
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const narrow = width > 0 && width < 540
  // Столбцы «где / когда / рейт» справа — только когда им есть место; иначе
  // «где / когда» уходят второй строкой под полосы.
  const wide = width === 0 || width >= 860
  const winDays = narrow ? 7 : 14
  const ahead = narrow ? 2 : 3

  const [hover, setHover] = useState<Hover | null>(null)
  // Закрытие с задержкой: мышь успевает дойти от полосы до карточки и нажать ссылку.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setHover(null), 140)
  }

  // offset — на сколько окон назад листнули (0 — окно с сегодняшним днём).
  const [offset, setOffset] = useState(0)
  const lastDay = shiftDay(today, ahead - offset * winDays)
  const colKeys = daySpan(shiftDay(lastDay, 1 - winDays), lastDay)
  const todayIdx = colKeys.indexOf(today)
  // Полдень того же дня: день недели от него — этот день в любом поясе.
  const cols = colKeys.map((k) => new Date(`${k}T12:00:00`))
  const weekend = cols.map((c) => c.getDay() === 0 || c.getDay() === 6)
  const weekday = (d: Date) => d.toLocaleDateString(TAG[locale], { weekday: 'short' }).replace('.', '')
  const md = (k: string) => usDate(k).slice(0, 5)
  const rangeLabel = `${md(colKeys[0]!)} – ${md(colKeys[colKeys.length - 1]!)}`
  const pastKeys = colKeys.filter((k) => k <= today)

  // Полосы и рейт каждой строки считаются один раз — из них же сводка сверху.
  const data = rows.map((r) => {
    const segs = heatSegments(r.working, colKeys)
    // Рейт — по дню погрузки: рейс, что пересекает край окна, не считается дважды.
    const rate = segs.reduce((s, x) => s + (x.cutStart ? 0 : x.load.rate), 0)
    const busyDays = pastKeys.filter((k) => r.working.has(k)).length
    const idle = r.when?.tone === 'free' ? idleDays(r.working, today) : null
    return { r, segs, rate, busyDays, idle, lanes: Math.max(1, ...segs.map((s) => s.lane + 1)) }
  })
  const count = (tone: 'busy' | 'free' | 'off') => rows.filter((r) => r.when?.tone === tone).length
  const util = pastKeys.length
    ? Math.round((100 * data.reduce((s, d) => s + d.busyDays, 0)) / (pastKeys.length * rows.length))
    : 0
  const totalRate = data.reduce((s, d) => s + d.rate, 0)

  // Одна сетка на всю плитку, чтобы шапка дней стояла ровно над клетками строк.
  const gridCols = wide
    ? '6.5rem minmax(0,1fr) minmax(7rem,10rem) 7.5rem 4.5rem'
    : narrow
      ? '4.5rem minmax(0,1fr) 4rem'
      : '6rem minmax(0,1fr) 5rem'
  const dayGrid = { gridTemplateColumns: `repeat(${winDays}, minmax(0,1fr))` }

  const whenCls = (tone?: 'free' | 'busy' | 'off') =>
    tone === 'busy' ? 'text-good-400' : tone === 'off' ? 'text-t3' : 'text-warn-400'
  const whenText = (d: (typeof data)[number]) =>
    d.idle ? t(locale, 'trucks.heatmap.freeDays').replace('{n}', String(d.idle)) : (d.r.when?.text ?? '')

  return (
    <div ref={rootRef} className="panel relative p-3 sm:p-4">
      {/* Шапка: название, листалка периода и возврат к сегодняшнему дню. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-t1">
          {t(locale, 'trucks.heatmap.name')}
          <Info text={t(locale, 'trucks.heatmap.info')} />
        </h2>
        <div className="flex items-center gap-1">
          {offset > 0 && (
            <button
              type="button"
              onClick={() => setOffset(0)}
              className="mr-1 rounded-full border border-haul-400/50 px-2.5 py-0.5 text-xs font-medium text-haul-200 transition-colors hover:bg-haul-500/20"
            >
              {t(locale, 'trucks.heatmap.today')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOffset((o) => o + 1)}
            aria-label={t(locale, 'trucks.heatmap.earlier')}
            title={t(locale, 'trucks.heatmap.earlier')}
            className="grid size-8 place-items-center rounded-lg text-t2 transition-colors hover:bg-white/8 hover:text-t1"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="nums min-w-[6.5rem] text-center text-xs font-medium text-t2">{rangeLabel}</span>
          <button
            type="button"
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={offset === 0}
            aria-label={t(locale, 'trucks.heatmap.later')}
            title={t(locale, 'trucks.heatmap.later')}
            className="grid size-8 place-items-center rounded-lg text-t2 transition-colors hover:bg-white/8 hover:text-t1 disabled:pointer-events-none disabled:opacity-25"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Сводка по парку: четыре числа, все из тех же строк, что ниже. */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Chip label={t(locale, 'trucks.heatmap.sumOnLoad')} value={String(count('busy'))} tone="text-good-400" />
        <Chip label={t(locale, 'trucks.heatmap.sumFree')} value={String(count('free'))} tone="text-warn-400" />
        {count('off') > 0 && <Chip label={t(locale, 'trucks.heatmap.sumOff')} value={String(count('off'))} />}
        <Chip
          label={t(locale, 'trucks.heatmap.sumUtil')}
          value={`${util}%`}
          hint={t(locale, 'trucks.heatmap.sumUtilHint')}
        />
        <Chip
          label={t(locale, 'trucks.heatmap.sumRate')}
          value={totalRate > 0 ? usd.format(totalRate) : '—'}
          hint={t(locale, 'trucks.heatmap.colRateHint')}
        />
      </div>

      <div className="mt-3 grid items-center gap-x-2 sm:gap-x-3" style={{ gridTemplateColumns: gridCols }}>
        {/* Заголовки столбцов. */}
        <span className="self-end pb-1 text-2xs font-semibold uppercase tracking-wide text-t3">
          {t(locale, 'trucks.heatmap.colTruck')}
        </span>
        <div className="grid gap-px" style={dayGrid}>
          {cols.map((c, i) => {
            const isToday = i === todayIdx
            return (
              <span
                key={colKeys[i]}
                className={`flex min-w-0 flex-col items-center rounded-t-md pt-1 pb-1 leading-none ${
                  isToday ? 'bg-haul-500/25 text-white' : weekend[i] ? 'text-haul-200' : 'text-t3'
                }`}
                title={isToday ? t(locale, 'trucks.heatmap.today') : undefined}
              >
                <span className="max-w-full truncate text-[10px] font-medium capitalize">
                  {weekday(c)}
                </span>
                <span className={`nums mt-0.5 text-xs ${isToday ? 'font-bold' : 'font-semibold'}`}>
                  {c.getDate()}
                </span>
              </span>
            )
          })}
        </div>
        {wide && (
          <>
            <span className="self-end truncate pb-1 text-2xs font-semibold uppercase tracking-wide text-t3">
              {t(locale, 'trucks.heatmap.colPlace')}
            </span>
            <span className="self-end truncate pb-1 text-right text-2xs font-semibold uppercase tracking-wide text-t3">
              {t(locale, 'trucks.heatmap.colWhen')}
            </span>
          </>
        )}
        <span
          className="self-end truncate pb-1 text-right text-2xs font-semibold uppercase tracking-wide text-t3"
          title={t(locale, 'trucks.heatmap.colRateHint')}
        >
          {t(locale, 'trucks.heatmap.colRate')}
        </span>

        {data.map((d, rowIdx) => {
          const { r, segs, lanes } = d
          return (
            <div key={r.id} className="contents">
              {/* Трак и водитель — ссылка на карточку трака. */}
              <Link
                href={`/trucks/${r.id}`}
                className={`min-w-0 self-stretch border-t border-white/[0.06] py-2 leading-tight hover:underline ${
                  wide ? '' : 'row-span-2'
                }`}
              >
                <span className="nums block truncate text-sm font-semibold text-t1">{r.label}</span>
                {r.sub && <span className="block truncate text-xs text-t2">{r.sub}</span>}
              </Link>

              {/* Дни: фон столбцов (выходные, сегодня) и поверх — полосы рейсов. */}
              <div
                className="grid gap-x-px gap-y-1 self-stretch border-t border-white/[0.06]"
                // Пустые ряды сверху и снизу — отступ, под который тоже ложится фон
                // столбцов: столбец «Сегодня» идёт сплошной полосой через все строки.
                style={{ ...dayGrid, gridTemplateRows: `minmax(0.125rem,1fr) repeat(${lanes}, 1.5rem) minmax(0.125rem,1fr)` }}
              >
                {cols.map((_, i) => (
                  <span
                    key={colKeys[i]}
                    aria-hidden
                    className={`${
                      i === todayIdx
                        ? 'bg-haul-500/[0.14]'
                        : weekend[i]
                          ? 'bg-white/[0.035]'
                          : 'bg-white/[0.012]'
                    }`}
                    style={{ gridColumn: i + 1, gridRow: '1 / -1' }}
                  />
                ))}
                {segs.map((s, n) => {
                  const phase = phaseOf(s.load)
                  const span = s.end - s.start + 1
                  const text = city(s.load.dest)
                  return (
                    <Link
                      key={s.load.id}
                      href={`/loads/${s.load.id}`}
                      aria-label={`${s.load.route} · ${usd.format(s.load.rate)}`}
                      onMouseEnter={(e) => {
                        cancelClose()
                        const box = e.currentTarget.getBoundingClientRect()
                        setHover({
                          x: box.left + box.width / 2,
                          top: box.top,
                          bottom: box.bottom,
                          label: r.sub ? `${r.label} · ${r.sub}` : r.label,
                          load: s.load,
                        })
                      }}
                      onMouseLeave={scheduleClose}
                      className={`heat-bar relative z-[1] mx-px flex min-w-0 items-center gap-1 overflow-hidden border px-1.5 text-[11px] font-medium leading-none transition-[filter] hover:brightness-125 ${
                        BAR[phase]
                      } ${s.cutStart ? 'rounded-l-none border-l-0' : 'rounded-l-md'} ${
                        s.cutEnd ? 'rounded-r-none border-r-0' : 'rounded-r-md'
                      }`}
                      style={{
                        gridColumn: `${s.start + 1} / ${s.end + 2}`,
                        gridRow: s.lane + 2,
                        animationDelay: `${Math.min(rowIdx * 40 + n * 60, 600)}ms`,
                      }}
                    >
                      {!s.cutStart && <span className="size-1.5 shrink-0 rounded-full bg-current opacity-80" />}
                      {span >= 2 && <span className="truncate">{text}</span>}
                    </Link>
                  )
                })}
              </div>

              {wide && (
                <>
                  <span className="min-w-0 self-stretch truncate border-t border-white/[0.06] py-2 text-sm leading-6 text-t2">
                    {r.place ?? '—'}
                  </span>
                  <span
                    className={`self-stretch truncate border-t border-white/[0.06] py-2 text-right text-sm font-semibold leading-6 ${whenCls(r.when?.tone)}`}
                    title={d.idle ? t(locale, 'trucks.heatmap.freeDaysHint') : undefined}
                  >
                    {whenText(d)}
                  </span>
                </>
              )}
              <span
                className={`nums self-stretch border-t border-white/[0.06] py-2 text-right text-sm leading-6 ${
                  d.rate > 0 ? 'text-t1' : 'text-t3'
                } ${wide ? '' : 'row-span-2'}`}
              >
                {d.rate > 0 ? usd.format(d.rate) : '—'}
              </span>
              {/* Узкая плитка: где трак и когда свободен — строкой под полосами. */}
              {!wide && (
                <span className="-mt-1.5 flex min-w-0 items-baseline gap-2 pb-2 text-xs">
                  <span className="min-w-0 truncate text-t2" title={r.place ?? undefined}>{r.place ?? '—'}</span>
                  <span
                    className={`ml-auto shrink-0 font-semibold ${whenCls(r.when?.tone)}`}
                    title={d.idle ? t(locale, 'trucks.heatmap.freeDaysHint') : undefined}
                  >
                    {whenText(d)}
                  </span>
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Легенда — теми же полосами, что в сетке. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-t2">
        {(['done', 'moving', 'planned'] as Phase[]).map((p) => (
          <span key={p} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-5 rounded-sm border ${BAR[p]}`} />
            {t(locale, PHASE_KEY[p])}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm bg-haul-500/30" />
          {t(locale, 'trucks.heatmap.today')}
        </span>
      </div>

      {/* Карточка рейса при наведении. В <body> через портал: у панели backdrop-filter,
          и position:fixed внутри неё считался бы от панели, а не от окна. */}
      {hover &&
        createPortal(
          (() => {
            const CARD_W = 260
            const CARD_H = 110
            const left = Math.min(Math.max(hover.x, CARD_W / 2 + 8), window.innerWidth - CARD_W / 2 - 8)
            const above = hover.top > CARD_H
            const phase = phaseOf(hover.load)
            return (
              <div
                className={`pointer-events-none fixed z-[60] -translate-x-1/2 ${
                  above ? '-translate-y-full pb-1.5' : 'pt-1.5'
                }`}
                style={{ left, top: above ? hover.top : hover.bottom }}
              >
                <Link
                  href={`/loads/${hover.load.id}`}
                  onMouseEnter={cancelClose}
                  onMouseLeave={scheduleClose}
                  className="pointer-events-auto block w-[260px] rounded-lg border border-white/12 bg-ink-900 p-2.5 shadow-2xl transition-colors hover:border-haul-400/50"
                >
                  <span className="block truncate text-2xs text-t3">{hover.label}</span>
                  <span className="mt-0.5 block truncate text-sm font-medium text-t1">{hover.load.route}</span>
                  <span className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-t2">
                      <span className={`h-2 w-4 rounded-sm border ${BAR[phase]}`} />
                      {statusLabel(locale, hover.load.status)}
                    </span>
                    <span className="nums font-semibold text-t1">{usd.format(hover.load.rate)}</span>
                  </span>
                </Link>
              </div>
            )
          })(),
          document.body,
        )}
    </div>
  )
}

function Chip({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <span
      title={hint}
      className="panel-inset inline-flex items-baseline gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs text-t2"
    >
      {label}
      <span className={`nums text-sm font-semibold ${tone ?? 'text-t1'}`}>{value}</span>
    </span>
  )
}
