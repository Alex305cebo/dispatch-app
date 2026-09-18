'use client'

import { useEffect, useState } from 'react'
import type { TruckRecord } from '@/lib/map'
import type { TruckMeta } from '@/lib/maintenance-core'
import { parseLoadHash, type QrLoad } from '@/lib/qr-load'
import { stopsFromQr } from '@/lib/stops'
import { LoadForm } from '@/components/load-form'
import { LoadStops } from '@/components/load-stops'
import { Chip } from '@/components/chip'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function QrClient({ trucks, metaByTruck }: { trucks: TruckRecord[]; metaByTruck: Record<number, TruckMeta> }) {
  const locale = useLocale()
  // The hash never reaches the server — by design, and also by HTTP. So the load
  // only exists after hydration.
  const [load, setLoad] = useState<QrLoad | null>(null)

  useEffect(() => {
    setLoad(parseLoadHash(window.location.hash))
  }, [])

  if (!load) {
    return <div className="panel h-64 animate-pulse p-5" />
  }

  const empty = !load.rate && !load.loadedMiles && !load.origin
  if (empty) {
    return (
      <div className="panel p-5">
        <h2 className="text-[15px] font-semibold">{t(locale, 'loadQr.emptyTitle')}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-white/70">{t(locale, 'loadQr.emptyText')}</p>
      </div>
    )
  }

  // A load board can't know these: deadhead depends on where the truck is, transit
  // days on the dispatch plan. Ring them so a default is never mistaken for a fact.
  const needsAttention = [
    ...(load.rate === 0 ? ['rate'] : []),
    ...(load.loadedMiles === 0 ? ['loadedMiles'] : []),
    ...(load.deadheadMiles === 0 ? ['deadheadMiles'] : []),
    ...(load.transitDays === 1 ? ['transitDays'] : []),
  ]

  // Груз с доски знает только направление и деньги; груз из рейт-кона приносит с
  // собой склады, окна, номера PU/PO и что везём. Раньше всё это оставалось в
  // ссылке: форма показывала шесть цифр, а склад, окно и номер пикапа диспетчер
  // читал в Telegram и держал в голове. Теперь ссылка разложена в шапку целиком.
  const stops = stopsFromQr(load)
  const facts: { label: string; value: string }[] = [
    ...(load.referenceId ? [{ label: t(locale, 'import.label.referenceId'), value: load.referenceId }] : []),
    ...(load.brokerName ? [{ label: t(locale, 'import.label.brokerName'), value: load.brokerName }] : []),
    ...(load.commodity ? [{ label: t(locale, 'import.label.commodity'), value: load.commodity }] : []),
    ...(load.weight ? [{ label: t(locale, 'import.label.weight'), value: load.weight }] : []),
    ...(load.equipment ? [{ label: t(locale, 'loadStops.equipment'), value: load.equipment }] : []),
  ]

  return (
    <>
      <p className="mb-4 rounded-xl border border-haul-500/25 bg-haul-500/8 px-4 py-2.5 text-[13px] text-haul-400">
        {t(locale, 'loadQr.bannerText')}
      </p>
      {facts.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {facts.map((f) => (
            <Chip key={f.label} label={f.label} value={f.value} />
          ))}
        </div>
      )}
      <LoadStops stops={stops} locale={locale} className="mb-4" />
      {/* Особые указания брокера читают ДО того, как груз взят: в них и «ремни свои»,
          и штраф за опоздание. На сохранённом грузе для этого есть свой блок. */}
      {load.brokerNotes && (
        <div className="panel mb-4 p-4">
          <h2 className="mb-2 text-[15px] font-semibold text-white/90">{t(locale, 'brokerNotes.heading')}</h2>
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-white/80">{load.brokerNotes}</p>
        </div>
      )}
      <LoadForm trucks={trucks} metaByTruck={metaByTruck} initial={load} source="qr" needsAttention={needsAttention} />
    </>
  )
}
