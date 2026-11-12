'use client'

// «Точки рейса» — где, когда и под какими номерами. Один блок на странице груза
// (/loads/[id], /load из ссылки) и у водителя (/d/<токен>).
//
// Всё это груз уже знает — рейт-кон принёс название склада, улицу, окно и номера
// PU/PO (lib/stops.ts, колонка loads.stops). Вид — по образцу владельца (11/12/26):
// две карточки «Погрузка» и «Доставка» рядом, между ними стрелка с милями и временем
// в пути; в карточке метка, «Навигация», окно, склад, улица, город и плашка с номером,
// который копируется одним нажатием (склад звонит и спрашивает номер пикапа).
//
// Раскладка считается от ширины самого блока (@container), а не экрана: у водителя
// страница узкая и на компьютере, там карточки всегда друг под другом.
// Ставки здесь нет и быть не должно — блок стоит и на странице водителя.

import { useState } from 'react'
import { ArrowRight, Check, Clock, Copy, MapPin, Navigation } from 'lucide-react'
import { addressLines, refLabel, stopsLabel, type LoadStop } from '@/lib/stops'
import { whenText } from '@/lib/loads-dashboard'
import { TRUCK_MPH } from '@/lib/load-card-core'
import { driveTime, usDatesIn } from '@/lib/fmt'
import { notify } from '@/lib/notify'
import { t, type Locale } from '@/lib/i18n'

/** Состояние точки у водителя: пройдена, следующая, чья (партиалы). */
export type StopMark = { done?: boolean; next?: boolean; tag?: string | null }

