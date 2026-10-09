'use client'

// Список траков на «Траках»: одна строка на трак — кто за рулём и его телефон, где
// стоит, что везёт, что говорит ELD и сколько трак заработал за неделю.
//
// Один список вместо четырёх (план «Порядок в TMS», 10/09/26). Раньше один и тот же
// водитель стоял на странице четыре раза: кнопкой-траком под картой, строкой
// «Загрузки парка», плиткой с телефоном и карточкой внизу — и чтобы продиктовать
// брокеру номер водителя и сказать, где трак, надо было собрать три блока. Теперь всё
// это одна строка, а «Загрузка парка» — вкладка рядом.
//
// Картинкой, а не цифрами (владелец, 10/09/26: «меньше цифр и текста, больше визуала»):
// сколько рейса пройдено — полосой, сколько стоит свободный — клетками по дням, топливо —
// шкалой, неделя — полосой против лучшего трака парка. Точные числа — в подсказках.
//
// Одна разметка на две раскладки: на широком экране строка — таблица в пять столбцов
// (столбцы совпадают у всех строк, поэтому читаются сверху вниз), на узком — карточка
// в четыре строки. Раскладку решает ширина самой плитки, а не экрана: плитку можно
// сделать узкой и на компьютере.

import Link from 'next/link'
import { Clock, Copy, FileWarning, Fuel, Hourglass, Phone, Truck, Undo2 } from 'lucide-react'
import { LocalTime } from '@/components/local-time'
import { useLocale } from '@/components/locale-provider'
import { weatherKind, weatherTone } from '@/lib/weather-label'
import { WeatherIcon } from '@/components/weather-icon'
import { t } from '@/lib/i18n'
import { usd, usd2, usDate } from '@/lib/fmt'
import { CopyPlace } from '@/components/copy-place'
import { Info } from '@/components/info'
import { Rpm } from '@/components/rpm'
import { copyText, infoBlock, useDispatcherPhone, type DirectoryCompany } from '@/components/driver-directory'
import { RateConButton } from '@/components/ratecon-button'

export type TrackingRow = {
  id: number
  /** Подпись трака целиком — «Alex M. TRK-DEMO-101 TRL-TR-101»: на карте и в подсказках. */
  label: string
  /** Номер трака (или его имя, если номера нет) — первое, что ищут глазами в строке. */
  number: string
  trailer: string | null
  /** Водитель полностью: его диктуют брокеру. */
  driverName: string | null
  city: string | null
  /** Последний GPS-фикс. Название города Google Maps понимает приблизительно —
   * координаты дают точку ровно там, где трак. */
  lat: number | null
  lng: number | null
  eldSeen: string | null
  statusText: string
  statusTone: 'move' | 'on' | 'rest'
  hasLoad: boolean
  loadId: number | null
  loadRoute: string | null
  /** Рейт-кон текущего груза — кнопка «RC» рядом с маршрутом. */
  rcId: number | null
  /** Сколько гружёного пути пройдено, 0..1; 0 — трак ещё едет к пикапу. null — миль
   * груза или GPS нет, полосу не рисуем. */
  progress: number | null
  phone: string | null
  /** IANA-пояс последнего GPS-фикса — рядом с местом показывает, который час у
   * водителя. Половина парка живёт в другом поясе, и звонок в 4 утра стоит дороже
   * любой сэкономленной минуты. */
  zone: string | null
  delivery: { to: string; miles: number; etaMin: number } | null
  driveTimeText: string | null
  weather: { event: string; headline: string } | null
  idleHours: number | null
  /** Tank level in percent, straight from the truck's sensor (lib/eld.ts). Null when
   * the ELD hasn't reported one — the app has no other way to know it. */
  fuel: number | null
  /** Manual flag from the truck: 'repair' | 'vacation' | null. Badged, and never
   * counted as free — a truck in the shop isn't available just because it's empty. */
  unavailable: 'repair' | 'vacation' | null
  /** Рейс, который трак вёз до нынешнего (у свободного — последний вообще). Говорит,
   * где трак освободился и когда, — этим и проверяют, не потерян ли груз между рейсами. */
  prevLoad: { id: number; route: string; date: string | null } | null
}

/** Деньги, бумаги и простой трака — их считает страница: она уже держит и грузы, и
 * паспорта траков. Диспетчер решает по ним вместе с «где он», поэтому они в той же строке. */
