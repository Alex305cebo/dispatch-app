'use client'

import { useEffect, useState } from 'react'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

const EVERY_MS = 3 * 60_000
const SEEN_KEY = 'alerts:seen'

type Item = { id: string; kind: 'warn' | 'error'; text: string; href: string }

function seen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
function remember(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-300)))
  } catch {
    /* приватный режим — просто покажем ещё раз */
  }
}

/**
 * Сторож событий: раз в три минуты спрашивает /api/alerts и о НОВОМ (чего ещё не
 * показывал) говорит дважды — в колокольчик приложения и, если разрешено,
 * системным уведомлением браузера, чтобы диспетчер узнал, даже когда вкладка не
 * на виду. Разрешение спрашивается один раз кнопкой в меню аккаунта
 * (components/alert-toggle.tsx), не само.
 */
export function AlertWatch({ enabled }: { enabled: boolean }) {
  const locale = useLocale()
  useEffect(() => {
    if (!enabled) return
    let stop = false
    const tick = async () => {
      if (document.hidden && Notification.permission !== 'granted') return
      try {
        const r = await fetch('/api/alerts', { cache: 'no-store' })
        if (!r.ok) return
        const { items } = (await r.json()) as { items: Item[] }
        // Первый запуск на этом устройстве: не вываливать всё накопившееся разом —
        // запомнить как виденное и дальше сообщать только о новом.
        let first = false
        try {
          first = localStorage.getItem(SEEN_KEY) === null
        } catch {
          first = false
        }
        const was = seen()
        if (first) {
          for (const i of items) was.add(i.id)
          remember(was)
          return
        }
        const fresh = items.filter((i) => !was.has(i.id))
        if (!fresh.length || stop) return
        for (const i of fresh) {
          notify(i.kind === 'error' ? 'error' : 'warn', i.text)
          if (Notification.permission === 'granted') {
            const n = new Notification(t(locale, 'alerts.title'), { body: i.text, tag: i.id })
            n.onclick = () => {
              window.focus()
              location.assign(i.href)
            }
          }
        }
        for (const i of items) was.add(i.id)
        remember(was)
      } catch {
        /* сеть моргнула — в следующий раз */
      }
    }
    void tick()
    const id = setInterval(tick, EVERY_MS)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [enabled, locale])
  return null
}

/** Кнопка в меню аккаунта: включить/выключить уведомления браузера. */
export function AlertToggle() {
  const locale = useLocale()
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default')
  useEffect(() => {
    setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  }, [])
  if (perm === 'unsupported') return null
  return (
    <button
      type="button"
      onClick={async () => {
        if (perm === 'granted') {
          notify('msg', t(locale, 'alerts.howToDisable'))
          return
        }
        const p = await Notification.requestPermission()
        setPerm(p)
        if (p === 'granted') {
          new Notification(t(locale, 'alerts.title'), { body: t(locale, 'alerts.enabled') })
        }
      }}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-[13px] hover:bg-white/5"
    >
      <span>🔔 {t(locale, 'alerts.toggle')}</span>
      <span className={`text-[11px] ${perm === 'granted' ? 'text-good-400' : perm === 'denied' ? 'text-bad-400' : 'text-white/45'}`}>
        {t(locale, perm === 'granted' ? 'alerts.on' : perm === 'denied' ? 'alerts.blocked' : 'alerts.off')}
      </span>
    </button>
  )
}
