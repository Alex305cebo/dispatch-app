'use client'

// Точки рейса в шапке груза: где, когда и под какими номерами.
//
// Всё это груз уже знает — рейт-кон принёс название склада, улицу, окно и номера
// PU/PO (lib/stops.ts, колонка loads.stops). Но в шапке стояли только два города,
// а адреса и номера лежали внизу, в форме «Подробности», и в тексте водителю.
// Диспетчер, которому звонит склад и спрашивает номер пикапа, искал его по всей
// странице. Теперь он в шапке, и номер копируется одним нажатием.

import { Clock, Copy, MapPin, Navigation } from 'lucide-react'
import { stopTitle, type LoadStop } from '@/lib/stops'
import { whenText } from '@/lib/loads-dashboard'
import { notify } from '@/lib/notify'
import { t, type Locale } from '@/lib/i18n'

async function copy(text: string, locale: Locale) {
  try {
    await navigator.clipboard.writeText(text)
    notify('ok', t(locale, 'loadCard.copied'))
  } catch {
    notify('warn', t(locale, 'loadCard.copyFailed'))
  }
}

export function LoadStops({ stops, locale, className = '' }: { stops: LoadStop[]; locale: Locale; className?: string }) {
  // Груз, заведённый руками двумя городами, здесь молчит: города уже стоят
  // заголовком, и блок повторил бы их пустыми рамками. Появилось хоть у одной точки
  // что-то сверх города — показываем ВСЕ точки, чтобы рейс читался по порядку.
  const worth = stops.some((s) => s.name || s.address || s.date || s.time || s.refs.length > 0)
  if (!worth) return null

  return (
    <section className={className}>
      <h3 className="mb-1.5 text-[13px] font-semibold text-white/80">{t(locale, 'loadStops.title')}</h3>
      <div className={`grid gap-2 ${stops.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {stops.map((s) => (
          <Stop key={s.seq} stop={s} stops={stops} locale={locale} />
        ))}
      </div>
    </section>
  )
}

function Stop({ stop, stops, locale }: { stop: LoadStop; stops: LoadStop[]; locale: Locale }) {
  const full = [stop.address, stop.city].filter(Boolean).join(', ')
  // В навигатор — вместе с названием склада: по «510 W Frontier Lane» Google находит
  // улицу, по «Kellogg's, 510 W Frontier Lane» — нужные ворота.
  const nav = full
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([stop.name, full].filter(Boolean).join(', '))}`
    : null
  // Без даты и окна строку не рисуем совсем: «Дата не указана · Время не указано»
  // жирным вверху карточки — самая заметная строка ни о чём.
  const when = stop.date || stop.time ? whenText(stop.date, stop.time, '', t(locale, 'loads.dash.noTime')) : null

  return (
    <div className="panel-inset min-w-0 p-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide ${
            stop.role === 'pickup' ? 'bg-haul-500/15 text-haul-300' : 'bg-good-500/15 text-good-400'
          }`}
        >
          <MapPin size={12} strokeWidth={2.4} />
          {stopTitle(stop, stops, locale)}
        </span>
        {nav && (
          <a
            href={nav}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-[12px] text-haul-400 hover:underline"
          >
            <Navigation size={12} strokeWidth={2.4} />
            {t(locale, 'loadCard.navigate')}
          </a>
        )}
      </div>
      {when && (
        <div className="nums mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-white/85">
          <Clock size={13} strokeWidth={2.2} className="shrink-0 text-white/45" />
          {when}
        </div>
      )}
      {stop.name && <div className="mt-2 text-[14px] leading-snug font-semibold break-words text-white/90">{stop.name}</div>}
      {stop.address && <div className="text-[13px] break-words text-white/70">{stop.address}</div>}
      {stop.city && <div className="text-[13px] break-words text-white/70">{stop.city}</div>}
      {stop.refs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {stop.refs.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => copy(r, locale)}
              className="nums inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-[12px] font-semibold text-white/85 hover:border-haul-500/40"
            >
              {r}
              <Copy size={11} strokeWidth={2.2} className="text-white/45" />
            </button>
          ))}
        </div>
      )}
      {stop.directions && (
        <p className="mt-2 text-[12px] leading-relaxed break-words text-white/60">
          <span className="text-white/45">{t(locale, 'loadEdit.directions')}: </span>
          {stop.directions}
        </p>
      )}
    </div>
  )
}
