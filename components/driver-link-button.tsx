'use client'

import { useState, useTransition } from 'react'
import { Smartphone } from 'lucide-react'
import { getDriverLink } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { agoText } from '@/lib/fmt'
import { Info } from '@/components/info'

/**
 * «Ссылка водителю» на карточке трака. Нажал — ссылка в буфере и раскрыты кнопки
 * «Отправить в WhatsApp / Telegram / SMS» с готовым текстом ПО-АНГЛИЙСКИ: водители
 * говорят на разных языках, а английский понимают все, и сама страница у них
 * откроется по-английски. Рядом — когда водитель последний раз её открывал.
 */
export function DriverLinkButton({ truckId, driverPhone, seenAt }: { truckId: number; driverPhone: string | null; seenAt: string | null }) {
  const locale = useLocale()
  const [pending, start] = useTransition()
  const [url, setUrl] = useState<string | null>(null)

  const text = (u: string) =>
    `Hi! This is your load page: ${u}\nOpen it on your phone and keep it. Tap "Arrived", "Loaded", "Delivered" and send BOL/POD photos there — no need to call. It works without any app.`
  const digits = (driverPhone ?? '').replace(/\D/g, '')
  const wa = (u: string) => `https://wa.me/${digits ? (digits.length === 10 ? '1' + digits : digits) : ''}?text=${encodeURIComponent(text(u))}`
  const tg = (u: string) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(text(u).replace(u, '').trim())}`
  const sms = (u: string) => `sms:${driverPhone ?? ''}?&body=${encodeURIComponent(text(u))}`

  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
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
            setUrl(r.url)
            try {
              await navigator.clipboard.writeText(r.url)
              notify('ok', t(locale, 'driver.link.copied'), r.url)
            } catch {
              window.prompt(t(locale, 'driver.link.button'), r.url)
            }
          })
        }
        className="inline-flex items-center gap-1.5 rounded-full border border-haul-500/40 bg-haul-500/[0.08] px-3 py-1 text-[12.5px] font-medium text-white/90 hover:border-haul-400 hover:bg-haul-500/15 disabled:opacity-60"
      >
        <Smartphone size={13} strokeWidth={2.2} />
        {t(locale, 'driver.link.button')}
      </button>
      <Info text={t(locale, 'driver.link.info')} />
      {url && (
        <span className="inline-flex items-center gap-1 text-[12px] text-white/60">
          {t(locale, 'driver.link.share')}
          <a href={wa(url)} target="_blank" rel="noreferrer" className="rounded-full bg-[#25D366]/15 px-2.5 py-0.5 font-semibold text-[#25D366]">
            WhatsApp
          </a>
          <a href={tg(url)} target="_blank" rel="noreferrer" className="rounded-full bg-[#2AABEE]/15 px-2.5 py-0.5 font-semibold text-[#2AABEE]">
            Telegram
          </a>
          {driverPhone && (
            <a href={sms(url)} className="rounded-full bg-white/10 px-2.5 py-0.5 font-semibold text-white/80">
              SMS
            </a>
          )}
        </span>
      )}
      <span className="text-[11px] text-white/45">
        {seenAt ? t(locale, 'driver.link.seen').replace('{ago}', agoText(seenAt, locale)) : t(locale, 'driver.link.neverSeen')}
      </span>
    </span>
  )
}
