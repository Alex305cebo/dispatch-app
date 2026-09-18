'use client'

// Точки рейса в шапке груза: где, когда и под какими номерами.
//
// Всё это груз уже знает — рейт-кон принёс название склада, улицу, окно и номера
// PU/PO (lib/stops.ts, колонка loads.stops). Но в шапке стояли только два города,
// а адреса и номера лежали внизу, в форме «Подробности», и в тексте водителю.
// Диспетчер, которому звонит склад и спрашивает номер пикапа, искал его по всей
// странице. Теперь он в шапке, и номер копируется одним нажатием.
//
// Плотно: на телефоне шапка — это первый экран, и каждая лишняя строка уводит
// ставку и кнопки вниз. Поэтому метка точки и окно стоят в одной строке, а город
// не повторяется, если он уже есть в адресе («…, LAREDO, TX 78045» + «LAREDO, TX»
// — одна и та же строчка дважды).

import { Copy, Navigation } from 'lucide-react'
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

/** Город отдельной строкой — только если адрес его ещё не назвал. */
function extraCity(stop: LoadStop): string | null {
  if (!stop.city) return null
  if (!stop.address) return stop.city
  const town = stop.city.split(',')[0]?.trim().toLowerCase()
  return town && stop.address.toLowerCase().includes(town) ? null : stop.city
}

export function LoadStops({ stops, locale, className = '' }: { stops: LoadStop[]; locale: Locale; className?: string }) {
  // Груз, заведённый руками двумя городами, здесь молчит: города уже стоят
  // заголовком, и блок повторил бы их пустыми рамками. Появилось хоть у одной точки
  // что-то сверх города — показываем ВСЕ точки, чтобы рейс читался по порядку.
  const worth = stops.some((s) => s.name || s.address || s.date || s.time || s.refs.length > 0)
  if (!worth) return null

  return (
    <div className={`grid gap-2 ${stops.length > 1 ? 'sm:grid-cols-2' : ''} ${className}`}>
      {stops.map((s) => (
        <Stop key={s.seq} stop={s} stops={stops} locale={locale} />
      ))}
    </div>
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
  const city = extraCity(stop)

  return (
    <div className="panel-inset min-w-0 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-2xs font-semibold tracking-wide uppercase ${
            stop.role === 'pickup' ? 'bg-haul-500/15 text-haul-300' : 'bg-good-500/15 text-good-400'
          }`}
        >
          {stopTitle(stop, stops, locale)}
        </span>
        {when && <span className="nums min-w-0 text-[13px] font-semibold text-white/85">{when}</span>}
        {nav && (
          <a
            href={nav}
            target="_blank"
            rel="noreferrer"
            title={t(locale, 'loadCard.navigate')}
            aria-label={t(locale, 'loadCard.navigate')}
            className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-md text-haul-400 transition-colors hover:bg-white/8"
          >
            <Navigation size={14} strokeWidth={2.4} />
          </a>
        )}
      </div>
      {/* Склад и адрес — одной строкой: две отдельные строки в карточке множились на
          число точек, а на широком экране места в строке вдоволь. */}
      {(stop.name || stop.address || city) && (
        <p className="mt-1 text-[12.5px] leading-snug break-words text-white/65">
          {stop.name && <span className="text-[13px] font-semibold text-white/90">{stop.name}</span>}
          {stop.name && (stop.address || city) && <span className="text-white/25"> · </span>}
          {[stop.address, city].filter(Boolean).join(', ')}
        </p>
      )}
      {stop.refs.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {stop.refs.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => copy(r, locale)}
              className="nums inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[11.5px] font-semibold text-white/85 hover:border-haul-500/40"
            >
              {r}
              <Copy size={10} strokeWidth={2.2} className="text-white/45" />
            </button>
          ))}
        </div>
      )}
      {stop.directions && (
        <p className="mt-1.5 text-[11.5px] leading-snug break-words text-white/55">
          <span className="text-white/40">{t(locale, 'loadEdit.directions')}: </span>
          {stop.directions}
        </p>
      )}
    </div>
  )
}
