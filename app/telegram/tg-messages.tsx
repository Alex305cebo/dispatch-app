'use client'

// Лента одного открытого разговора.
//
// Раньше она рисовалась на сервере, а свежесть держал TgSendBox, вызывавший
// router.refresh() каждые 15 секунд. Это перерисовывало ВЕСЬ маршрут /telegram:
// список диалогов из API Telegram, данные аккаунта, карту чатов, listTrucks и по
// одному resolveTruckForChat на КАЖДЫЙ диалог — то есть N+1 поверх живых сетевых
// вызовов — только чтобы узнать, не появилось ли новой строки в одной беседе.
// Теперь опрашивается ровно эта беседа.

import { useEffect, useState } from 'react'
import { TgImage } from './tg-image'
import { TgAttachButton } from './tg-attach-button'
import { tgPollMessages } from './actions'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale } from '@/lib/i18n'
import type { TgMsg } from '@/lib/telegram'


function humanSize(bytes: number, locale: Locale): string {
  if (bytes < 1024) return `${bytes} ${t(locale, 'telegram.page.bytesUnit')}`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ${t(locale, 'telegram.page.kbUnit')}`
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${t(locale, 'telegram.page.mbUnit')}`
}

function when(iso: string | null, locale: Locale): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  const dl = locale === 'ru' ? 'ru-RU' : 'en-US'
  return today
    ? d.toLocaleTimeString(dl, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(dl, { day: '2-digit', month: '2-digit' })
}

const POLL_MS = 15_000

export function TgMessages({
  chatId,
  phone,
  initial,
}: {
  chatId: string
  phone: string | null
  initial: TgMsg[]
}) {
  const locale = useLocale()
  const [list, setList] = useState(initial)

  // Новый чат — новая лента: без этого при переключении на другой разговор на
  // экране на мгновение осталась бы переписка предыдущего.
  useEffect(() => setList(initial), [chatId, initial])

  useEffect(() => {
    let alive = true
    const tick = async () => {
      // Вкладка в фоне — не опрашиваем: диспетчер держит приложение открытым весь
      // день, и опрос свёрнутой вкладки это трафик и лимиты Telegram впустую.
      if (document.hidden) return
      const res = await tgPollMessages(chatId)
      if (alive && 'msgs' in res) setList(res.msgs)
    }
    const id = setInterval(tick, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [chatId])

  return (
        <div className="flex max-h-[58vh] flex-1 flex-col gap-1.5 overflow-y-auto p-4">
          {list.map((m) => (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
                m.out
                  ? 'self-end rounded-br-sm bg-haul-500/25 text-white'
                  : 'self-start rounded-bl-sm bg-white/8 text-white/90'
              }`}
            >
              {m.media === 'image' && (
                <>
                  <TgImage src={`/api/tg-media/${chatId}/${m.id}`} />
                  <TgAttachButton chatId={chatId} msgId={m.id} phone={phone} />
                </>
              )}
              {m.media === 'pdf' && (
                <>
                  <a
                    href={`/api/tg-media/${chatId}/${m.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-1 block overflow-hidden rounded-lg border border-white/10 bg-white/5 transition-colors hover:bg-white/8"
                  >
                    {m.hasThumb && (
                      // Page-1 preview Telegram made for the file — "видно, что внутри".
                      <img
                        src={`/api/tg-media/${chatId}/${m.id}?thumb=1`}
                        alt={t(locale, 'telegram.page.pdfPreviewAlt')}
                        className="max-h-44 w-full object-cover object-top"
                      />
                    )}
                    <span className="flex items-center gap-2 px-2.5 py-2">
                      <span className="text-[17px]">📄</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-white/90">
                          {m.fileName || t(locale, 'telegram.page.defaultDocName')}
                        </span>
                        <span className="block text-[11px] text-white/45">
                          {m.fileSize ? `${humanSize(m.fileSize, locale)} · ` : ''}{t(locale, 'telegram.page.openPdf')}
                        </span>
                      </span>
                    </span>
                  </a>
                  <TgAttachButton chatId={chatId} msgId={m.id} phone={phone} />
                </>
              )}
              {m.media === 'other' && !m.text && <span className="text-white/45">{t(locale, 'telegram.page.attachment')}</span>}
              {m.text}
              <span className="mt-0.5 block text-right text-[10px] text-white/40">
                {when(m.at, locale)}
              </span>
            </div>
          ))}
      </div>
  )
}
