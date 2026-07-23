'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { tgDisconnectAccount } from './actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function TgDisconnectButton() {
  const router = useRouter()
  const locale = useLocale()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="shrink-0 text-[12px] text-white/45 underline decoration-dotted transition-colors hover:text-white/75"
      >
        {t(locale, 'telegram.disconnect.wrongAccount')}
      </button>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-2 text-[12px]">
      <span className="text-white/55">{t(locale, 'telegram.disconnect.confirmText')}</span>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            await tgDisconnectAccount()
            notify('ok', t(locale, 'telegram.disconnect.done'))
            router.refresh()
          })
        }
        className="rounded-lg border border-bad-500/25 px-2.5 py-1 text-bad-400 transition-colors hover:border-bad-500/50 disabled:opacity-40"
      >
        {pending ? '…' : t(locale, 'telegram.disconnect.yes')}
      </button>
      <button onClick={() => setConfirming(false)} className="text-white/55 hover:text-white/85">
        {t(locale, 'telegram.disconnect.cancel')}
      </button>
    </div>
  )
}
