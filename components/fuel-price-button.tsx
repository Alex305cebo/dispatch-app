'use client'

// «Обновить цену топлива» одной кнопкой: тянет среднюю цену дизеля по США (EIA) и
// сразу пишет её в трак или во весь парк. Раньше была ссылкой мелким текстом внутри
// формы трака и только подставляла число в поле — её не находили.

import { Fuel } from 'lucide-react'
import { useTransition } from 'react'
import { Button } from '@/components/button'
import { applyDieselPrice } from '@/app/actions'
import { notify } from '@/lib/notify'
import { t, type Locale } from '@/lib/i18n'

export function FuelPriceButton({
  truckId,
  locale,
  size = 'sm',
  variant = 'secondary',
}: {
  /** null — всему парку. */
  truckId: number | null
  locale: Locale
  size?: 'sm' | 'md'
  variant?: 'primary' | 'secondary' | 'ghost'
}) {
  const [busy, start] = useTransition()
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      loading={busy}
      icon={<Fuel size={14} strokeWidth={2.25} />}
      onClick={(e) => {
        // Внутри <summary> клик по кнопке не должен сворачивать блок.
        e.preventDefault()
        e.stopPropagation()
        start(async () => {
          const res = await applyDieselPrice(truckId)
          if ('error' in res) {
            notify('warn', `${t(locale, 'trucks.form.dieselFailed')} ${res.error}`)
            return
          }
          notify(
            'ok',
            t(locale, 'trucks.fuel.applied')
              .replace('{price}', res.price.toFixed(2))
              .replace('{asOf}', res.asOf)
              .replace('{n}', String(res.count)),
          )
        })
      }}
    >
      {t(locale, truckId === null ? 'trucks.fuel.applyAll' : 'trucks.form.dieselCurrent')}
    </Button>
  )
}
