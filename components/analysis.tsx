'use client'

import type { Breakdown } from '@/lib/profit'
import { usd, usd2 } from '@/lib/fmt'
import { CostBar, Money } from './ui'
import { Info } from './info'
import { useLocale } from './locale-provider'
import { t } from '@/lib/i18n'

export function Analysis({
  r,
  mpg,
  spotRpm,
}: {
  r: Breakdown
  mpg: number
  /** DAT's market rate. Answers "is this below market?" — the argument for haggling. */
  spotRpm?: number | null
}) {
  const locale = useLocale()
  const good = r.net >= 0
  const vsSpot = spotRpm && spotRpm > 0 ? r.loadedRpm - spotRpm : null

  return (
    <>
      {/* The rate is the headline — everything else is calculated off it. */}
      <div className="nums text-5xl font-bold tracking-tight text-white">
        <Money value={r.gross} />
      </div>

      <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">
        {t(locale, 'analysis.net')}{' '}
        <span className={`nums font-semibold ${good ? 'text-good-400' : 'text-bad-400'}`}>
          {usd.format(r.net)}
        </span>
        {t(locale, 'analysis.marginLine').replace('{pct}', r.marginPercent.toFixed(0))}
        <span className="nums text-white/85">{usd.format(r.breakEvenRate)}</span>
        {t(locale, 'analysis.belowLoss')}
      </p>

      {vsSpot !== null && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">
          {t(locale, 'analysis.datMarket')} <span className="nums text-white/85">{usd2.format(spotRpm!)}</span>/mi
          {vsSpot >= 0 ? t(locale, 'analysis.aboveMarketBy') : t(locale, 'analysis.belowMarketBy')}
          <span className={`nums ${vsSpot >= 0 ? 'text-good-400/80' : 'text-amber-400/90'}`}>
            {usd2.format(Math.abs(vsSpot))}
          </span>
          /mi{vsSpot < 0 ? t(locale, 'analysis.roomToNegotiate') : '.'}
        </p>
      )}

      {/* All the numbers with deductions live here, opened on demand. */}
      <details className="group mt-4">
        <summary className="flex cursor-pointer list-none items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-3 text-center text-[14px] font-semibold text-white/75 transition-colors hover:border-haul-500/40 hover:bg-white/[0.07] hover:text-white">
          <span className="text-haul-400 transition-transform group-open:rotate-90">▸</span>
          {t(locale, 'analysis.clickToSeeExpenses')}
        </summary>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            {
              label: 'All-in RPM',
              node: <Money value={r.allInRpm} format={usd2} />,
              info: t(locale, 'analysis.allInRpmInfo'),
            },
            {
              label: 'Spot rate / mi',
              node:
                spotRpm && spotRpm > 0 ? (
                  <Money value={spotRpm} format={usd2} />
                ) : (
                  <span className="text-white/35">—</span>
                ),
              info: t(locale, 'analysis.spotRateInfo'),
            },
            {
              label: t(locale, 'analysis.netPerDay'),
              node: <Money value={r.netPerDay} />,
              info: t(locale, 'analysis.netPerDayInfo'),
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
              <div className="nums text-lg font-semibold">{s.node}</div>
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/62">
                {s.label}
                <Info text={s.info} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-white/8 pt-3">
          <div className="flex items-baseline justify-between pb-2">
            <span className="text-[13px] text-white/78">{t(locale, 'analysis.gross')}</span>
            <span className="nums text-[13px] font-semibold">{usd.format(r.gross)}</span>
          </div>

          <CostBar
            label={t(locale, 'analysis.fuelLabel')
              .replace('{miles}', String(Math.round(r.totalMiles)))
              .replace('{mpg}', String(mpg))}
            amount={r.fuel}
            gross={r.gross}
            color="bg-amber-400/80"
            hint={t(locale, 'analysis.fuelHint')}
          />
          <CostBar
            label={t(locale, 'analysis.driverLabel')}
            amount={r.driver}
            gross={r.gross}
            color="bg-haul-400/80"
            hint={t(locale, 'analysis.driverHint')}
          />
          <CostBar
            label={t(locale, 'analysis.maintenanceLabel')}
            amount={r.maintenance}
            gross={r.gross}
            color="bg-violet-400/80"
            hint={t(locale, 'analysis.maintenanceHint')}
          />
          <CostBar
            label={t(locale, 'analysis.truckPaymentLabel')}
            amount={r.truckPayment}
            gross={r.gross}
            color="bg-white/40"
            hint={t(locale, 'analysis.truckPaymentHint')}
          />
          <CostBar
            label={t(locale, 'analysis.insuranceLabel')}
            amount={r.insurance}
            gross={r.gross}
            color="bg-white/32"
            hint={t(locale, 'analysis.insuranceHint')}
          />
          <CostBar
            label={t(locale, 'analysis.eldLabel')}
            amount={r.eldPermits}
            gross={r.gross}
            color="bg-white/24"
            hint={t(locale, 'analysis.eldHint')}
          />
          {r.factoring > 0 && (
            <CostBar
              label={t(locale, 'analysis.factoringLabel')}
              amount={r.factoring}
              gross={r.gross}
              color="bg-white/25"
              hint={t(locale, 'analysis.factoringHint')}
            />
          )}
          {r.dispatch > 0 && (
            <CostBar
              label={t(locale, 'analysis.dispatchLabel')}
              amount={r.dispatch}
              gross={r.gross}
              color="bg-white/25"
              hint={t(locale, 'analysis.dispatchHint')}
            />
          )}

          <div className="mt-2 flex items-baseline justify-between border-t border-white/8 pt-2.5">
            <span className="text-[13px] text-white/78">
              {t(locale, 'analysis.netMarginLine').replace('{pct}', r.marginPercent.toFixed(1))}
            </span>
            <span className={`nums text-sm font-bold ${good ? 'text-good-400' : 'text-bad-400'}`}>
              {usd.format(r.net)}
            </span>
          </div>
        </div>
      </details>
    </>
  )
}
