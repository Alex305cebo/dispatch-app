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
  const [done, setDone] = useState<{ loadId: number; loadRoute: string; created?: boolean } | null>(null)

  if (done) {
    return (
      <Link
        href={`/loads/${done.loadId}`}
        className="mb-1 flex items-center gap-1.5 rounded-lg bg-good-500/15 px-2.5 py-1.5 text-[11.5px] font-medium text-good-400 transition-colors hover:bg-good-500/22"
      >
        {/* «Создан груз» и «В грузе» — разные события, и путать их нельзя: первое
            означает, что рейса раньше не было и он появился из этой бумаги. */}
        {t(locale, done.created ? 'telegram.attach.createdLoad' : 'telegram.attach.inLoad').replace(
          '{route}',
          done.loadRoute,
        )}
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
            notify(
              'ok',
              t(locale, res.created ? 'telegram.attach.created' : 'telegram.attach.added').replace(
                '{route}',
                res.loadRoute,
              ),
            )
            setDone({ loadId: res.loadId, loadRoute: res.loadRoute, created: res.created })
          }
        })
      }
      className="mb-1 flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11.5px] font-medium text-white/80 transition-colors hover:bg-white/16 disabled:cursor-default disabled:opacity-60"
    >
      {pending ? t(locale, 'telegram.attach.adding') : t(locale, 'telegram.attach.toDriverLoad')}
    </button>
  )
}
