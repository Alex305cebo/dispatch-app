// «Толлы в деньгах» — сколько парк уже отдал платным дорогам за месяц.
//
// Калькулятор выше отвечает на вопрос «сколько будет стоить», а этот блок — на
// «сколько уже стоило». Пока толлы считались на глаз, они не попадали ни в чистую
// по рейсу, ни в счёт брокеру, и месячная сумма никогда не называлась вслух.

import Link from 'next/link'
import { usd, usd2 } from '@/lib/fmt'
import { Info } from '@/components/info'
import { t, type Locale } from '@/lib/i18n'
import type { TollSpend } from '@/lib/toll-spend'

export function TollMoney({ spend, days, locale }: { spend: TollSpend; days: number; locale: Locale }) {
  const nothing = spend.counted === 0 && spend.missing.length === 0
  if (nothing) return null

  return (
    <section className="panel mt-4 p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
        {t(locale, 'tolls.money.title').replace('{days}', String(days))}
        <Info text={t(locale, 'tolls.money.info')} />
      </h2>

      {spend.counted > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Tile value={usd.format(spend.total)} label={t(locale, 'tolls.money.total')} />
          <Tile value={`${usd2.format(spend.perMile)}/mi`} label={t(locale, 'tolls.money.perMile')} />
          {/* Доля от гросса — та цифра, по которой это сравнивают с топливом: три
              процента выручки на дороги никто не замечает, пока их не назовут. */}
          <Tile
            value={`${spend.shareOfGross.toFixed(1)}%`}
            label={t(locale, 'tolls.money.share')}
            tone={spend.shareOfGross > 5 ? 'warn' : undefined}
          />
          <Tile value={String(spend.counted)} label={t(locale, 'tolls.money.loads')} />
        </div>
      )}

      {spend.top.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {spend.top.map((l) => (
            <li key={l.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[12.5px] hover:bg-white/5">
              <Link href={`/loads/${l.id}`} className="min-w-0 flex-1 truncate text-white/75 hover:text-white hover:underline">
                {l.origin ?? '—'} → {l.destination ?? '—'}
              </Link>
              <span className="nums shrink-0 text-white/45">
                {l.miles > 0 ? `${usd2.format((l.tolls ?? 0) / l.miles)}/mi` : ''}
              </span>
              <span className="nums shrink-0 font-semibold text-white/85">{usd.format(l.tolls ?? 0)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Главное здесь. Пустое поле толлов в рейсе через Пенсильванию — не ноль, а
          «не считали»: чистая по такому рейсу завышена ровно на неизвестную сумму. */}
      {spend.missing.length > 0 && (
        <div className="mt-3 rounded-xl border border-warn-500/25 bg-warn-500/[0.07] p-3">
          <p className="text-[12.5px] font-medium text-warn-400">
            {t(locale, 'tolls.money.missing').replace('{n}', String(spend.missing.length))}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-white/55">
            {t(locale, 'tolls.money.missingWhy')}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {spend.missing.slice(0, 8).map((l) => (
              <Link
                key={l.id}
                href={`/loads/${l.id}`}
                className="rounded-full bg-white/8 px-2 py-0.5 text-[11.5px] text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              >
                {l.origin ?? '—'} → {l.destination ?? '—'}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function Tile({ value, label, tone }: { value: string; label: string; tone?: 'warn' }) {
  return (
    <div className="rounded-xl border border-white/8 bg-ink-950/50 px-3 py-2">
      <div className={`nums text-[17px] font-bold ${tone === 'warn' ? 'text-warn-400' : 'text-white/90'}`}>{value}</div>
      <div className="mt-0.5 text-[10.5px] uppercase tracking-wider text-white/45">{label}</div>
    </div>
  )
}
