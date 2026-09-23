'use client'

// «+ Добавить чат» над списком чатов: окно с поиском по всем диалогам аккаунта,
// у каждого — кнопка «Добавить», срабатывает сразу, без отдельного «Сохранить».
// Раньше добавляли только галочками в длинном списке внизу страницы — после
// переподключения Telegram его было не найти (09/23/26).

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { setMyShownChats } from './actions'
import { notify } from '@/lib/notify'
import type { TgDialog } from '@/lib/telegram'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { usDate } from '@/lib/fmt'

export function TgAddChat({ dialogs, shown }: { dialogs: TgDialog[]; shown: string[] }) {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  // Своё состояние, чтобы кнопка переключалась сразу, не дожидаясь перерисовки страницы.
  const [shownSet, setShownSet] = useState(() => new Set(shown))
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => setShownSet(new Set(shown)), [shown])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    input.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  const needle = q.trim().toLowerCase()
  const digits = needle.replace(/[^0-9]/g, '')
  const list = useMemo(
    () =>
      dialogs.filter(
        (d) => !needle || d.name.toLowerCase().includes(needle) || (!!digits && (d.phone ?? '').includes(digits)),
      ),
    [dialogs, needle, digits],
  )

  function toggle(d: TgDialog) {
    const next = new Set(shownSet)
    const adding = !next.has(d.id)
    if (adding) next.add(d.id)
    else next.delete(d.id)
    setShownSet(next)
    setBusy(d.id)
    start(async () => {
      const res = await setMyShownChats([...next])
      setBusy(null)
      if (res?.error) {
        notify('error', res.error)
        setShownSet(new Set(shownSet))
      } else {
        notify('ok', (adding ? t(locale, 'telegram.add.added') : t(locale, 'telegram.add.removed')).replace('{name}', d.name))
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 border-b border-white/8 bg-haul-500/10 px-3.5 py-2.5 text-base font-semibold text-haul-400 transition-colors hover:bg-haul-500/20"
      >
        <span className="text-lg leading-none">+</span> {t(locale, 'telegram.add.button')}
      </button>

      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 p-3 pt-[8vh] backdrop-blur-sm sm:p-6 sm:pt-[10vh]"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="panel flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden p-0"
            >
              <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
                <span className="min-w-0 flex-1 text-md font-semibold">{t(locale, 'telegram.add.title')}</span>
                <span className="nums shrink-0 text-sm text-t3">
                  {t(locale, 'telegram.add.count').replace('{n}', String(shownSet.size))}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t(locale, 'userPanel.close')}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-lg text-t3 transition-colors hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="border-b border-white/8 p-3">
                <input
                  ref={input}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t(locale, 'telegram.settings.search')}
                  className="w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2.5 text-base text-white outline-none placeholder:text-t3 focus:border-haul-500"
                />
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto">
                {list.length === 0 ? (
                  <li className="p-6 text-center text-base text-t3">
                    {dialogs.length === 0 ? t(locale, 'telegram.settings.noneVisible') : t(locale, 'telegram.settings.noMatch')}
                  </li>
                ) : (
                  list.map((d) => {
                    const on = shownSet.has(d.id)
                    return (
                      <li key={d.id} className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-haul-500/15 text-base font-semibold text-haul-400">
                          {d.name.trim().charAt(0).toUpperCase() || '?'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-base font-medium">{d.name}</span>
                            {!d.isUser && (
                              <span className="shrink-0 rounded-full bg-white/8 px-1.5 py-0.5 text-2xs text-t3">
                                {t(locale, 'telegram.settings.group')}
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-t3">
                            {[d.phone ? `+${d.phone.replace(/^\+/, '')}` : null, d.lastAt ? usDate(d.lastAt) : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <button
                          type="button"
                          disabled={busy === d.id}
                          onClick={() => toggle(d)}
                          className={`min-h-9 shrink-0 rounded-lg px-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
                            on
                              ? 'border border-good-500/30 bg-good-500/10 text-good-400 hover:border-bad-500/40 hover:bg-bad-500/10 hover:text-bad-400'
                              : 'bg-haul-500 text-white hover:bg-haul-400'
                          }`}
                        >
                          {on ? t(locale, 'telegram.add.inList') : t(locale, 'telegram.add.add')}
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
