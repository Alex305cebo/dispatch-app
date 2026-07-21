'use client'

import type { Breakdown } from '@/lib/profit'
import { usd, usd2 } from '@/lib/fmt'
import { CostBar, Money } from './ui'
import { Info } from './info'

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
  const good = r.net >= 0
  const vsSpot = spotRpm && spotRpm > 0 ? r.loadedRpm - spotRpm : null

  return (
    <>
      {/* The rate is the headline — everything else is calculated off it. */}
      <div className="nums text-5xl font-bold tracking-tight text-white">
        <Money value={r.gross} />
      </div>

      <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">
        Чистыми{' '}
        <span className={`nums font-semibold ${good ? 'text-good-400' : 'text-bad-400'}`}>
          {usd.format(r.net)}
        </span>
        {` · маржа ${r.marginPercent.toFixed(0)}% · себестоимость груза (за вычетом всех расходов) `}
        <span className="nums text-white/85">{usd.format(r.breakEvenRate)}</span>
        {' — ниже неё в убыток'}
      </p>

      {vsSpot !== null && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">
          Рынок DAT <span className="nums text-white/85">{usd2.format(spotRpm!)}</span>/mi
          {vsSpot >= 0 ? ' — предложение выше рынка на ' : ' — предложение ниже рынка на '}
          <span className={`nums ${vsSpot >= 0 ? 'text-good-400/80' : 'text-amber-400/90'}`}>
            {usd2.format(Math.abs(vsSpot))}
          </span>
          /mi{vsSpot < 0 ? '. Есть на что давить в торге.' : '.'}
        </p>
      )}

      {/* All the numbers with deductions live here, opened on demand. */}
      <details className="group mt-4">
        <summary className="flex cursor-pointer list-none items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-3 text-center text-[14px] font-semibold text-white/75 transition-colors hover:border-haul-500/40 hover:bg-white/[0.07] hover:text-white">
          <span className="text-haul-400 transition-transform group-open:rotate-90">▸</span>
          Нажмите, чтобы увидеть все расходы
        </summary>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            {
              label: 'All-in RPM',
              node: <Money value={r.allInRpm} format={usd2} />,
              info: 'Доход на милю с учётом всех расходов по этому грузу: чистыми ÷ мили (гружёные + порожние). Ниже нуля — груз в убыток.',
            },
            {
              label: 'Spot rate / mi',
              node:
                spotRpm && spotRpm > 0 ? (
                  <Money value={spotRpm} format={usd2} />
                ) : (
                  <span className="text-white/35">—</span>
                ),
              info: 'Рыночная ставка за милю по DAT для похожего маршрута — ориентир, есть ли смысл торговаться по цене. Прочерк — не указана.',
            },
            {
              label: 'Чистыми / день',
              node: <Money value={r.netPerDay} />,
              info: 'Чистыми, поделённые на дни в пути — сколько груз приносит в день, чтобы сравнивать грузы разной длины между собой.',
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
            <span className="text-[13px] text-white/78">Гросс</span>
            <span className="nums text-[13px] font-semibold">{usd.format(r.gross)}</span>
          </div>

          <CostBar
            label={`Топливо · ${Math.round(r.totalMiles)} mi @ ${mpg} mpg`}
            amount={r.fuel}
            gross={r.gross}
            color="bg-amber-400/80"
            hint="Топливо на этот груз: мили ÷ расход (MPG) × цена дизеля. MPG и цену дизеля меняешь ниже, в «Расходы трака»."
          />
          <CostBar
            label="Водитель"
            amount={r.driver}
            gross={r.gross}
            color="bg-haul-400/80"
            hint="Оплата водителя за этот груз: мили × ставку за милю (или % от гросса). Настройка — в «Расходы трака»."
          />
          <CostBar
            label="Обслуживание"
            amount={r.maintenance}
            gross={r.gross}
            color="bg-violet-400/80"
            hint="Износ по пробегу: мили × стоимость обслуживания за милю (шины, ТО). Настройка — в «Расходы трака»."
          />
          <CostBar
            label="Платёж за трак"
            amount={r.truckPayment}
            gross={r.gross}
            color="bg-white/40"
            hint="Кредит/лизинг за трак, за день × дни в пути. Тратится, даже когда трак стоит. Сумму за день меняешь в «Расходы трака», число дней — в Деталях."
          />
          <CostBar
            label="Страховка"
            amount={r.insurance}
            gross={r.gross}
            color="bg-white/32"
            hint="Страховка трака (liability + cargo + physical damage), за день × дни в пути. Настройка — в «Расходы трака»."
          />
          <CostBar
            label="ELD, пермиты, плейты"
            amount={r.eldPermits}
            gross={r.gross}
            color="bg-white/24"
            hint="ELD-подписка + IRP/IFTA пермиты и плейты, за день × дни в пути. Настройка — в «Расходы трака»."
          />
          {r.factoring > 0 && (
            <CostBar
              label="Факторинг"
              amount={r.factoring}
              gross={r.gross}
              color="bg-white/25"
              hint="Комиссия факторинга — процент от гросса за быструю оплату. Настройка — в «Расходы трака»."
            />
          )}
          {r.dispatch > 0 && (
            <CostBar
              label="Диспетч"
              amount={r.dispatch}
              gross={r.gross}
              color="bg-white/25"
              hint="Комиссия диспетчера — процент от гросса. Настройка — в «Расходы трака»."
            />
          )}

          <div className="mt-2 flex items-baseline justify-between border-t border-white/8 pt-2.5">
            <span className="text-[13px] text-white/78">Чистыми · {r.marginPercent.toFixed(1)}% маржа</span>
            <span className={`nums text-sm font-bold ${good ? 'text-good-400' : 'text-bad-400'}`}>
              {usd.format(r.net)}
            </span>
          </div>
        </div>
      </details>
    </>
  )
}
