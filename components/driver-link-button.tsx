'use client'

import { useTransition } from 'react'
import { Smartphone } from 'lucide-react'
import { getDriverLink } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { Info } from '@/components/info'

/** «Ссылка водителю» на карточке трака: копирует постоянную ссылку на страницу
 * водителя (app/d/[token]). Один раз отправил в мессенджер — дальше водитель сам
 * жмёт «Загрузился» / «Выгрузился» и шлёт фото. */
export function DriverLinkButton({ truckId }: { truckId: number }) {
  const locale = useLocale()
  const [pending, start] = useTransition()
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await getDriverLink(truckId)
            if ('error' in r) {
              notify('warn', r.error === 'demo' ? t(locale, 'actions.demoReadOnly') : r.error)
              return
            }
            try {
              await navigator.clipboard.writeText(r.url)
              notify('ok', t(locale, 'driver.link.copied'), r.url)
            } catch {
              window.prompt(t(locale, 'driver.link.button'), r.url)
            }
          })
        }
        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[12.5px] font-medium text-white/85 hover:border-haul-400/60 hover:text-white disabled:opacity-60"
      >
        <Smartphone size={13} strokeWidth={2.2} />
        {t(locale, 'driver.link.button')}
      </button>
      <Info text={t(locale, 'driver.link.info')} />
    </span>
  )
}
