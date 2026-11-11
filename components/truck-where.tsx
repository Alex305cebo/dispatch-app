'use client'

// «Где сейчас» в шапке трака (11/10/26). Владелец: «диспетчер очень часто копирует
// адрес расположения трака — должно быть очень понятно, как это сделать».
//
// Раньше были две кнопки «Копировать» и «Карта» под текстом места, и непонятно было,
// ЧТО копируется (копировались координаты). Теперь сам адрес — большая кнопка:
// «Mountain View Acres, CA 92392» с подписью «Копировать адрес», нажатие кладёт в
// буфер ровно то, что написано (город, штат, индекс — так брокеру и пишут), и на
// месте подписи появляется «✓ Скопировано». Координаты и карта — второй строкой,
// тоже подписаны словами.

import { useState } from 'react'
import { Check, Copy, Crosshair, MapPin, ExternalLink } from 'lucide-react'
import { notify } from '@/lib/notify'
import { mapsUrl } from '@/components/copy-place'
import { t, type Locale } from '@/lib/i18n'

export function TruckWhere({
  place,
  raw,
  lat,
  lng,
  time,
  locale,
}: {
  /** Город, штат и индекс — то, что копируется. */
  place: string
  /** Как место пришло из ELD («2.5mi W from Victorville, CA») — мелко, если отличается. */
  raw: string | null
  lat: number | null | undefined
  lng: number | null | undefined
  /** Время у водителя (серверный LocalTime). */
  time?: React.ReactNode
  locale: Locale
}) {
  const [copied, setCopied] = useState<'addr' | 'coords' | null>(null)
  const hasPoint = typeof lat === 'number' && typeof lng === 'number'
  const coords = hasPoint ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : null

  async function copy(value: string, what: 'addr' | 'coords') {
    try {
      await writeClipboard(value)
      setCopied(what)
      notify('ok', `${t(locale, 'tracking.addressCopiedPrefix')}${value}`)
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000)
    } catch {
      notify('warn', t(locale, 'tracking.clipboardDenied'))
    }
  }

  const small =
    'inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 text-sm font-medium text-t2 transition-colors hover:border-white/30 hover:text-t1 max-md:h-10 [&>svg]:text-haul-300'

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium leading-4 text-t3">{t(locale, 'where.title')}</span>
        {time && <span className="text-sm text-t2">{time}</span>}
      </div>

      <button
        type="button"
        onClick={() => copy(place, 'addr')}
        title={t(locale, 'where.copyAddress')}
        className={`group mt-2 flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
          copied === 'addr'
            ? 'border-good-400/70 bg-good-500/10'
            : 'border-haul-400/40 bg-haul-500/[0.06] hover:border-haul-400 hover:bg-haul-500/[0.12]'
        }`}
      >
        <MapPin size={20} className="shrink-0 text-haul-300" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-lg font-semibold leading-6 text-t1">{place}</span>
          {raw && raw !== place && <span className="mt-0.5 block truncate text-sm text-t3">{raw}</span>}
        </span>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold ${
            copied === 'addr' ? 'bg-good-500/20 text-good-400' : 'bg-haul-500 text-white group-hover:bg-haul-600'
          }`}
        >
          {copied === 'addr' ? <Check size={15} strokeWidth={2.6} /> : <Copy size={15} strokeWidth={2.4} />}
          <span className="max-[380px]:hidden">{t(locale, copied === 'addr' ? 'where.copied' : 'where.copyAddress')}</span>
        </span>
      </button>

      {coords && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => copy(coords, 'coords')} title={t(locale, 'where.copyCoords')} className={small}>
            {copied === 'coords' ? <Check size={14} /> : <Crosshair size={14} />}
            <span className="nums">{copied === 'coords' ? t(locale, 'where.copied') : coords}</span>
          </button>
          <a href={mapsUrl(lat!, lng!)} target="_blank" rel="noopener noreferrer" className={small}>
            <ExternalLink size={14} />
            {t(locale, 'where.openMap')}
          </a>
        </div>
      )}
    </div>
  )
}

/** Буфер обмена: обычный путь, а где браузер его не даёт (страница не https, старый
 * Safari) — через скрытое поле и execCommand. Иначе на телефоне кнопка молчала бы. */
async function writeClipboard(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {
    const ta = document.createElement('textarea')
    ta.value = value
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    if (!ok) throw new Error('clipboard denied')
  }
}