const mapsHref = (stop: LoadStop) => {
  const full = [stop.address, stop.city].filter(Boolean).join(', ')
  // В навигатор — вместе с названием склада: по «510 W Frontier Lane» Google находит
  // улицу, по «Kellogg's, 510 W Frontier Lane» — нужные ворота.
  return full
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([stop.name, full].filter(Boolean).join(', '))}`
    : null
}

/** «252 mi · 4ч 35м» — время за рулём по средней скорости фуры (как в «Успевает ли»). */
function legText(miles: number | null | undefined, locale: Locale): { mi: string; time: string } | null {
  if (!miles || !Number.isFinite(miles) || miles <= 0) return null
  return {
    mi: `${Math.round(miles).toLocaleString('en-US')} mi`,
    time: driveTime(Math.round((miles / TRUCK_MPH) * 60), locale),
  }
}

export function LoadStops({
  stops,
  locale,
  partial = false,
  miles,
  marks,
  directionsNote,
  always = false,
  framed = false,
  className = '',
}: {
  stops: LoadStop[]
  locale: Locale
  /** Партиал — подписью у заголовка. */
  partial?: boolean
  /** Гружёные мили рейса — на стрелке между погрузкой и доставкой. */
  miles?: number | null
  /** Для водителя: какая точка пройдена и какая следующая (по индексу в stops). */
  marks?: StopMark[]
  /** Строка под «Как заехать» (водителю: «навигатор сюда ведёт не туда»). */
  directionsNote?: string
  /** Показывать даже груз, где кроме городов ничего нет (у водителя это весь рейс). */
  always?: boolean
  /** Отдельной карточкой (panel). Без рамки — внутри чужой карточки: шапки груза, рейса водителя. */
  framed?: boolean
  className?: string
}) {
  // Груз, заведённый руками двумя городами, на странице груза молчит: города уже стоят
  // заголовком, и блок повторил бы их пустыми рамками.
  const worth = always || stops.some((s) => s.name || s.address || s.date || s.time || s.refs.length > 0)
  if (!worth || stops.length === 0) return null
  const leg = legText(miles, locale)
  const two = stops.length === 2
  const tags = [partial && t(locale, 'loadEdit.partial'), stops.length > 2 && stopsLabel(stops, locale), !two && leg && `${leg.mi} · ${leg.time}`].filter(
    (x): x is string => !!x,
  )
  const card = (s: LoadStop, i: number) => (
    <Stop key={`${i}-${s.seq}`} stop={s} stops={stops} locale={locale} mark={marks?.[i]} directionsNote={directionsNote} />
  )

  return (
    <section className={`@container min-w-0 ${framed ? 'panel p-4 sm:p-5' : ''} ${className}`}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-base leading-6 font-semibold text-t1">{t(locale, 'loadCard.stops')}</h3>
        {tags.length > 0 && <span className="text-xs font-medium text-t3">{tags.join(' · ')}</span>}
      </div>
      {two ? (
        <div className="grid items-stretch gap-2 @xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @xl:gap-3">
          {card(stops[0]!, 0)}
          <div className="flex items-center justify-center gap-2 text-sm text-t2 @xl:flex-col @xl:gap-1 @xl:px-1">
            <ArrowRight size={16} strokeWidth={2.2} className="rotate-90 text-t3 @xl:rotate-0" aria-hidden />
            {leg && (
              <>
                <span className="nums font-medium whitespace-nowrap">{leg.mi}</span>
                <span className="nums whitespace-nowrap text-t3">{leg.time}</span>
              </>
            )}
          </div>
          {card(stops[1]!, 1)}
        </div>
      ) : (
        <div className="grid gap-2 @2xl:grid-cols-2 @5xl:grid-cols-3">{stops.map(card)}</div>
      )}
    </section>
  )
}

function Stop({
  stop,
  stops,
  locale,
  mark,
  directionsNote,
}: {
  stop: LoadStop
  stops: LoadStop[]
  locale: Locale
  mark?: StopMark
  directionsNote?: string
}) {
  const nav = mapsHref(stop)
  // Окно с датой внутри («11/12/2026 @ 18:00» из ссылки бота) — как напечатано, только
  // дата в MM/DD/YY; без даты — дата груза и окно.
  const slot = stop.time?.trim()
  const when =
    slot && /\d{1,2}\/\d{1,2}/.test(slot)
      ? usDatesIn(slot)
      : stop.date || slot
        ? whenText(stop.date, stop.time, '', t(locale, 'loads.dash.noTime'))
        : null
  const { street, place } = addressLines(stop)
  const pickup = stop.role === 'pickup'
  // «Погрузка 2» — номер только если таких точек несколько.
  const same = stops.filter((s) => s.role === stop.role)
  const title = `${t(locale, pickup ? 'stops.pickupStep' : 'stops.deliveryStep')}${same.length > 1 ? ` ${same.indexOf(stop) + 1}` : ''}`
  const done = !!mark?.done

  return (
    <div
      className={`panel-inset min-w-0 p-3 @lg:p-3.5 ${
        mark?.next ? 'ring-1 ring-haul-400/60' : done ? 'opacity-55' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ${
            pickup ? 'bg-haul-500/15 text-haul-300' : 'bg-good-500/15 text-good-400'
          }`}
        >
          {done ? <Check size={12} strokeWidth={2.6} /> : <MapPin size={12} strokeWidth={2.4} />}
          {title}
        </span>
        {mark?.next && (
          <span className="rounded bg-haul-500/25 px-1.5 py-0.5 text-2xs font-semibold text-haul-300">{t(locale, 'driver.next')}</span>
        )}
        {mark?.tag && <span className="min-w-0 truncate text-xs text-t3">{mark.tag}</span>}
        {nav && !done && (
          <a
            href={nav}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-sm font-semibold text-haul-400 transition-colors hover:bg-white/8"
          >
            <Navigation size={14} strokeWidth={2.4} />
            {t(locale, 'loadCard.navigate')}
          </a>
        )}
      </div>
      {when && (
        <p className="nums mt-2 flex items-center gap-1.5 text-base font-semibold text-t1">
          <Clock size={15} strokeWidth={2.2} className="shrink-0 text-t3" />
          <span className="min-w-0 break-words">{when}</span>
        </p>
      )}
      {/* Как заехать — до адреса: навигатор к таким складам ведёт не туда, а прочитать
          это нужно до того, как тронулся. */}
      {stop.directions && !done && (
        <div className="mt-2 rounded-lg border border-warn-400/40 bg-warn-500/10 px-2.5 py-1.5 text-sm leading-snug break-words text-t1">
          <span className="font-semibold text-warn-400">⚠ {t(locale, 'loadEdit.directions')}: </span>
          {stop.directions}
          {directionsNote && <span className="mt-0.5 block font-semibold text-warn-400">{directionsNote}</span>}
        </div>
      )}
      {stop.name && <p className="mt-2 text-md leading-snug font-semibold break-words text-t1">{stop.name}</p>}
      {(street || place) && (
        <p className={`${stop.name ? 'mt-0.5' : 'mt-2'} text-base leading-snug break-words text-t2`}>
          {street && <span className="block">{street}</span>}
          {place && <span className="block">{place}</span>}
        </p>
      )}
      {stop.refs.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {stop.refs.map((r) => (
            <RefChip key={r} text={refLabel(r, stop.role)} value={r} locale={locale} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Плашка «Pickup Number: 3403345588» — нажал, номер (без подписи) в буфере. */
function RefChip({ text, value, locale }: { text: string; value: string; locale: Locale }) {
  const [ok, setOk] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setOk(true)
      setTimeout(() => setOk(false), 1500)
      notify('ok', t(locale, 'loadCard.copied'))
    } catch {
      notify('warn', t(locale, 'loadCard.copyFailed'))
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={t(locale, 'loadCard.copied')}
      className="nums inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-left text-sm font-semibold break-words text-t1 transition-colors hover:border-haul-500/40"
    >
      <span className="min-w-0">{text}</span>
      {ok ? (
        <Check size={14} strokeWidth={2.4} className="shrink-0 text-good-400" />
      ) : (
        <Copy size={14} strokeWidth={2.2} className="shrink-0 text-t3" />
      )}
    </button>
  )
}
