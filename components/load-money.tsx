'use client'

// Деньги груза — частью шапки карточки (план «Порядок в TMS», 10/09/26). Раньше ниже
// шапки стояла своя плитка «Ставка за груз», и ставка с $/mi были на экране дважды.
// Владелец 09.10: «меньше цифр и текста, больше графиков», поэтому:
//   • ставка за милю — шкалой: зона убытка, зона «ниже цели трака», зелёная зона, риски
//     «без убытка» · «цель» · «рынок DAT» и рамка вилки торга; где на ней груз — видно
//     без чтения двух длинных строк, что были под ставкой;
//   • мили — полосой «гружёные / пустые», пустые желтеют от 20 %;
//   • расходы — полосой «что съедает ставку» в свёрнутой строке, а цифры с вычетами,
//     строки рынка и экономика трака открываются там же, по нажатию.
// «Чистыми» по-прежнему не на виду: главная цифра — ставка из рейт-кона, всё с вычетом
// расходов — по желанию (диспетчер и бухгалтер путали, какая из двух — цена груза).

import { useState, type ReactNode } from 'react'
import { ChevronRight, Package, Weight } from 'lucide-react'
import { targetVerdict, type Breakdown } from '@/lib/profit'
import type { RateCheck } from '@/lib/rate-check-core'
import { usd, usd2 } from '@/lib/fmt'
import { t } from '@/lib/i18n'
import { useLocale } from '@/components/locale-provider'
import { Info } from '@/components/info'
import { CostDetails, RateBadge, RateLines, RateSplit } from '@/components/analysis'
import { quoteBoardLane } from '@/app/actions'
import { notify } from '@/lib/notify'

type Tone = 'good' | 'warn' | 'bad' | null

const DOT: Record<Exclude<Tone, null>, string> = { good: 'bg-good-400', warn: 'bg-warn-400', bad: 'bg-bad-400' }
const TEXT: Record<Exclude<Tone, null>, string> = { good: 'text-good-400', warn: 'text-warn-400', bad: 'text-bad-400' }
const CHIP: Record<Exclude<Tone, null>, string> = {
  good: 'border-good-400/30 bg-good-500/10 text-good-400',
  warn: 'border-warn-400/30 bg-warn-500/10 text-warn-400',
  bad: 'border-bad-500/30 bg-bad-500/10 text-bad-400',
}

/** Пустые мили от этой доли пробега — жёлтым: та же граница, что в разборе расходов. */
const DEADHEAD_WARN_PCT = 20

