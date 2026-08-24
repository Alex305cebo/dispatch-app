'use client'

// День трака как лента событий: где ехал, где стоял, во что это обошлось по времени.
// Считает не этот файл — вся арифметика в lib/trip-history.ts и покрыта тестами;
// здесь только показ и выбор отрезка.
//
// Что было и почему переделано. Секция была плоским списком строк «10:37–08:28 ·
// 471 mi». По нему нельзя было ответить ни на один вопрос, который на самом деле
// задают: сколько всего проехали за окно, где потеряли день, стоял ли трак под
// выгрузкой (это детеншен, за него платят) или просто отдыхал. Теперь сверху итог
// окна, у каждого дня свой итог, лента суток кликабельна, а стоянки в городе
// погрузки или выгрузки помечены отдельно — этого не знает ни один ELD, потому что
// груз знаем только мы.

import { Fragment, useEffect, useState } from 'react'
import {
  DAY_MS,
  dayTotals,
  daySpans,
  startOfDay,
  stopRole,
  summarize,
  type HistoryLeg,
  type LoadStop,
} from '@/lib/trip-history'
import { driveTime } from '@/lib/fmt'
import { t, type Locale } from '@/lib/i18n'

const loc = (locale: Locale) => (locale === 'ru' ? 'ru-RU' : 'en-US')
const timeOf = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleTimeString(loc(locale), { hour: '2-digit', minute: '2-digit' })
const dateOf = (iso: string, locale: Locale) => new Date(iso).toLocaleDateString(loc(locale))
// Короткая дата для отрезка, перешедшего полночь: заголовок дня показывает только
// день НАЧАЛА, и одно время конца («15:34–15:00») читалось как бессмыслица.
const dateShort = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleDateString(loc(locale), { day: '2-digit', month: '2-digit' })

function rangeLabel(from: string, to: string, locale: Locale): string {
  const tf = timeOf(from, locale)
  const tt = timeOf(to, locale)
  return dateOf(from, locale) === dateOf(to, locale) ? `${tf}–${tt}` : `${tf}–${tt} (${dateShort(to, locale)})`
}

/** Плитка итога — тот же вид, что у плиток над картой груза, чтобы числа на разных
 * экранах читались одинаково. */
