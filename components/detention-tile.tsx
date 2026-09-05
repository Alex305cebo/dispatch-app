'use client'

import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { driveTime } from '@/lib/fmt'
import { notify } from '@/lib/notify'
import { detentionAmount } from '@/lib/detention'


/** Плитка «Детеншен» на странице груза: сколько трак стоит у пикапа/выгрузки,
 * сколько это уже стоит брокеру, и готовое письмо в буфер. Отправка — только
 * руками: никаких автоматических сообщений. */
export function DetentionTile({
  at,
  sinceIso,
  min,
  rateHr,
  freeHr,
  ref,
  route,
  truck,
}: {
  at: 'pickup' | 'delivery'
  sinceIso: string
  min: number
  rateHr: number
  freeHr: number
  ref: string | null
  route: string
  truck: string
}) {
  const locale = useLocale()
  const amount = detentionAmount(min, rateHr, freeHr)
  const over = min >= freeHr * 60
  const since = new Date(sinceIso)
  const stamp = since.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const h = Math.floor(min / 60)
  const m = min % 60

  async function copyLetter() {
    // Письмо брокеру по-английски — так его и отправляют, независимо от языка интерфейса.
    const text =
      `Detention request${ref ? ` — Load #${ref}` : ''}\n` +
      `Route: ${route}\nTruck: ${truck}\n` +
      `Truck arrived at ${at} on ${stamp} and has been waiting ${h}h ${m}m.\n` +
      `Per the rate confirmation, detention applies after ${freeHr} free hours at $${rateHr}/hr.\n` +
      `Detention to date: $${amount.toFixed(2)}. Please confirm and add to the invoice.\n` +
      `In/out times are documented on the BOL.`
    try {
      await navigator.clipboard.writeText(text)
      notify('ok', t(locale, 'detention.copied'))
    } catch {
      notify('warn', t(locale, 'tracking.clipboardDenied'))
    }
  }

  return (
    <div className={`flex-1 basis-[11rem] rounded-xl border px-3 py-2 ${over ? 'border-bad-500/35 bg-bad-500/[0.07]' : 'border-white/10 bg-white/[0.04]'}`}>
      <div className="text-[10px] uppercase tracking-wider text-white/45">
        {t(locale, at === 'pickup' ? 'detention.atPickup' : 'detention.atDelivery')}
      </div>
      <div className={`nums min-h-[1.375rem] text-[14px] font-semibold ${over ? 'text-bad-400' : 'text-white/85'}`}>
        {driveTime(min, locale)}
        {over && <span className="ml-2">· ${amount.toFixed(0)}</span>}
      </div>
      <div className="nums mt-0.5 text-[11px] text-white/45">
        {t(locale, 'detention.since').replace('{t}', stamp)} · {t(locale, 'detention.terms').replace('{free}', String(freeHr)).replace('{rate}', String(rateHr))}
      </div>
      {over && (
        <button
          type="button"
          onClick={copyLetter}
          className="mt-1.5 rounded-lg bg-bad-500/15 px-2.5 py-1 text-[11.5px] font-semibold text-bad-300 hover:bg-bad-500/25"
        >
          ✉ {t(locale, 'detention.letter')}
        </button>
      )}
    </div>
  )
}
