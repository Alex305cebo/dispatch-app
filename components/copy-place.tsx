'use client'

// Место водителя: скопировать одним нажатием или сразу открыть на карте.
//
// Вопрос «где сейчас трак» задают десятки раз в день, и ответ каждый раз уходит
// брокеру или в карту. Раньше место было простым текстом: выделяли мышью по букве,
// а на телефоне не выделяли вовсе.
//
// Что именно кладётся в буфер — не мелочь. Название города Google Maps понимает
// приблизительно: «Tonopah, NV» показывает центр городка, а трак стоит в двадцати
// милях от него на трассе. Поэтому при известных координатах копируются ОНИ —
// «38.6440, -115.6320» вставляется в поиск карт и даёт точку ровно там, где трак.
// Города хватает для разговора с брокером, координат — для карты, и потому рядом
// стоит вторая кнопка, которая карту просто открывает.

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

  const pad = size === 'sm' ? 'gap-1 px-1.5 py-0.5' : 'gap-1.5 px-2 py-1'
  const icon = size === 'sm' ? 11 : 12

  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={run}
        title={t(locale, hasPoint ? 'tracking.copyCoordsTitle' : 'tracking.copyLocationTitle')}
        className={`group relative z-10 inline-flex min-w-0 items-center rounded-lg border border-white/12 bg-white/[0.04] text-left transition-colors hover:border-haul-500/50 hover:bg-haul-500/10 ${pad}`}
      >
        <span className="min-w-0 truncate">{text}</span>
        <Copy size={icon} className="shrink-0 text-haul-300/70 transition-colors group-hover:text-haul-300" />
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
          className="relative z-10 inline-flex shrink-0 items-center rounded-lg border border-white/12 bg-white/[0.04] p-1 text-haul-300/70 transition-colors hover:border-haul-500/50 hover:bg-haul-500/10 hover:text-haul-300"
        >
          <MapPin size={icon} />
        </a>
      )}
    </span>
  )
}