export function LoadMoney({
  r,
  mpg,
  targetRpm,
  spotRpm,
  rc,
  brokerName,
  quote,
  cargo,
  truckCosts,
}: {
  r: Breakdown
  mpg: number
  /** Цель по ставке из паспорта трака, $/mi. */
  targetRpm?: number | null
  /** Рыночная ставка, вписанная в сам груз; главнее DAT по региону. */
  spotRpm?: number | null
  /** Проверка ставки (lib/rate-check.ts): вилка торга, рынок DAT, что после выгрузки. */
  rc?: RateCheck | null
  brokerName?: string | null
  /** Вилки торга нет — кнопка «Узнать цену брокера» (Warp). */
  quote?: { label: string; miles: number; loadId: number } | null
  /** Что везём и вес — из текста водителю (lib/driver-info-zip cargoFacts). */
  cargo?: { commodity: string | null; weight: string | null }
  /** Форма «Расходы трака» — внизу раскрытой части: из неё считается каждая строка. */
  truckCosts?: ReactNode
}) {
  const locale = useLocale()
  const loaded = r.totalMiles - r.deadheadMiles
  const rpm = loaded > 0 ? r.gross / loaded : 0
  const configured = r.totalCost > 0
  // Без расходов трака безубыточность — ноль, и красная зона ничего бы не значила.
  const be = configured && loaded > 0 && r.breakEvenRate > 0 ? r.breakEvenRate / loaded : null
  const goal = targetRpm && targetRpm > 0 ? targetRpm : null
  const ownSpot = spotRpm && spotRpm > 0 ? spotRpm : null
  const market = ownSpot ?? rc?.dat?.rpm ?? null
  const band = rc?.target ?? null
  const verdict = targetVerdict(r, goal)

  // Цвет груза на шкале: убыток важнее всего, потом цель трака, потом вилка торга.
  const tone: Tone =
    be != null && rpm < be
      ? 'bad'
      : verdict
        ? verdict.kind === 'ok'
          ? 'good'
          : verdict.kind === 'short'
            ? 'warn'
            : 'bad'
        : band?.verdict
          ? band.verdict === 'below'
            ? 'warn'
            : 'good'
          : null

  const marks = [
    be != null ? { key: 'be', v: be, label: t(locale, 'loadMoney.breakEven'), color: 'bg-bad-400' } : null,
    goal != null ? { key: 'goal', v: goal, label: t(locale, 'loadMoney.goal'), color: 'bg-good-400' } : null,
    market != null ? { key: 'market', v: market, label: t(locale, 'loadMoney.market'), color: 'bg-sky-400' } : null,
  ].filter((m): m is { key: string; v: number; label: string; color: string } => m !== null)

  // Шкала только когда есть с чем сравнить: одна точка на пустой полосе ничего не говорит.
  const vals = [rpm, ...marks.map((m) => m.v), ...(band ? [band.low, band.high] : [])].filter((v) => v > 0)
  const scale = rpm > 0 && (marks.length > 0 || band) ? domain(vals) : null
  const pos = (v: number) => (scale ? Math.min(100, Math.max(0, ((v - scale.lo) / (scale.hi - scale.lo)) * 100)) : 0)
  // Граница «ниже цели»: цель трака, а нет её — нижний край вилки торга.
  const goalEdge = goal ?? band?.low ?? null
  const zones = scale
    ? [
        be != null ? { from: 0, to: pos(be), cls: 'bg-bad-500/35' } : null,
        goalEdge != null && goalEdge > (be ?? 0)
          ? { from: be != null ? pos(be) : 0, to: pos(goalEdge), cls: 'bg-warn-400/30' }
          : null,
        be != null || goalEdge != null
          ? { from: pos(goalEdge != null && goalEdge > (be ?? 0) ? goalEdge : (be ?? 0)), to: 100, cls: 'bg-good-400/30' }
          : null,
      ].filter((z): z is { from: number; to: number; cls: string } => z !== null && z.to > z.from)
    : []

  const dh = r.deadheadMiles
  const dhPct = r.totalMiles > 0 ? (dh / r.totalMiles) * 100 : 0
  const dhWarn = dhPct >= DEADHEAD_WARN_PCT

  // Своя рыночная ставка в грузе — строку DAT по региону не показываем, как в Analysis.
  const rcView = rc && ownSpot ? { ...rc, dat: null } : rc

  const [quoting, setQuoting] = useState(false)
  const askWarp = () => {
    if (!quote || quoting) return
    setQuoting(true)
    quoteBoardLane(quote.label, quote.miles, quote.loadId)
      .then((res) => {
        if ('error' in res) return notify('error', res.error)
        notify('ok', t(locale, 'plan.quote.ok').replace('{v}', usd2.format(res.rpm)))
      })
      .catch(() => notify('error', t(locale, 'plan.quote.fail').replace('{e}', '—')))
      .finally(() => setQuoting(false))
  }

  return (
    <>
      <div className="mt-3 grid gap-2 @2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Ставка: сумма, $/mi и шкала. */}
        <div className="panel-inset min-w-0 px-3 py-2.5">
          <div className="flex items-center gap-1 text-2xs font-semibold tracking-wide text-t3 uppercase">
            {t(locale, 'loadEdit.rate')}
            <Info text={t(locale, 'loadMoney.scaleInfo')} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="nums text-2xl font-bold text-t1">{usd.format(r.gross)}</span>
            {rpm > 0 && (
              <span className={`nums text-lg font-semibold ${tone ? TEXT[tone] : 'text-t1'}`}>{usd2.format(rpm)}/mi</span>
            )}
            {verdict ? (
              <span className={`nums inline-flex items-center rounded-md border px-1.5 py-0.5 text-2xs font-semibold ${CHIP[tone ?? 'good']}`}>
                {verdict.kind === 'ok'
                  ? t(locale, 'analysis.targetOk')
                  : verdict.kind === 'short'
                    ? t(locale, 'rc.badgeBelow').replace('{usd}', usd.format(verdict.dollars))
                    : t(locale, 'loadMoney.loss')}
              </span>
            ) : tone === 'bad' ? (
              <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-2xs font-semibold ${CHIP.bad}`}>
                {t(locale, 'loadMoney.loss')}
              </span>
            ) : (
              rc && <RateBadge rc={rc} />
            )}
          </div>

          {scale && (
            <>
              <div className="relative mt-3 h-6" aria-hidden>
                <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-white/8">
                  {zones.map((z, i) => (
                    <span key={i} className={`absolute inset-y-0 ${z.cls}`} style={{ left: `${z.from}%`, width: `${z.to - z.from}%` }} />
                  ))}
                </div>
                {band && (
                  <span
                    className="absolute top-1/2 h-4 -translate-y-1/2 rounded-full border-2 border-white/55"
                    style={{ left: `${pos(band.low)}%`, width: `${Math.max(1.5, pos(band.high) - pos(band.low))}%` }}
                  />
                )}
                {marks.map((m) => (
                  <span
                    key={m.key}
                    className={`absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full ${m.color}`}
                    style={{ left: `${pos(m.v)}%` }}
                  />
                ))}
                <span
                  className={`absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-md ring-[3px] ring-ink-900 ${tone ? DOT[tone] : 'bg-t1'}`}
                  style={{ left: `${pos(rpm)}%` }}
                />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-t3">
                {marks.map((m) => (
                  <span key={m.key} className="inline-flex items-center gap-1.5">
                    <span className={`h-3 w-[3px] rounded-full ${m.color}`} />
                    {m.label}
                    <span className="nums text-t2">{usd2.format(m.v)}</span>
                  </span>
                ))}
                {band && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-4 rounded-full border-2 border-white/55" />
                    {t(locale, 'loadMoney.band')}
                    <span className="nums text-t2">
                      {usd2.format(band.low)}–{usd2.format(band.high)}
                    </span>
                  </span>
                )}
              </div>
            </>
          )}

          {/* Вилки торга нет — котировки по маршруту не собраны: спросить Warp сейчас. */}
          {!band && quote && (
            <p className="mt-2 text-sm text-t3">
              <button
                type="button"
                disabled={quoting}
                onClick={askWarp}
                className="font-semibold text-haul-400 underline-offset-2 hover:underline disabled:opacity-50"
              >
                {quoting ? '…' : t(locale, 'plan.quote.btn')}
              </button>
              <span className="ml-1.5">{t(locale, 'plan.quote.hint')}</span>
            </p>
          )}
        </div>

        {/* Мили: гружёные и пустые одной полосой, груз и вес — под ней. */}
        <div className="panel-inset min-w-0 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xs font-semibold tracking-wide text-t3 uppercase">{t(locale, 'loadMoney.miles')}</span>
            <span className="nums text-lg font-semibold text-t1">{Math.round(r.totalMiles).toLocaleString('en-US')} mi</span>
          </div>
          <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-white/8" aria-hidden>
            <span className="bg-sky-400/80" style={{ width: `${100 - dhPct}%` }} />
            {dh > 0 && <span className={dhWarn ? 'bg-warn-400' : 'bg-white/35'} style={{ width: `${Math.max(1.5, dhPct)}%` }} />}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-t3">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-sky-400/80" />
              {t(locale, 'loadMoney.loaded')}
              <span className="nums text-t2">{Math.round(loaded).toLocaleString('en-US')}</span>
            </span>
            {dh > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className={`size-2 rounded-sm ${dhWarn ? 'bg-warn-400' : 'bg-white/35'}`} />
                {t(locale, 'loadMoney.empty')}
                <span className={`nums ${dhWarn ? 'font-semibold text-warn-400' : 'text-t2'}`}>
                  {Math.round(dh).toLocaleString('en-US')} · {Math.round(dhPct)}%
                </span>
              </span>
            )}
          </div>
          {(cargo?.commodity || cargo?.weight) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cargo.commodity && (
                <span className="inline-flex min-w-0 items-center gap-1 rounded-md bg-white/[0.06] px-2 py-0.5 text-sm text-t2">
                  <Package size={13} className="shrink-0 text-t3" aria-hidden />
                  <span className="min-w-0 break-words">{cargo.commodity}</span>
                </span>
              )}
              {cargo.weight && (
                <span className="nums inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-0.5 text-sm text-t2">
                  <Weight size={13} className="shrink-0 text-t3" aria-hidden />
                  {cargo.weight}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Расходы и рынок — свёрнуты: на виду только полоса, куда уходит ставка. */}
      <details className="group/money mt-2 overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 transition-colors hover:bg-white/[0.04] max-md:min-h-11 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-t2">
            <ChevronRight size={14} strokeWidth={2.5} className="shrink-0 text-t3 transition-transform group-open/money:rotate-90" />
            {t(locale, 'loadMoney.more')}
          </span>
          {/* Раскрыто — та же полоса уже стоит внутри, с подписями; вторая над ней не нужна. */}
          {configured ? (
            <RateSplit r={r} locale={locale} legend={false} className="min-w-[8rem] flex-1 group-open/money:hidden" />
          ) : (
            <span className="text-sm text-warn-400 group-open/money:hidden">{t(locale, 'loadMoney.noCosts')}</span>
          )}
        </summary>
        <div className="border-t border-white/[0.06] px-3 pb-3">
          {!configured && (
            <p className="mt-3 rounded-xl border border-warn-400/30 bg-warn-500/[0.08] px-3 py-2 text-base leading-relaxed text-warn-400">
              {t(locale, 'analysis.notConfigured')}
            </p>
          )}
          <CostDetails r={r} mpg={mpg} spot={market} />
          {rcView && (rcView.target || rcView.dat || rcView.dest || rcView.history) && (
            <div className="mt-4 border-t border-white/8 pt-2">
              <RateLines rc={rcView} brokerName={brokerName} />
            </div>
          )}
          {truckCosts && (
            <details className="group/costs mt-4 border-t border-white/8 pt-3">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-base font-semibold text-t2 transition-colors hover:text-t1 [&::-webkit-details-marker]:hidden">
                <ChevronRight size={14} strokeWidth={2.5} className="shrink-0 text-t3 transition-transform group-open/costs:rotate-90" />
                {t(locale, 'loadDetail.truckCostsHeading')}
                <Info text={t(locale, 'loadDetail.truckCostsInfo')} />
              </summary>
              <div className="mt-2">{truckCosts}</div>
            </details>
          )}
        </div>
      </details>
    </>
  )
}

/** Края шкалы: от самой низкой до самой высокой риски с запасом, чтобы крайние не
 *  прилипали к краю полосы. */
function domain(vals: number[]): { lo: number; hi: number } {
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const pad = Math.max((hi - lo) * 0.18, hi * 0.06, 0.05)
  return { lo: Math.max(0, lo - pad), hi: hi + pad }
}
