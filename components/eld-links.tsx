'use client'

import { Button } from '@/components/button'
// Подключение отслеживания. Два пути, потому что ELD у парков разные:
//
// • ссылки на трак — их даёт ZigZag кнопкой «Live Share», ключ не нужен;
// • токен API — так подключается Samsara: её публичная ссылка ведёт на
//   страницу-приложение, читать которую с сервера нечем.
//
// Вендоры в подсказках названы прямо. Раньше экран был нарочно обезличен — и первый
// же владелец с Samsara вставил её ссылку в поле для ZigZag, получил «ошибки: 1» и
// не понял ничего. Обезличенность стоила дороже, чем стоила.

import { useState, useTransition } from 'react'
import { saveEldShareLinks, saveSamsaraToken } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function EldLinks({ count, samsaraOn }: { count: number; samsaraOn: boolean }) {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [token, setToken] = useState('')
  const [pending, start] = useTransition()

  function save() {
    start(async () => {
      const res = await saveEldShareLinks(text)
      if ('error' in res) notify('error', res.error)
      else {
        notify(
          res.updated > 0 ? 'ok' : 'warn',
          `${t(locale, 'tracking.linksSavedPrefix')}${res.saved}${t(locale, 'tracking.updatedTrucksMid')}${res.updated}` +
            (res.errors.length ? `${t(locale, 'tracking.errorsSuffix')}${res.errors.length}` : ''),
        )
      }
    })
  }

  function saveToken() {
    start(async () => {
      const res = await saveSamsaraToken(token)
      if ('error' in res) {
        notify('error', res.error === 'bad_token' ? t(locale, 'tracking.err.samsaraToken') : res.error)
        return
      }
      setToken('')
      notify(
        res.updated > 0 ? 'ok' : 'warn',
        `${t(locale, 'tracking.updatedTrucks')}${res.updated}` +
          (res.errors.length ? `${t(locale, 'tracking.errorsSuffix')}${res.errors.length}` : ''),
      )
    })
  }

  const connected = count + (samsaraOn ? 1 : 0)
  const field =
    'w-full rounded-lg border border-white/8 bg-ink-900/80 px-3 py-2 text-[12px] text-white outline-none focus:border-haul-500'

  return (
    <div className="mb-4 rounded-xl border border-white/8 bg-ink-900/50 p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-[12px] font-semibold text-white/70"
      >
        <span>
          {t(locale, 'tracking.trackingHeader')}{' '}
          {connected > 0 && `${t(locale, 'tracking.connectedSuffix')}${connected}`}
        </span>
        <span className="text-white/45">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-4">
          <div>
            <p className="mb-2 text-[11px] leading-relaxed text-white/55">{t(locale, 'tracking.eldLinksInfo')}</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder={t(locale, 'tracking.eldLinksPlaceholder')}
              className={field}
            />
            <Button variant="primary" size="sm" className="mt-2" disabled={pending || !text.trim()} onClick={save}>
              {pending ? t(locale, 'tracking.savingUpdating') : t(locale, 'tracking.saveAndUpdate')}
            </Button>
          </div>

          <div className="border-t border-white/8 pt-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/55">
              {t(locale, 'tracking.samsaraTitle')}
              {samsaraOn && <span className="ml-2 text-good-400">{t(locale, 'tracking.samsaraOn')}</span>}
            </p>
            <p className="mb-2 text-[11px] leading-relaxed text-white/55">{t(locale, 'tracking.samsaraInfo')}</p>
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t(locale, samsaraOn ? 'tracking.samsaraReplace' : 'tracking.samsaraPlaceholder')}
              className={field}
            />
            <Button
              variant="primary"
              size="sm"
              className="mt-2"
              disabled={pending || !token.trim()}
              onClick={saveToken}
            >
              {pending ? t(locale, 'tracking.savingUpdating') : t(locale, 'tracking.saveAndUpdate')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
