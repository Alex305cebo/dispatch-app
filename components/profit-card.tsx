'use client'

// «Прибыль недели» на «Сегодня» — как «Revenue · Expenses · Profit» у SmartHop (владелец,
// 13/10/26: «сделай даже больше, изучи»). Слева одна полоса: весь гросс недели, разрезанный
// на топливо, водителя, трак и сборы, а зелёный хвост — что осталось чистыми. Справа — то
// же по каждому траку: длина полосы — его гросс, зелёная часть — чистыми, отметка — цель
// недели из профиля водителя. Цифр — главная и по одной на строку, остальное картинкой.
// Считает lib/week-profit.ts на сервере, сюда приходят готовые суммы двух недель.

import { useState } from 'react'
import Link from 'next/link'
import { Info } from '@/components/info'
import { useLocale } from '@/components/locale-provider'
import { t, type MsgKey } from '@/lib/i18n'
import { usd } from '@/lib/fmt'
import type { CostGroup } from '@/lib/week-profit'

export type ProfitTruck = { id: number; label: string; sub: string; gross: number; net: number; goal: number | null }
export type ProfitView = { gross: number; net: number; costs: Record<CostGroup, number>; unpriced: number; trucks: ProfitTruck[] }

/** Цвета свои, не акцент: при фиолетовом виде топливо всё равно оранжевое, а чистыми —
 *  зелёное, как деньги везде в TMS. Средней яркости — читаются и на светлом, и на тёмном. */
