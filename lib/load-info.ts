/**
 * «Load Info» — текст груза в том виде, в каком его шлют водителю в Telegram
 * (Alex, 26.10.2026, скрин чата Juan#1935): LOAD ID, пикап и доставка с адресом,
 * временем и Ref, ставка, груз, вес. Кнопка на плашке «Трак ⇄ Груз» копирует его.
 *
 * Груз из рейт-кона уже хранит этот текст (driverInfo, lib/ratecon.ts
 * formatDriverInfo) — берём его, с полными адресами складов, как плитка «Driver
 * Information». Груз, заведённый руками, собираем в тот же вид из полей груза.
 */

import { RULE } from './ratecon.ts'
import { withAddresses } from './driver-info-zip.ts'
import { usDate } from './fmt.ts'

export type LoadInfoInput = {
  driverInfo: string | null
  referenceId: string | null
  origin: string | null
  destination: string | null
  pickupAddress: string | null
  deliveryAddress: string | null
  pickupDate: string | null
  pickupTime: string | null
  deliveryDate: string | null
  deliveryTime: string | null
  rate: number
}

export function loadInfoText(l: LoadInfoInput): string {
  if (l.driverInfo?.trim())
    return withAddresses(l.driverInfo, {
      pickup: l.pickupAddress,
      delivery: l.deliveryAddress,
      origin: l.origin,
      destination: l.destination,
    })

  const out: string[] = [`LOAD ID: #${l.referenceId?.trim() || '—'}`, '']
  const stop = (title: string, addr: string | null, city: string | null, date: string | null, time: string | null) => {
    out.push(title, '', addr?.trim() || city?.trim() || '—', '', RULE)
    // Время из рейт-кона часто уже с датой («10/25/26 07:00 FCFS») — тогда дату не дублируем.
    const t = time?.trim() ?? ''
    const when = /\d{1,2}\/\d{1,2}/.test(t) ? t : [date ? usDate(date) : '', t].filter(Boolean).join(' ')
    if (when) out.push(`Time: ${when}`, RULE)
    out.push('')
  }
  stop('Pick up Address:', l.pickupAddress, l.origin, l.pickupDate, l.pickupTime)
  stop('Delivery Address:', l.deliveryAddress, l.destination, l.deliveryDate, l.deliveryTime)
  if (l.rate > 0) out.push(`Rate: $${l.rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
