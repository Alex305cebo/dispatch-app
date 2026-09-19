'use client'

import { useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import { addLoadCharge, deleteLoadCharge } from '@/app/actions'
import { CHARGE_KINDS, chargesTotal, type ChargeKind, type LoadCharge } from '@/lib/charges-core'
import { usd, usd2 } from '@/lib/fmt'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t, type MsgKey } from '@/lib/i18n'
import { Info } from '@/components/info'

const KIND_KEY: Record<ChargeKind, MsgKey> = {
  detention: 'loads.charges.kind.detention',
  lumper: 'loads.charges.kind.lumper',
  tonu: 'loads.charges.kind.tonu',
  layover: 'loads.charges.kind.layover',
  stop_off: 'loads.charges.kind.stop_off',
  other: 'loads.charges.kind.other',
}

const field =
  'min-h-9 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 text-[13px] text-white outline-none focus:border-haul-500/60 max-md:min-h-11'

/**
 * Доп. начисления груза: detention, lumper, TONU… — строки сверх ставки, которые уходят
 * в счёт. Список, «Итого к оплате» и одна строка добавления. Удаление — крестиком без
 * слова-подтверждения: строка восстанавливается за пять секунд, это не документ.
 */
export function LoadCharges({ loadId, rate, charges, stopsCount = 2 }: { loadId: number; rate: number; charges: LoadCharge[]; stopsCount?: number }) {
  const locale = useLocale()
  const [busy, start] = useTransition()
  const [kind, setKind] = useState<ChargeKind>('detention')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const total = chargesTotal(charges)

  const add = () =>
    start(async () => {
      const n = Number(amount.replace(/[$,\s]/g, ''))
      if (!Number.isFinite(n) || n <= 0) return notify('warn', t(locale, 'loads.charges.badAmount'))
      const res = await addLoadCharge(loadId, kind, n, note)
      if (res?.error) return notify('error', res.error)
      setAmount('')
      setNote('')
      notify('ok', t(locale, 'loads.charges.added'))
    })
  const remove = (id: number) =>
    start(async () => {
      const res = await deleteLoadCharge(id, loadId)
      if (res?.error) notify('error', res.error)
      else notify('ok', t(locale, 'loads.charges.removed'))
    })

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-t1">
        {t(locale, 'loads.charges.heading')}
        <Info text={t(locale, 'loads.charges.info')} />
      </p>
      {charges.length ? (
        <ul className="mt-2 divide-y divide-white/[0.06]">
          {charges.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-1.5 text-[13px]">
              <span className="font-medium text-t1">{t(locale, KIND_KEY[c.kind])}</span>
              {c.note && <span className="min-w-0 flex-1 truncate text-t3">{c.note}</span>}
              <span className="nums ml-auto shrink-0 font-semibold">{(c.amount % 1 ? usd2 : usd).format(c.amount)}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(c.id)}
                aria-label={t(locale, 'common.delete')}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-t3 transition-colors hover:bg-bad-500/15 hover:text-bad-400 disabled:opacity-50 max-md:size-9"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[12px] text-t3">{t(locale, 'loads.charges.empty')}</p>
      )}
      {/* Больше двух остановок, а stop-off не начислен — подсказка, как в AscendTMS
          («у тебя лишняя остановка»). */}
      {stopsCount > 2 && !charges.some((c) => c.kind === 'stop_off') && (
        <p className="mt-1.5 text-[12px] text-warn-400">{t(locale, 'loads.charges.stopOffHint').replace('{n}', String(stopsCount))}</p>
      )}
      {/* Итог: ставка + начисления. Ставка груза не меняется — она из рейт-кона. */}
      {charges.length > 0 && (
        <p className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-2 text-[13px]">
          <span className="text-t2">{t(locale, 'loads.charges.total')}</span>
          <span className="nums font-bold">
            {usd.format(rate + total)} <span className="text-[11px] font-medium text-t3">= {usd.format(rate)} + {usd.format(total)}</span>
          </span>
        </p>
      )}
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-1.5 sm:grid-cols-[auto_7rem_1fr_auto]">
        <select value={kind} onChange={(e) => setKind(e.target.value as ChargeKind)} className={field} aria-label={t(locale, 'loads.charges.heading')}>
          {CHARGE_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(locale, KIND_KEY[k])}
            </option>
          ))}
        </select>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          inputMode="decimal"
          placeholder={t(locale, 'loads.charges.amount')}
          className={`${field} nums`}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={t(locale, 'loads.charges.note')}
          className={`${field} col-span-2 sm:col-span-1`}
        />
        <button
          type="button"
          disabled={busy}
          onClick={add}
          className="col-span-2 inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-haul-500/40 px-3 text-[12.5px] font-semibold text-haul-300 transition-colors hover:bg-haul-500/10 disabled:opacity-50 sm:col-span-1 max-md:min-h-11"
        >
          <Plus size={14} strokeWidth={2.5} />
          {t(locale, 'loads.charges.add')}
        </button>
      </div>
    </div>
  )
}