export type TruckMoney = {
  /** Гросс по грузам этой недели. */
  week: number
  /** Мили тех же грузов (гружёные + порожние) — из них Rate per mile недели. */
  miles: number
  /** Сколько грузов у трака всего — по нему видно новичка и рабочую лошадь. */
  loads: number
  /** Ближайший к истечению документ, если он уже жёлтый или красный. */
  docWarn: string | null
  /** Сколько дней свободный трак стоит без груза — с последней выгрузки; у занятого,
   * в ремонте или в отпуске — null. */
  idle: number | null
}

export const STATUS_TONE = {
  move: 'bg-good-500/15 text-good-400',
  on: 'bg-haul-500/15 text-haul-400',
  rest: 'bg-white/8 text-t2',
}
export const TRUCK_TONE = { move: 'text-good-400', on: 'text-haul-300', rest: 'text-t3' } as const

/** Fuel colour ladder — below 15% it's a stop-and-fix, below 30% a plan-ahead. */
const fuelClass = (v: number) => (v <= 15 ? 'text-bad-400' : v <= 30 ? 'text-warn-400' : 'text-t3')
const fuelFill = (v: number) => (v <= 15 ? 'bg-bad-400' : v <= 30 ? 'bg-warn-400' : 'bg-good-400')

/** Свободный трак: клетка на день без груза, до двух недель. С пятого дня клетки
 *  красные — тот же порог, что у плитки «Свободны». */
const IDLE_DAYS = 14

// Столбцы и области строки. Узко: «трак | статус», «водитель», «где», «груз», «неделя» —
// груз во всю ширину, иначе маршрут рядом с кнопкой RC и неделей обрезался до «Atlanta, …».
// Широко: пять столбцов, в первом — трак, под ним водитель и телефон. Ширины без
// оглядки на содержимое (minmax(0, …) и фиксированные), иначе каждая строка-карточка
// посчитала бы свои столбцы и таблица разъехалась бы.
const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] [grid-template-areas:'who_status'_'contact_contact'_'where_where'_'load_load'_'week_week'] @4xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.05fr)_minmax(0,1.2fr)_8.5rem_7.5rem] @4xl:[grid-template-areas:'who_where_load_status_week'_'contact_where_load_status_week']"

