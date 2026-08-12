'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { tgAttachToLoad } from './actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function TgAttachButton({
  chatId,
  msgId,
  phone,
}: {
  chatId: string
  msgId: number
  phone: string | null
}) {
  const locale = useLocale()
  const [pending, start] = useTransition()
  const [done, setDone] = useState<{ loadId: number; loadRoute: string } | null>(null)

  if (done) {
    return (
      <Link
        href={`/loads/${done.loadId}`}
        className="mb-1 flex items-center gap-1.5 rounded-lg bg-good-500/15 px-2.5 py-1.5 text-[11.5px] font-medium text-good-400 transition-colors hover:bg-good-500/22"
      >
        {t(locale, 'telegram.attach.inLoad').replace('{route}', done.loadRoute)}
      </Link>
    )
  }

  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await tgAttachToLoad(chatId, msgId, phone)
          if ('error' in res) notify('error', res.error)
          else {
            notify('ok', t(locale, 'telegram.attach.added').replace('{route}', res.loadRoute))
            setDone({ loadId: res.loadId, loadRoute: res.loadRoute })
          }
        })
      }
      className="mb-1 flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11.5px] font-medium text-white/80 transition-colors hover:bg-white/16 disabled:cursor-default disabled:opacity-60"
    >
      {pending ? t(locale, 'telegram.attach.adding') : t(locale, 'telegram.attach.toDriverLoad')}
    </button>
  )
}
