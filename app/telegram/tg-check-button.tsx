'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { tgCheckNow } from './actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function TgCheckButton() {
  const router = useRouter()
  const locale = useLocale()
  const [pending, start] = useTransition()

  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await tgCheckNow()
          if ('error' in res) notify('error', res.error)
          else {
            notify(
              'ok',
              t(locale, 'telegram.check.result')
                .replace('{attached}', String(res.attached))
                .replace('{skipped}', String(res.skipped))
                .replace('{nudged}', String(res.nudged)),
            )
            router.refresh()
          }
        })
      }
      className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-white/25 hover:text-white disabled:opacity-40"
    >
      {pending ? t(locale, 'telegram.check.checking') : t(locale, 'telegram.check.checkNow')}
    </button>
  )
}