export function FleetList({
  rows,
  money,
  company,
  dispatchers,
}: {
  rows: TrackingRow[]
  /** id трака → деньги и бумаги. Ключом объект, а не Map: так он переживает
   * пересылку с сервера в браузер без превращений. */
  money?: Record<number, TruckMoney>
  /** Компания и тот, кто открыл страницу, — вторая половина блока брокеру. */
  company?: DirectoryCompany
  /** Диспетчер, закреплённый за траком, и его номер — в блок брокеру вместо своего. */
  dispatchers?: Record<number, { name: string; phone: string }>
}) {
  const locale = useLocale()
  const myPhone = useDispatcherPhone(company?.dispatcherPhone ?? '')
  const weekTotal = rows.reduce((s, r) => s + (money?.[r.id]?.week ?? 0), 0)
  // Полоса недели — против лучшего трака всего парка, а не только показанных строк:
  // иначе при выборе одного трака его полоса всегда была бы полной.
  const weekBest = Math.max(1, ...Object.values(money ?? {}).map((m) => m.week))
  const milesTotal = rows.reduce((s, r) => s + (money?.[r.id]?.miles ?? 0), 0)

  if (!rows.length) return <p className="panel p-4 text-center text-base text-t3">{t(locale, 'trucks.list.empty')}</p>

  return (
    <div className="@container">
      {/* Шапка таблицы — только когда строка и правда таблица. */}
      <div className={`${GRID} mb-1 hidden gap-x-4 px-3 text-2xs font-semibold uppercase tracking-wide text-t3 @4xl:grid`}>
        <span className="[grid-area:who]">{t(locale, 'trucks.list.colTruck')}</span>
        <span className="[grid-area:where]">{t(locale, 'trucks.list.colWhere')}</span>
        <span className="[grid-area:load]">{t(locale, 'trucks.list.colLoad')}</span>
        <span className="[grid-area:status]">{t(locale, 'trucks.list.colStatus')}</span>
        <span className="flex items-center justify-end gap-1 [grid-area:week]">
          {t(locale, 'trucks.list.colWeek')}
          <Info text={t(locale, 'trucks.page.weekGrossInfo')} />
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const m = money?.[r.id]
          const disp = dispatchers?.[r.id]
          const digits = (r.phone ?? '').replace(/[^\d+]/g, '')
          return (
            <div key={r.id} className={`${GRID} panel panel-interactive relative gap-x-4 gap-y-1 px-3 py-2.5`}>
              {/* Вся строка открывает трак. Ссылка-подложка, а не <Link> вокруг: внутри
                  есть свои кнопки и ссылки, а вложенные ссылки — неверная разметка, и
                  щелчки по ним съедались бы. Всё нажимаемое ниже стоит на z-10. */}
              <Link href={`/trucks/${r.id}`} aria-label={r.label} className="absolute inset-0 rounded-[inherit]" />

              {/* Трак: номер, прицеп, ремонт или отпуск. Цвет значка — состояние по ELD,
                  тот же, что у трака на карте. */}
              <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 [grid-area:who]">
                <Truck size={15} strokeWidth={2.3} className={`shrink-0 ${r.unavailable ? 'text-warn-400' : TRUCK_TONE[r.statusTone]}`} />
                <span className="nums text-base leading-tight font-semibold text-t1">{r.number}</span>
                {r.trailer && <span className="nums text-xs text-t3">TRL-{r.trailer}</span>}
                {r.unavailable && (
                  <span className="shrink-0 rounded-full bg-warn-400/15 px-1.5 py-0.5 text-2xs font-semibold text-warn-400">
                    {t(locale, r.unavailable === 'repair' ? 'tracking.repairLabel' : 'tracking.vacationLabel')}
                  </span>
                )}
              </div>

              {/* Водитель и телефон: номер виден целиком — его диктуют брокеру, а с
                  телефона по нему сразу звонят. Рядом — готовый блок для брокера. В
                  таблице имя — своей строкой: в одну с номером оно обрезалось до «Casey Broo…». */}
              <div className="flex min-w-0 items-center gap-x-2 text-sm [grid-area:contact] @4xl:flex-wrap">
                <span className="min-w-0 truncate text-t2 @4xl:basis-full">{r.driverName || t(locale, 'drivers.noName')}</span>
                {digits && (
                  <a href={`tel:${digits}`} className="nums relative z-10 inline-flex shrink-0 items-center gap-1 text-haul-300 hover:underline">
                    <Phone size={11} strokeWidth={2.5} className="shrink-0 opacity-70" />
                    {r.phone}
                  </a>
                )}
                {company && (
                  <button
                    type="button"
                    onClick={() =>
                      copyText(
                        infoBlock(
                          {
                            truckId: r.id,
                            driverName: r.driverName,
                            driverPhone: r.phone,
                            truckNumber: r.number,
                            trailerNumber: r.trailer,
                            vin: null,
                            dispatcherName: disp?.name ?? null,
                            dispatcherPhone: disp?.phone ?? null,
                          },
                          { ...company, dispatcherPhone: myPhone },
                        ),
                        t(locale, 'trucks.driverCard.copied'),
                      )
                    }
                    title={t(locale, 'trucks.driverCard.copyForBroker')}
                    aria-label={`${t(locale, 'trucks.driverCard.copyForBroker')}: ${r.number}`}
                    className="relative z-10 -my-1 flex size-7 shrink-0 items-center justify-center rounded-lg text-haul-300/80 transition-colors hover:bg-white/10 hover:text-haul-300"
                  >
                    <Copy size={13} strokeWidth={2.5} />
                  </button>
                )}
              </div>

              {/* Где стоит: место одной строкой, под ним кнопки «Копировать» и «Карта»,
                  время у водителя, погода и простой под грузом. Кнопки — словами: значки
                  без подписи владелец не находил (components/copy-place.tsx). */}
              <div className="min-w-0 text-sm text-t3 [grid-area:where] @4xl:self-center">
                <div title={r.city ?? undefined} className={`truncate ${r.city ? 'text-t2' : ''}`}>
                  {r.city ?? t(locale, 'tracking.noEldData')}
                </div>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 empty:hidden">
                  {r.city && <CopyPlace text={r.city} coords={{ lat: r.lat, lng: r.lng }} size="sm" hideText className="relative z-10" />}
                  {r.zone && (
                    <span title={t(locale, 'trucks.head.driverTimeShort')} className="inline-flex shrink-0 items-center gap-1 text-xs">
                      <Clock size={11} strokeWidth={2.5} aria-label={t(locale, 'trucks.head.driverTimeShort')} />
                      <LocalTime zone={r.zone} className="nums font-semibold text-t1" />
                    </span>
                  )}
                  {r.weather &&
                    (() => {
                      // Короткий понятный ярлык, значок по типу и подсказка о том, чем это
                      // грозит траку; красный только там, где рейс реально встаёт.
                      const kind = weatherKind(r.weather.event)
                      const bad = weatherTone(kind) === 'bad'
                      return (
                        <span
                          title={`${t(locale, `wx.${kind}.hint` as Parameters<typeof t>[1])}\n\n${r.weather.event} · ${t(locale, 'wx.source')}`}
                          className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-medium ${bad ? 'bg-bad-500/15 text-bad-400' : 'bg-warn-400/15 text-warn-400'}`}
                        >
                          <WeatherIcon kind={kind} /> {t(locale, `wx.${kind}` as Parameters<typeof t>[1])}
                        </span>
                      )
                    })()}
                  {r.idleHours !== null && (
                    <span
                      title={`${t(locale, 'tracking.idlePrefix')}${r.idleHours}${t(locale, 'tracking.idleSuffix')}`}
                      className="nums inline-flex shrink-0 items-center gap-1 rounded bg-warn-400/15 px-1.5 py-0.5 text-2xs font-semibold text-warn-400"
                    >
                      <Hourglass size={10} strokeWidth={2.5} />
                      {r.idleHours}h
                    </span>
                  )}
                </div>
              </div>

              {/* Груз: маршрут с рейт-коном и полоса — сколько пути пройдено; у свободного —
                  клетки по дням простоя и откуда он пришёл. */}
              <div className="min-w-0 text-sm [grid-area:load] @4xl:self-center">
                {r.hasLoad && r.loadId ? (
                  <>
                    <div className="flex min-w-0 items-center gap-2">
                      <Link href={`/loads/${r.loadId}`} className="relative z-10 min-w-0 truncate font-medium text-t1 hover:underline">
                        {r.loadRoute}
                      </Link>
                      {r.rcId != null && (
                        <span className="relative z-10 -my-1 shrink-0">
                          <RateConButton docId={r.rcId} compact />
                        </span>
                      )}
                    </div>
                    {r.delivery && (
                      <div
                        title={`${t(locale, 'tracking.toDeliveryLabel')}${r.delivery.miles.toLocaleString('en-US')} mi · ~${r.driveTimeText}`}
                        className="mt-1 flex items-center gap-2"
                      >
                        {r.progress != null && <TripBar progress={r.progress} />}
                        <span className="nums shrink-0 text-xs text-t3">{r.delivery.miles.toLocaleString('en-US')} mi</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {m?.idle != null && (
                      <div
                        title={`${t(locale, 'trucks.heatmap.freeDays').replace('{n}', String(m.idle))} — ${t(locale, 'trucks.heatmap.freeDaysHint')}`}
                        className="flex items-center gap-2"
                      >
                        <IdleCells days={m.idle} />
                        <span className={`nums shrink-0 text-xs font-semibold ${m.idle >= 5 ? 'text-bad-400' : 'text-warn-400'}`}>
                          {t(locale, 'trucks.list.days').replace('{n}', String(m.idle))}
                        </span>
                      </div>
                    )}
                    {r.prevLoad ? (
                      <Link
                        href={`/loads/${r.prevLoad.id}`}
                        title={`${t(locale, 'prevLoad.label')}${r.prevLoad.date ? ` · ${usDate(r.prevLoad.date)}` : ''}`}
                        className="relative z-10 mt-0.5 flex min-w-0 items-center gap-1 text-xs text-t3 transition-colors hover:text-t2"
                      >
                        <Undo2 size={11} strokeWidth={2.5} className="shrink-0" aria-label={t(locale, 'prevLoad.label')} />
                        <span className="min-w-0 truncate">{r.prevLoad.route}</span>
                      </Link>
                    ) : (
                      m?.idle == null && <span className="text-t3">{t(locale, 'tracking.noActiveLoad')}</span>
                    )}
                  </>
                )}
              </div>

              {/* Состояние по ELD и топливо. */}
              <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 [grid-area:status] @4xl:justify-start @4xl:self-center">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium ${STATUS_TONE[r.statusTone]}`}>{r.statusText}</span>
                {r.fuel !== null && (
                  // Шкала бака, а не число: «почти пустой» видно издалека. Число — в
                  // подсказке; при 15% и меньше оно остаётся и на экране — пора заправлять.
                  <span title={`${t(locale, 'tracking.fuelTitle')}: ${Math.round(r.fuel)}%`} className={`flex shrink-0 items-center gap-1 ${fuelClass(r.fuel)}`}>
                    <Fuel size={11} strokeWidth={2.5} />
                    <span className="h-1.5 w-10 overflow-hidden rounded-full bg-white/10">
                      <span className={`block h-full rounded-full ${fuelFill(r.fuel)}`} style={{ width: `${Math.max(4, Math.min(100, r.fuel))}%` }} />
                    </span>
                    {r.fuel <= 15 && <span className="nums text-xs font-semibold">{Math.round(r.fuel)}%</span>}
                  </span>
                )}
              </div>

              {/* Неделя: гросс и полоса против лучшего трака парка; Rate per mile — в
                  подсказке и в итоге под списком. Бумаги, которые пора продлить, — значком.
                  На телефоне — строкой внизу карточки, а без денег и бумаг её нет совсем. */}
              <div
                className={`flex min-w-0 items-center justify-between gap-2 [grid-area:week] @4xl:flex-col @4xl:items-end @4xl:justify-center @4xl:gap-1 @4xl:self-center @4xl:text-right ${
                  !m?.week && !m?.docWarn ? '@max-4xl:hidden' : ''
                }`}
              >
                {m && (
                  <span
                    title={m.miles > 0 && m.week > 0 ? `${usd.format(m.week)} · ${usd2.format(m.week / m.miles)}/mi` : undefined}
                    className="flex items-center gap-2 @4xl:flex-col @4xl:items-end @4xl:gap-1"
                  >
                    {m.week > 0 ? (
                      <>
                        <span className="nums text-base leading-none font-bold text-good-400">{usd.format(m.week)}</span>
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                          <span className="block h-full rounded-full bg-good-400" style={{ width: `${Math.max(6, (m.week / weekBest) * 100)}%` }} />
                        </span>
                      </>
                    ) : (
                      <span className="nums text-base leading-none text-t3 @max-4xl:hidden">—</span>
                    )}
                  </span>
                )}
                {m?.docWarn && (
                  <span title={m.docWarn} className="inline-flex items-center gap-1 rounded bg-warn-400/15 px-1.5 py-0.5 text-2xs font-semibold text-warn-400">
                    <FileWarning size={11} strokeWidth={2.5} />
                    {t(locale, 'tracking.docsShort')}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Итог столбца «Неделя» — гросс парка, тот же, что на «Сегодня». Для одной
          строки он её же и повторял бы. */}
      {rows.length > 1 && money && (
        <div className="mt-2 flex items-baseline justify-end gap-2 px-3 text-sm text-t3">
          {t(locale, 'trucks.list.weekTotal')}
          <span className={`nums text-base font-bold ${weekTotal > 0 ? 'text-t1' : 'text-t3'}`}>{weekTotal > 0 ? usd.format(weekTotal) : '—'}</span>
          <Rpm rate={weekTotal} miles={milesTotal} className="text-xs text-t2" />
        </div>
      )}
    </div>
  )
}

/** Полоса рейса: закрашено, сколько гружёного пути позади, на конце — трак. Пустая —
 *  трак ещё едет к пикапу. */
function TripBar({ progress }: { progress: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100)
  return (
    <span className="relative h-1.5 min-w-0 flex-1 rounded-full bg-white/10" aria-hidden>
      <span className="absolute inset-y-0 left-0 rounded-full bg-good-400" style={{ width: `${pct}%` }} />
      <span
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-good-400 bg-ink-900"
        style={{ left: `${pct}%` }}
      />
    </span>
  )
}

/** Клетка на день без груза, до двух недель. */
function IdleCells({ days }: { days: number }) {
  const lit = Math.min(IDLE_DAYS, days)
  return (
    <span className="flex h-2 min-w-0 flex-1 gap-[2px]" aria-hidden>
      {Array.from({ length: IDLE_DAYS }, (_, i) => (
        <span key={i} className={`flex-1 rounded-[1px] ${i < lit ? (days >= 5 ? 'bg-bad-400' : 'bg-warn-400') : 'bg-white/10'}`} />
      ))}
    </span>
  )
}
