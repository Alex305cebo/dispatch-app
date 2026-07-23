'use client'

import { useEffect, useState } from 'react'
import type { TruckRecord } from '@/lib/map'
import { parseLoadHash, type QrLoad } from '@/lib/qr-load'
import { LoadForm } from '@/components/load-form'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function QrClient({ trucks }: { trucks: TruckRecord[] }) {
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

  return (
    <>
      <p className="mb-4 rounded-xl border border-haul-500/25 bg-haul-500/8 px-4 py-2.5 text-[13px] text-haul-400">
        {t(locale, 'loadQr.bannerText')}
      </p>
      <LoadForm trucks={trucks} initial={load} source="qr" needsAttention={needsAttention} />
    </>
  )
}
