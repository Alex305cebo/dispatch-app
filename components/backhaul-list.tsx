import Link from 'next/link'
import { ArrowRight, PhoneCall } from 'lucide-react'
import { Empty } from '@/components/empty'
import { Info } from '@/components/info'
import { usd, usDate } from '@/lib/fmt'
import { t, type Locale } from '@/lib/i18n'
import type { StateBroker } from '@/lib/state-brokers'

/** «Прошлые грузы в TN — спроси брокера о новых» — на странице груза, пока трак едет
 * на выгрузку или только что освободился. Брокер с телефоном одним нажатием и наши
 * последние грузы с ним в этом штате. */
export function BackhaulList({ state, brokers, locale }: { state: string; brokers: StateBroker[]; locale: Locale }) {
  return (
    <section className="panel mt-4 p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
        {t(locale, 'backhaul.heading').replace('{state}', state)}
        <Info text={t(locale, 'backhaul.info')} />
      </h2>
      {/* Пусто — сказать прямо, почему, и не прятать секцию: иначе её не находят. */}
      {!brokers.length && (
        <Empty
          row
          icon={PhoneCall}
          title={t(locale, 'backhaul.emptyTitle').replace('{state}', state)}
          text={t(locale, 'backhaul.empty')}
          action={{
            href: '/brokers',
            label: t(locale, 'backhaul.allBrokers'),
            icon: <ArrowRight size={14} strokeWidth={2.2} />,
          }}
        />
      )}
      <ul className="flex flex-col divide-y divide-white/[0.06]">
        {brokers.map((b) => (
          <li key={b.key} className="py-1.5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <div className="flex min-w-0 flex-1 basis-[14rem] flex-wrap items-baseline gap-x-2">
                <Link href={`/brokers?q=${encodeURIComponent(b.mc ?? b.name)}`} className="text-[13px] font-medium hover:underline">
                  {b.name}
                </Link>
                {b.mc && <span className="nums text-[11px] text-t3">MC {b.mc}</span>}
                <span className="nums text-[11.5px] text-t3">
                  {t(locale, 'backhaul.count').replace('{state}', state).replace('{n}', String(b.total))}
                  {b.payDays != null && (
                    <span className={b.payDays <= 30 ? ' text-good-400/80' : ' text-warn-400'}>
                      {' · '}
                      {t(locale, 'brokers.paysIn').replace('{n}', String(b.payDays))}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex shrink-0 gap-1">
                {b.phone && (
                  <a href={`tel:${b.phone}`} className="rounded-md bg-haul-500/15 px-2 py-0.5 text-[12px] font-semibold text-haul-300 hover:bg-haul-500/25 max-md:py-1.5">
                    📞 {b.phone}
                  </a>
                )}
                {b.email && (
                  <a href={`mailto:${b.email}`} className="rounded-md border border-white/12 px-2 py-0.5 text-[12px] font-medium text-t2 hover:border-white/30 max-md:py-1.5">
                    ✉
                  </a>
                )}
              </div>
            </div>
            <ul className="mt-0.5 flex flex-col">
              {b.loads.map((l) => (
                <li key={l.id}>
                  <Link href={`/loads/${l.id}`} className="block rounded px-1 text-[11.5px] leading-[18px] text-t3 hover:bg-white/5 hover:text-t1">
                    <span className="nums">{usDate(l.day)}</span> · {l.route} · <span className="nums">{usd.format(l.rate)}</span>
                    <span className="text-t3">
                      {' · '}
                      {[l.pickup && t(locale, 'backhaul.rolePickup'), l.delivery && t(locale, 'backhaul.roleDelivery')].filter(Boolean).join(' + ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  )
}
