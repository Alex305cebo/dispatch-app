'use client'

// Админка → «Карта для брокеров»: одна ссылка /track/<токен> на всех брокеров
// (lib/broker-map.ts). Создать, скопировать, открыть, перевыпустить, выключить.
// Перевыпуск и выключение ломают ссылку у всех, кому её дали, — поэтому спрашиваем.

import { useEffect, useState, useTransition } from 'react'
import { Check, Copy, ExternalLink, Map as MapIcon, Power, RefreshCw } from 'lucide-react'
import { Button } from '@/components/button'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { newBrokerMapLink, offBrokerMapLink } from './actions'

export function BrokerMapLink({ token: initial }: { token: string | null }) {
  const locale = useLocale()
  const [token, setToken] = useState(initial)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()
  // Домен — тот, на котором открыта админка: ссылка уходит брокеру отсюда же.
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  const url = token ? `${origin}/track/${token}` : ''

  function issue() {
    if (token && !window.confirm(t(locale, 'admin.brokerMap.renewConfirm'))) return
    start(async () => {
      const res = await newBrokerMapLink()
      if ('error' in res) return notify('error', res.error)
      setToken(res.token)
      setCopied(false)
    })
  }

  function off() {
    if (!window.confirm(t(locale, 'admin.brokerMap.offConfirm'))) return
    start(async () => {
      const res = await offBrokerMapLink()
      if (res?.error) return notify('error', res.error)
      setToken(null)
      notify('ok', t(locale, 'admin.brokerMap.turnedOff'))
    })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      notify('ok', t(locale, 'admin.brokerMap.copied'), url)
    } catch {
      window.prompt(t(locale, 'admin.brokerMap.copy'), url)
    }
  }

  if (!token)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-t2">{t(locale, 'admin.brokerMap.none')}</p>
        <Button variant="primary" disabled={pending} onClick={issue} icon={<MapIcon size={14} aria-hidden />}>
          {t(locale, 'admin.brokerMap.create')}
        </Button>
      </div>
    )

  return (
    <div className="flex flex-col gap-2.5">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="nums w-full rounded-lg border border-white/8 bg-ink-950/80 px-2.5 py-1.5 text-sm text-t1 outline-none focus:border-haul-500"
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={copy} icon={copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}>
          {t(locale, 'admin.brokerMap.copy')}
        </Button>
        <Button href={url} external target="_blank" rel="noreferrer" variant="secondary" size="sm" icon={<ExternalLink size={14} aria-hidden />}>
          {t(locale, 'admin.brokerMap.open')}
        </Button>
        <Button variant="secondary" size="sm" disabled={pending} onClick={issue} icon={<RefreshCw size={14} aria-hidden />}>
          {t(locale, 'admin.brokerMap.renew')}
        </Button>
        <Button variant="secondary" size="sm" disabled={pending} onClick={off} icon={<Power size={14} aria-hidden />}>
          {t(locale, 'admin.brokerMap.off')}
        </Button>
      </div>
    </div>
  )
}
