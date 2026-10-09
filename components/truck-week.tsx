// «Неделя» на карточке трака — одна строка картинок вместо двенадцати плиток-цифр
// (план «Порядок в TMS», 10/09/26; владелец 09.10: «меньше цифр и текста, больше
// графиков»): гросс со столбиками по дням пикапа, мили одной полосой «гружёные / пустые»,
// «вовремя» кольцом. Цель недели из профиля водителя — риской и полосой там, где она есть.
// За столбиками пунктиром — прошлая неделя: в пятницу, когда новая только началась,
// график иначе был бы пустым у каждого трака.

import { t, type Locale } from '@/lib/i18n'
import { usd, usd2 } from '@/lib/fmt'
import { shiftDay } from '@/lib/loads-dashboard'
import { Info } from '@/components/info'

export type TruckWeekData = {
  /** Пятница расчётной недели, yyyy-mm-dd. */
  weekFrom: string
  /** Сегодня по восточному времени, yyyy-mm-dd — его столбик подсвечен. */
  today: string
  /** Гросс по дням пикапа, с пятницы по четверг. */
  days: number[]
  gross: number
  /** То же за прошлую неделю — пунктиром за столбиками. */
  prevDays: number[]
  prevGross: number
  targetGross: number | null
  /** Все мили недели: с грузом и пустые. */
  miles: number
  deadhead: number
  targetMiles: number | null
  onTimePct: number | null
  onTimeTotal: number
}

/** Пустые мили: от 15 % жёлтым, от 25 % красным — границы бывшей плитки «Deadhead». */
const DEADHEAD_WARN_PCT = 15
const DEADHEAD_BAD_PCT = 25

const LABEL = 'text-2xs font-semibold tracking-wide text-t3 uppercase'