function Tile({ value, label, tone }: { value: string; label: string; tone?: 'warn' | 'good' }) {
  return (
    <div className="flex-1 basis-[6.5rem] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <div
        className={`nums text-[15px] font-semibold ${
          tone === 'warn' ? 'text-warn-400' : tone === 'good' ? 'text-good-400' : 'text-white/85'
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-white/45">{label}</div>
    </div>
  )
}

/**
 * Сутки одной лентой: зелёное — ехал, серое — стоял, янтарное — долгий отдых,
 * фиолетовое — стоял под погрузкой или выгрузкой.
 *
 * Список ниже содержит те же факты словами, но столбец «09:14–11:02 · 2 ч» никогда
 * не показывает ФОРМУ дня, а форма и есть полезное: шестичасовой провал между двумя
 * рейсами — это детеншен, за который платят, и в тексте он выглядит так же, как ночёвка.
 *
 * Отрезки обрезаны по суткам, поэтому рейс через полночь рисуется на обоих днях.
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
  onSelect: (i: number | null) => void
  nowMs: number | null
}) {
  const spans = daySpans(legs, dayMs)
  // Доля суток, которая ещё не наступила: сегодняшняя лента иначе выглядит так,
  // будто трак полдня простоял, хотя этих часов просто ещё не было.
  const futurePct =
    nowMs !== null && nowMs > dayMs && nowMs < dayMs + DAY_MS ? 100 - ((nowMs - dayMs) / DAY_MS) * 100 : 0

  return (
    <div className="px-1">
      <div className="relative h-3 overflow-hidden rounded-full bg-white/6">
        {spans.map((s, i) => {
          const idx = allLegs.indexOf(s.leg)
          const role = s.leg.kind === 'stop' ? stopRole(s.leg.location, s.leg.from, stops) : null
          const tone =
            s.leg.kind === 'drive'
              ? 'bg-good-400'
              : role
                ? 'bg-haul-400'
                : s.leg.long
                  ? 'bg-warn-400/80'
                  : 'bg-white/25'
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(selected === idx ? null : idx)}
              title={`${timeOf(new Date(s.fromMs).toISOString(), locale)}–${timeOf(
                new Date(s.toMs).toISOString(),
                locale,
              )} · ${driveTime(Math.round((s.toMs - s.fromMs) / 60000), locale)}`}
              className={`absolute inset-y-0 ${tone} ${selected === idx ? 'ring-1 ring-white/80' : ''}`}
              style={{ left: `${s.leftPct}%`, width: `${s.widthPct}%` }}
            />
          )
        })}
        {futurePct > 0 && (
          <span
            className="absolute inset-y-0 right-0 bg-ink-950/55"
            style={{ width: `${futurePct}%` }}
            aria-hidden
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[9px] tabular-nums text-white/25">
        {['00', '06', '12', '18', '24'].map((h) => (
          <span key={h}>{h}</span>
        ))}
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
   * детеншен. Пусто — просто не будет пометок. */
  stops?: LoadStop[]
}) {
  const [selected, setSelected] = useState<number | null>(null)
  // Время берём после монтирования: на сервере оно другое, и отрисованное там
  // затемнение «будущего» разошлось бы с браузерным при гидратации.
  const [nowMs, setNowMs] = useState<number | null>(null)
  useEffect(() => setNowMs(Date.now()), [])

  if (legs.length === 0) {
    return <p className="text-[13px] leading-relaxed text-white/55">{t(locale, 'trucks.trip.empty')}</p>
  }

  const total = summarize(legs)
  // Часы под погрузкой и выгрузкой — то, за что выставляют детеншен. Считаются
  // здесь, а не в summarize: сопоставление с городами рейт-кона живёт на этом экране.
  const detentionMin = legs.reduce(
    (sum, l) => (l.kind === 'stop' && stopRole(l.location, l.from, stops) ? sum + l.minutes : sum),
    0,
  )
  let lastDate = ''

  return (
    <div>
      {/* Итог окна — первое, что нужно: сколько наездили и где потеряли время.
          Раньше эти числа приходилось складывать глазами по строкам. */}
      <div className="mb-3 flex flex-wrap gap-2">
        <Tile value={`${total.miles.toLocaleString('en-US')} mi`} label={t(locale, 'trucks.trip.tileMiles')} />
        <Tile value={driveTime(total.driveMin, locale)} label={t(locale, 'trucks.trip.tileDrive')} tone="good" />
        <Tile value={driveTime(total.stopMin, locale)} label={t(locale, 'trucks.trip.tileStopped')} />
        <Tile value={String(total.stops)} label={t(locale, 'trucks.trip.tileStops')} />
        {total.avgMph !== null && <Tile value={`${total.avgMph} mi/h`} label={t(locale, 'trucks.trip.tileAvg')} />}
        {/* Плитка появляется, только когда детеншен есть: ноль часов ожидания —
            не показатель, а пустое место в ряду. */}
        {detentionMin > 0 && (
          <Tile
            value={driveTime(detentionMin, locale)}
            label={t(locale, 'trucks.trip.underLoad')}
            tone={detentionMin >= 120 ? 'warn' : undefined}
          />
        )}
      </div>

      <ol className="flex flex-col gap-1.5">
        {legs.map((leg, i) => {
          const day = dateOf(leg.from, locale)
          const isNewDay = day !== lastDate
          lastDate = day
          const dayMs = startOfDay(Date.parse(leg.from))
          // Все отрезки этого календарного дня, а не только те, что ниже разделителя:
          // рейс, начавшийся вчера вечером, занимает и сегодняшние часы.
          const ofDay = isNewDay
            ? legs.filter((l) => Date.parse(l.to) > dayMs && Date.parse(l.from) < dayMs + DAY_MS)
            : []
          const totals = isNewDay ? dayTotals(ofDay, dayMs) : null
          const role = leg.kind === 'stop' ? stopRole(leg.location, leg.from, stops) : null
          const isSel = selected === i
          const avg = leg.kind === 'drive' && leg.minutes >= 30 ? Math.round(leg.miles / (leg.minutes / 60)) : null

          return (
            <Fragment key={i}>
              {isNewDay && (
                <>
                  <li className="mt-3 flex items-baseline justify-between gap-2 px-1 first:mt-0">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-white/40">{day}</span>
                    {totals && totals.driveMin > 0 && (
                      <span className="nums text-[11px] text-white/45">
                        {totals.miles.toLocaleString('en-US')} mi ·{' '}
                        <span className="text-good-400">{driveTime(totals.driveMin, locale)}</span>{' '}
                        {t(locale, 'trucks.trip.behindWheel')}
                      </span>
                    )}
                  </li>
                  <li>
                    <DayRibbon
                      dayMs={dayMs}
                      legs={ofDay}
                      allLegs={legs}
                      locale={locale}
                      stops={stops}
                      selected={selected}
                      onSelect={setSelected}
                      nowMs={nowMs}
                    />
                  </li>
                </>
              )}

              <li>
                <button
                  type="button"
                  onClick={() => setSelected(isSel ? null : i)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors ${
                    isSel
                      ? 'border-white/25 bg-white/[0.07]'
                      : role
                        ? 'border-haul-500/25 bg-haul-500/[0.06]'
                        : leg.kind === 'stop' && leg.long
                          ? 'border-warn-400/25 bg-warn-400/[0.06]'
                          : 'border-white/6 bg-white/[0.015] hover:border-white/15'
                  }`}
                >
                  {/* Точка слева вместо эмодзи: цвет несёт тот же смысл, что и на
                      ленте суток, поэтому строка и отрезок читаются как одно. */}
                  <span
                    className={`size-2 shrink-0 rounded-full ${
                      leg.kind === 'drive'
                        ? 'bg-good-400'
                        : role
                          ? 'bg-haul-400'
                          : leg.long
                            ? 'bg-warn-400'
                            : 'bg-white/35'
                    }`}
                    aria-hidden
                  />

                  {leg.kind === 'drive' ? (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-white/80">
                          {leg.fromLocation ?? '—'} → {leg.toLocation ?? '—'}
                        </span>
                        <span className="nums block text-[11px] text-white/45">
                          {rangeLabel(leg.from, leg.to, locale)}
                          {avg !== null && ` · ${avg} mi/h ${t(locale, 'trucks.trip.avgShort')}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="nums block font-semibold text-white/85">
                          {leg.miles.toLocaleString('en-US')} mi
                        </span>
                        <span className="nums block text-[11px] text-white/45">{driveTime(leg.minutes, locale)}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-white/80">
                            {leg.location ?? t(locale, leg.long ? 'trucks.trip.longRest' : 'trucks.trip.stop')}
                          </span>
                          {role && (
                            <span className="shrink-0 rounded-full bg-haul-500/20 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-haul-400">
                              {t(locale, role === 'pickup' ? 'trucks.trip.atPickup' : 'trucks.trip.atDelivery')}
                            </span>
                          )}
                          {!role && leg.long && (
                            <span className="shrink-0 rounded-full bg-warn-400/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-warn-400">
                              {t(locale, 'trucks.trip.longRest')}
                            </span>
                          )}
                        </span>
                        <span className="nums block text-[11px] text-white/45">
                          {rangeLabel(leg.from, leg.to, locale)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span
                          className={`nums block font-semibold ${
                            role ? 'text-haul-400' : leg.long ? 'text-warn-400' : 'text-white/70'
                          }`}
                        >
                          {driveTime(leg.minutes, locale)}
                        </span>
                        <span className="block text-[11px] text-white/45">
                          {t(locale, role ? 'trucks.trip.underLoad' : 'trucks.trip.standing')}
                        </span>
                      </span>
                    </>
                  )}
                </button>
              </li>
            </Fragment>
          )
        })}
      </ol>
    </div>
  )
}
