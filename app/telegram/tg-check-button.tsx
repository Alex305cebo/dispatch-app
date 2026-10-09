'use client'

import { RefreshCw } from 'lucide-react'
import { useTransition } from 'react'
import { Button } from '@/components/button'
import { tgCheckNow } from './actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function TgCheckButton() {
  const locale = useLocale()
  const [pending, start] = useTransition()

  return (
    // Главная кнопка шапки «Telegram» — того же вида, что у других разделов.
    <Button
      type="button"
      variant="secondary"
      loading={pending}
      icon={<RefreshCw size={14} strokeWidth={2.25} />}
      onClick={() =>
        start(async () => {
          const res = await tgCheckNow()
          if ('error' in res) notify('error', res.error)
          else {
            notify(
              'ok',
              t(locale, 'telegram.check.result')
                .replace('{attached}', String(res.attached))
                .replace('{skipped}', String(res.skipped)),
            )
          }
        })
      }
    >
      {pending ? t(locale, 'telegram.check.checking') : t(locale, 'telegram.check.checkNow')}
    </Button>
  )
}
