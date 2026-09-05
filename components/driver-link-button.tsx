'use client'

import { useState } from 'react'
import { Check, Copy, Smartphone } from 'lucide-react'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { agoText } from '@/lib/fmt'

/**
 * Страница водителя — своим блоком на карточке трака, а не мелкой кнопкой в углу.
 *
 * Громкость зависит от состояния: пока водитель ни разу не открывал ссылку, блок
 * подсвечен и зовёт отправить её; открывал — тихая строка «открывал N назад».
 * Ссылка готова сразу (считает страница), поэтому кнопки отправки видны без
 * лишнего нажатия. Текст сообщения — ПО-АНГЛИЙСКИ: водители говорят на разных
 * языках, английский понимают все, и сама страница откроется у них по-английски.
 */
export function DriverLinkButton({
  url,
  driverPhone,
  seenAt,
}: {
  url: string
  driverPhone: string | null
  seenAt: string | null
}) {
  const locale = useLocale()
  const [copied, setCopied] = useState(false)
  const fresh = !seenAt

  const text = `Hi! This is your load page: ${url}\nOpen it on your phone and save it. Tap "Arrived", "Loaded", "Delivered" and send BOL/POD photos there — no need to call. Works without any app.`
  // Telegram и SMS. Больше ничего: водители компании сидят в Telegram.
  const share = [
    {
      name: 'Telegram',
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Your load page — tap Arrived / Loaded / Delivered and send BOL/POD photos. No app needed.')}`,
      cls: 'bg-[#2AABEE]/15 text-[#2AABEE] hover:bg-[#2AABEE]/25',
    },
    ...(driverPhone ? [{ name: 'SMS', href: `sms:${driverPhone}?&body=${encodeURIComponent(text)}`, cls: 'bg-white/10 text-white/85 hover:bg-white/20' }] : []),
  ]

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      notify('ok', t(locale, 'driver.link.copied'), url)
    } catch {
      window.prompt(t(locale, 'driver.link.button'), url)
    }
  }

  return (
    <div
      className={`mt-3 rounded-2xl border p-3 text-left ${
        fresh ? 'border-haul-500/45 bg-haul-500/[0.10]' : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Smartphone size={16} strokeWidth={2.2} className={fresh ? 'text-haul-300' : 'text-white/55'} />
        <span className="text-[13.5px] font-semibold">{t(locale, 'driver.link.title')}</span>
        <span className={`nums ml-auto text-[11.5px] ${fresh ? 'text-haul-300' : 'text-good-400/80'}`}>
          {seenAt ? t(locale, 'driver.link.seen').replace('{ago}', agoText(seenAt, locale)) : t(locale, 'driver.link.neverSeen')}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-white/60">{t(locale, 'driver.link.info')}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[11.5px] uppercase tracking-wider text-white/45">{t(locale, 'driver.link.share')}</span>
        {share.map((s) => (
          <a
            key={s.name}
            href={s.href}
            target="_blank"
            rel="noreferrer"
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${s.cls}`}
          >
            {s.name}
          </a>
        ))}
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-medium text-white/80 hover:border-white/35"
        >
          {copied ? <Check size={13} strokeWidth={2.5} className="text-good-400" /> : <Copy size={13} strokeWidth={2.2} />}
          {t(locale, copied ? 'driver.link.copiedShort' : 'driver.link.copy')}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
        >
          {t(locale, 'driver.link.preview')}
        </a>
      </div>
    </div>
  )
}