const PARTS: { key: CostGroup; label: MsgKey; color: string }[] = [
  { key: 'fuel', label: 'today.fuel', color: '#f97316' },
  { key: 'driver', label: 'today.profit.driver', color: '#3b82f6' },
  { key: 'truck', label: 'today.profit.truck', color: '#8b5cf6' },
  { key: 'fees', label: 'today.profit.fees', color: '#94a3b8' },
]
const NET = '#22c55e'

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.max(0, (part / whole) * 100)}%` : '0%')

export function ProfitCard({ href, now, last }: { href: string; now: ProfitView; last: ProfitView }) {
  const locale = useLocale()
  const [which, setWhich] = useState<'now' | 'last'>('now')
  const v = which === 'now' ? now : last
  const cost = PARTS.reduce((s, p) => s + v.costs[p.key], 0)
  // Убыточная неделя: полоса — весь расход, зелёного хвоста нет, цифра красная.
  const whole = Math.max(v.gross, cost)
  const margin = v.gross > 0 ? Math.round((v.net / v.gross) * 100) : null
  const scale = Math.max(1, ...v.trucks.map((tr) => Math.max(tr.gross, tr.goal ?? 0)))
  const SHOWN = 8

  return (
    <div className="panel grid h-full gap-x-6 gap-y-4 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-1 text-md font-semibold text-t1">
            <Link href={href} className="min-w-0 truncate hover:underline">
              {t(locale, 'today.profit')}
            </Link>
            <Info text={t(locale, 'today.profitInfo')} />
          </h2>
          {/* Эта неделя или прошлая — в начале недели в этой ещё пусто, а прошлая уже
              целиком, и сравнить хочется сразу. */}
          <div className="flex rounded-lg bg-white/[0.05] p-0.5 text-xs font-semibold" role="group">
            {(['now', 'last'] as const).map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={which === w}
                onClick={() => setWhich(w)}
                className={`min-h-7 rounded-md px-2.5 transition-colors max-md:min-h-9 ${
                  which === w ? 'bg-[var(--btn2-bg)] text-t1 shadow-[var(--btn2-shadow)]' : 'text-t3 hover:text-t1'
                }`}
              >
                {t(locale, w === 'now' ? 'today.profit.now' : 'today.profit.last')}
              </button>
            ))}
          </div>
        </div>

        {v.gross <= 0 ? (
          <p className="mt-auto pt-6 text-sm text-t3">{t(locale, 'today.profit.empty')}</p>
        ) : (
          <>
            <div className="mt-4 text-xs text-t3">{t(locale, 'finances.stat.net')}</div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className={`nums text-3xl font-bold leading-tight tracking-tight ${v.net >= 0 ? 'text-good-500' : 'text-bad-500'}`}>
                {usd.format(v.net)}
              </span>
              <span className="nums text-sm text-t3">{t(locale, 'today.profit.ofGross').replace('{v}', usd.format(v.gross))}</span>
              {margin != null && (
                <span className={`nums rounded-md px-1.5 py-0.5 text-xs font-semibold ${margin >= 0 ? 'bg-good-500/12 text-good-500' : 'bg-bad-500/12 text-bad-500'}`}>
                  {margin}%
                </span>
              )}
            </div>

            {/* Весь гросс одной полосой: из чего ушли деньги и что осталось. */}
            <div className="mt-3 flex h-3 gap-[2px] overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
              {PARTS.map((p) =>
                v.costs[p.key] > 0 ? (
                  <span
                    key={p.key}
                    className="h-full first:rounded-l-full"
                    title={`${t(locale, p.label)} ${usd.format(v.costs[p.key])}`}
                    style={{ width: pct(v.costs[p.key], whole), background: p.color }}
                  />
                ) : null,
              )}
              {v.net > 0 && (
                <span className="h-full rounded-r-full" title={`${t(locale, 'finances.stat.net')} ${usd.format(v.net)}`} style={{ width: pct(v.net, whole), background: NET }} />
              )}
            </div>
            {/* Как короткий отчёт: статьи столбиком, чистыми — под чертой. */}
            <ul className="mt-3 flex flex-col gap-y-1.5 text-sm">
              {PARTS.map((p) => (
                <li key={p.key} className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-t2">{t(locale, p.label)}</span>
                  <span className="nums shrink-0 text-t1">{usd.format(v.costs[p.key])}</span>
                </li>
              ))}
              <li className="flex min-w-0 items-center gap-2 border-t border-white/[0.07] pt-1.5">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: NET }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-t2">{t(locale, 'finances.stat.net')}</span>
                <span className={`nums shrink-0 font-semibold ${v.net >= 0 ? 'text-good-500' : 'text-bad-500'}`}>{usd.format(v.net)}</span>
              </li>
            </ul>
            {v.unpriced > 0 && <p className="mt-2 text-xs text-t3">{t(locale, 'today.profit.unpriced').replace('{n}', String(v.unpriced))}</p>}
          </>
        )}
      </div>

      {v.trucks.length > 0 && (
        <div className="min-w-0 md:border-l md:border-white/[0.07] md:pl-6">
          <h3 className="text-xs font-medium text-t3">{t(locale, 'today.profit.byTruck')}</h3>
          <ul className="mt-1">
            {v.trucks.slice(0, SHOWN).map((tr) => {
              const loss = tr.net < 0
              const title = [
                `${tr.label}${tr.sub ? ` · ${tr.sub}` : ''}`,
                `${t(locale, 'finances.stat.net')} ${usd.format(tr.net)} · ${t(locale, 'today.profit.ofGross').replace('{v}', usd.format(tr.gross))}`,
                tr.goal ? t(locale, 'today.profit.goal').replace('{v}', usd.format(tr.goal)) : null,
              ]
                .filter(Boolean)
                .join('\n')
              return (
                <li key={tr.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)_5rem] items-center gap-3 border-t border-white/[0.07] py-1.5 first:border-t-0">
                  <Link href={`/trucks/${tr.id}`} className="min-w-0 hover:underline">
                    <span className="block truncate text-sm font-semibold text-t1">{tr.label}</span>
                    {tr.sub && <span className="block truncate text-xs text-t3">{tr.sub}</span>}
                  </Link>
                  {/* Полоса трака: длина — его гросс против самого большого в списке (или
                      цели), внутри серое — расходы, зелёное — чистыми; убыток — вся красная. */}
                  <div className="relative h-2.5 rounded-full bg-white/[0.06]" title={title}>
                    <div className="flex h-full overflow-hidden rounded-full" style={{ width: pct(tr.gross, scale) }}>
                      {loss ? (
                        <span className="h-full w-full bg-bad-400/70" />
                      ) : (
                        <>
                          <span className="h-full bg-white/20" style={{ width: pct(tr.gross - tr.net, tr.gross) }} />
                          <span className="h-full" style={{ width: pct(tr.net, tr.gross), background: NET }} />
                        </>
                      )}
                    </div>
                    {tr.goal != null && tr.goal > 0 && (
                      <span className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-t1" style={{ left: pct(tr.goal, scale) }} aria-hidden />
                    )}
                  </div>
                  <span className={`nums text-right text-sm font-semibold ${loss ? 'text-bad-500' : 'text-t1'}`}>{usd.format(tr.net)}</span>
                </li>
              )
            })}
          </ul>
          {v.trucks.length > SHOWN && (
            <p className="mt-1 text-xs text-t3">{t(locale, 'today.feed.more').replace('{n}', String(v.trucks.length - SHOWN))}</p>
          )}
        </div>
      )}
    </div>
  )
}
