import Link from 'next/link'
import { ArrowRight, PhoneCall } from 'lucide-react'
import { Empty } from '@/components/empty'
import { Info } from '@/components/info'
import { usd, usd2 } from '@/lib/fmt'
import { t, type Locale } from '@/lib/i18n'
import type { BackhaulBroker } from '@/lib/backhaul'

/** «Обратный груз из TX: кому звонить» — на странице груза, пока трак едет на
 * выгрузку. Свои брокеры, что уже давали грузы из этого штата: телефон одним
 * нажатием, средняя ставка и как платят. */
export function BackhaulList({ state, brokers, locale }: { state: string; brokers: BackhaulBroker[]; locale: Locale }) {
  return (
    <section className="panel mt-4 p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
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
      <ul className="flex flex-col gap-1.5">
        {brokers.map((b) => (
          <li key={b.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-white/8 px-3 py-2">
            <div className="min-w-0 flex-1 basis-[12rem]">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <Link href={`/brokers?q=${encodeURIComponent(b.mc ?? b.name)}`} className="truncate text-[13.5px] font-medium hover:underline">
                  {b.name}
                </Link>
                {b.mc && <span className="nums text-[11px] text-white/45">MC {b.mc}</span>}
              </div>
              <div className="nums mt-0.5 text-[12px] text-white/60">
                {t(locale, 'backhaul.stats')
                  .replace('{n}', String(b.loads))
                  .replace('{rate}', usd.format(b.avgRate))
                  .replace('{rpm}', usd2.format(b.rpm))}
                {b.payDays != null && (
                  <span className={b.payDays <= 30 ? ' text-good-400/80' : ' text-warn-400'}>
                    {' · '}
                    {t(locale, 'brokers.paysIn').replace('{n}', String(b.payDays))}
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11.5px] text-white/40">
                {t(locale, 'backhaul.last')} {b.lastDate} · {b.lastRoute}
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {b.phone && (
                <a href={`tel:${b.phone}`} className="rounded-lg bg-haul-500/15 px-3 py-1.5 text-[12.5px] font-semibold text-haul-300 hover:bg-haul-500/25">
                  📞 {b.phone}
                </a>
              )}
              {b.email && (
                <a href={`mailto:${b.email}`} className="rounded-lg border border-white/12 px-3 py-1.5 text-[12.5px] font-medium text-white/75 hover:border-white/30">
                  ✉
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