export function TruckWeek({ d, locale }: { d: TruckWeekData; locale: Locale }) {
  const rpm = d.miles > 0 ? d.gross / d.miles : 0
  const max = Math.max(1, ...d.days, ...d.prevDays)
  const h = (v: number) => `${Math.max(12, (v / max) * 100)}%`
  const day = (i: number) => shiftDay(d.weekFrom, i)
  const short = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, o)
  const loaded = Math.max(0, d.miles - d.deadhead)
  const dhPct = d.miles > 0 ? (d.deadhead / d.miles) * 100 : 0
  // Полоса миль: с целью — её длина до цели (дальше риска), без цели — вся ширина.
  const milesBase = d.targetMiles ? Math.max(d.targetMiles, d.miles) : d.miles
  const pct = (v: number) => (milesBase > 0 ? (v / milesBase) * 100 : 0)
  const dhTone = dhPct >= DEADHEAD_BAD_PCT ? 'bad' : dhPct >= DEADHEAD_WARN_PCT ? 'warn' : null

  return (
    <section className="panel @container p-4">
      <h2 className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-base leading-6 font-semibold text-t1">
        {t(locale, 'trucks.week.title')}
        <Info text={t(locale, 'trucks.week.info')} />
        <span className="nums ml-auto text-sm font-normal text-t3">
          {short(d.weekFrom, { month: 'short', day: 'numeric' })} – {short(day(6), { month: 'short', day: 'numeric' })}
        </span>
      </h2>

      <div className="mt-3 grid gap-2 @xl:grid-cols-2 @4xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Гросс и столбики по дням пикапа. */}
        <div className="panel-inset min-w-0 px-3 py-2.5">
          <div className={LABEL}>{t(locale, 'trucks.week.gross')}</div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <span className={`nums text-xl font-bold ${d.targetGross && d.gross >= d.targetGross ? 'text-good-400' : 'text-t1'}`}>
              {usd.format(d.gross)}
            </span>
            {rpm > 0 && <span className="nums text-sm text-t2">{usd2.format(rpm)}/mi</span>}
            {d.prevGross > 0 && (
              <span className="nums inline-flex items-center gap-1 text-xs text-t3">
                <span aria-hidden className="h-2.5 w-2 rounded-t-[2px] border border-b-0 border-dashed border-white/40" />
                {t(locale, 'trucks.week.prev').replace('{v}', usd.format(d.prevGross))}
              </span>
            )}
            {d.targetGross ? (
              <span className="nums ml-auto text-xs text-t3">
                {t(locale, 'trucks.week.goal').replace('{v}', usd.format(d.targetGross))} · {Math.round((d.gross / d.targetGross) * 100)}%
              </span>
            ) : null}
          </div>
          {d.targetGross ? (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8" aria-hidden>
              <span
                className={`block h-full rounded-full ${d.gross >= d.targetGross ? 'bg-good-400' : 'bg-haul-400'}`}
                style={{ width: `${Math.min(100, (d.gross / d.targetGross) * 100)}%` }}
              />
            </div>
          ) : null}
          <div className="mt-2 grid grid-cols-7 gap-1" aria-hidden>
            {d.days.map((v, i) => {
              const iso = day(i)
              return (
                <div
                  key={iso}
                  className="flex min-w-0 flex-col items-center gap-1"
                  title={`${short(iso, { weekday: 'short', day: 'numeric' })}: ${usd.format(v)}${
                    d.prevDays[i] ? ` · ${t(locale, 'trucks.week.prev').replace('{v}', usd.format(d.prevDays[i]!))}` : ''
                  }`}
                >
                  <span className="relative flex h-10 w-full items-end justify-center">
                    {d.prevDays[i] ? (
                      <span
                        className="absolute bottom-0 left-1/2 w-full max-w-6 -translate-x-1/2 rounded-t-[3px] border border-b-0 border-dashed border-white/30"
                        style={{ height: h(d.prevDays[i]!) }}
                      />
                    ) : null}
                    <span
                      className={`relative block w-full max-w-6 rounded-t-[3px] ${v > 0 ? 'bg-haul-500' : 'bg-white/10'}`}
                      style={{ height: v > 0 ? h(v) : 2 }}
                    />
                  </span>
                  <span className={`text-2xs capitalize leading-3 ${iso === d.today ? 'font-bold text-t1' : 'text-t3'}`}>
                    {short(iso, { weekday: 'short' })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Мили: гружёные и пустые одной полосой, цель — риской. */}
        <div className="panel-inset min-w-0 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className={LABEL}>{t(locale, 'loadMoney.miles')}</span>
            {d.targetMiles ? (
              <span className="nums text-xs text-t3">
                {t(locale, 'trucks.week.goal').replace('{v}', `${d.targetMiles.toLocaleString('en-US')} mi`)} ·{' '}
                {Math.round((d.miles / d.targetMiles) * 100)}%
              </span>
            ) : null}
          </div>
          <span className={`nums mt-0.5 block text-xl font-bold ${d.targetMiles && d.miles >= d.targetMiles ? 'text-good-400' : 'text-t1'}`}>
            {Math.round(d.miles).toLocaleString('en-US')} mi
          </span>
          <div className="relative mt-2" aria-hidden>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/8">
              <span className="bg-sky-400/80" style={{ width: `${pct(loaded)}%` }} />
              {d.deadhead > 0 && (
                <span className={dhTone ? DH_BAR[dhTone] : 'bg-white/35'} style={{ width: `${pct(d.deadhead)}%` }} />
              )}
            </div>
            {d.targetMiles ? (
              <span className="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-full bg-good-400" style={{ left: `${pct(d.targetMiles)}%` }} />
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-t3">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-sky-400/80" />
              {t(locale, 'loadMoney.loaded')}
              <span className="nums text-t2">{Math.round(loaded).toLocaleString('en-US')}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`size-2 rounded-sm ${dhTone ? DH_BAR[dhTone] : 'bg-white/35'}`} />
              {t(locale, 'loadMoney.empty')}
              <span className={`nums ${dhTone ? `font-semibold ${DH_TEXT[dhTone]}` : 'text-t2'}`}>
                {Math.round(d.deadhead).toLocaleString('en-US')} · {Math.round(dhPct)}%
              </span>
            </span>
          </div>
        </div>

        {/* Вовремя — кольцом. */}
        <div className="panel-inset flex min-w-0 items-center gap-3 px-3 py-2.5 @xl:col-span-2 @4xl:col-span-1">
          <Ring pct={d.onTimePct} />
          <div className="min-w-0">
            <div className={LABEL}>{t(locale, 'trucks.chip.onTime')}</div>
            {d.onTimePct == null ? (
              <span className="mt-0.5 block text-base text-t3">{t(locale, 'trucks.chip.onTimeFew')}</span>
            ) : (
              <>
                <span className={`nums mt-0.5 block text-xl font-bold ${ringText(d.onTimePct)}`}>{d.onTimePct}%</span>
                <span className="nums block text-xs text-t3">{t(locale, 'trucks.week.stops').replace('{n}', String(d.onTimeTotal))}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

const DH_BAR = { warn: 'bg-warn-400', bad: 'bg-bad-400' } as const
const DH_TEXT = { warn: 'text-warn-400', bad: 'text-bad-400' } as const

// «Вовремя»: от 90 % зелёным, ниже 80 % жёлтым — границы бывшей плитки.
const ringText = (pct: number) => (pct >= 90 ? 'text-good-400' : pct >= 80 ? 'text-t1' : 'text-warn-400')
const ringStroke = (pct: number) => (pct >= 90 ? 'stroke-good-400' : pct >= 80 ? 'stroke-haul-400' : 'stroke-warn-400')

/** Кольцо «вовремя»: доля приездов до конца окна. Нет данных — пустое кольцо. */
function Ring({ pct }: { pct: number | null }) {
  const r = 20
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 48 48" className="size-12 shrink-0 -rotate-90" aria-hidden>
      <circle cx="24" cy="24" r={r} fill="none" strokeWidth="6" className="stroke-white/10" />
      {pct != null && pct > 0 && (
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(Math.min(100, pct) / 100) * c} ${c}`}
          className={ringStroke(pct)}
        />
      )}
    </svg>
  )
}
