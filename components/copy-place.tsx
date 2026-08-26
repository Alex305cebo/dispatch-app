'use client'

// Место водителя: скопировать одним нажатием или сразу открыть на карте.
//
// Вопрос «где сейчас трак» задают десятки раз в день, и ответ каждый раз уходит
// брокеру или в карту. Раньше место было простым текстом: выделяли мышью по букве,
// а на телефоне не выделяли вовсе.
//
// Кнопки ПОДПИСАНЫ словами, а не значками. Значок копирования знают не все, значок
// булавки читается как «просто иконка места», и обе прошлые версии — сначала
// блёклая иконка, потом плашка без подписи — пользователь не нашёл. Слово находят
// сразу, и лишние пятьдесят пикселей этого стоят.
//
// Что именно кладётся в буфер — не мелочь. Название города Google Maps понимает
// приблизительно: «Tonopah, NV» показывает центр городка, а трак стоит в двадцати
// милях от него на трассе. Поэтому при известных координатах копируются ОНИ —
// «38.64396, -115.63199» вставляется в поиск карт и даёт точку ровно там, где трак.

import { Copy, MapPin } from 'lucide-react'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

/** Ссылка на точку в Google Maps. Формат официальный и работает и в приложении,
 * и в браузере, и на телефоне. */
export function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

export function CopyPlace({
  text,
  copy,
  coords,
  className = '',
  size = 'md',
}: {
  /** Что показать. */
  text: string
  /** Что положить в буфер, если координат нет и текст на экране не годится. */
  copy?: string
  /** Координаты последнего GPS-фикса. Если есть — копируются они. */
  coords?: { lat: number | null | undefined; lng: number | null | undefined } | null
  className?: string
  /** 'sm' — внутри плотных строк списка, 'md' — в карточках и шапках. */
  size?: 'sm' | 'md'
}) {
  const locale = useLocale()
  const lat = coords?.lat
  const lng = coords?.lng
  const hasPoint = typeof lat === 'number' && typeof lng === 'number'
  // Пять знаков после точки — это метр с небольшим. Больше не нужно, а длинный
  // хвост цифр в чате брокера выглядит мусором.
  const value = hasPoint ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : (copy ?? text)

  async function run(e: React.MouseEvent) {
    // Место часто лежит внутри строки-ссылки: без этого щелчок по кнопке уводил бы
    // на страницу трака вместо копирования.
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      notify('ok', `${t(locale, 'tracking.addressCopiedPrefix')}${value}`)
    } catch {
      // Браузер может запретить буфер (нет https, отказ в разрешении) — тогда
      // говорим об этом, а не молчим с видом, будто скопировали.
      notify('warn', t(locale, 'tracking.clipboardDenied'))
    }
  }

  const btn =
    size === 'sm'
      ? 'gap-1 px-1.5 py-0.5 text-[11px]'
      : 'gap-1.5 px-2 py-1 text-[12px]'
  const icon = size === 'sm' ? 11 : 13
  const skin =
    'relative z-10 inline-flex shrink-0 items-center rounded-lg border border-haul-500/35 bg-haul-500/15 font-medium text-haul-300 transition-colors hover:border-haul-400 hover:bg-haul-500/30 hover:text-white'

  return (
    <span className={`inline-flex min-w-0 flex-wrap items-center gap-1.5 ${className}`}>
      <span className="min-w-0 truncate">{text}</span>
      <button type="button" onClick={run} title={t(locale, hasPoint ? 'tracking.copyCoordsTitle' : 'tracking.copyLocationTitle')} className={`${skin} ${btn}`}>
        <Copy size={icon} />
        {t(locale, 'tracking.copyBtn')}
      </button>
      {/* Открыть карту — то, ради чего адрес чаще всего и копировали. Одно нажатие
          вместо «скопировал, открыл карты, вставил». */}
      {hasPoint && (
        <a
          href={mapsUrl(lat, lng)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={t(locale, 'tracking.openMapsTitle')}
          className={`${skin} ${btn}`}
        >
          <MapPin size={icon} />
          {t(locale, 'tracking.mapBtn')}
        </a>
      )}
    </span>
  )
}
