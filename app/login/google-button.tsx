'use client'

// Кнопка «Войти через Google». Рисует её сам Google (Google Identity Services):
// свой скрипт, своя разметка, свои правила бренда — нам остаётся отдать контейнер
// и принять токен.
//
// Скрипт грузится только когда установке задан client_id. Не задан — компонента
// нет вовсе, и вход работает по-старому, паролем.

import { useEffect, useRef, useState, useTransition } from 'react'
import { signInWithGoogle } from './google-actions'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void
          renderButton: (el: HTMLElement, o: Record<string, string | number>) => void
        }
      }
    }
  }
}

const SRC = 'https://accounts.google.com/gsi/client'

export function GoogleButton({
  clientId,
  locale: localeProp,
  onWait,
  onError,
}: {
  clientId: string
  locale: string
  /** Аккаунт создан, но ждёт подтверждения администратором. */
  onWait: () => void
  onError: (msg: string) => void
}) {
  const locale = useLocale()
  const box = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!clientId) return
    // Скрипт один на страницу: второй вызов GIS не переживает.
    const existing = document.querySelector(`script[src="${SRC}"]`)
    if (existing) {
      setReady(true)
      return
    }
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () => setReady(true)
    s.onerror = () => onError(t(locale, 'login.error.googleFailed'))
    document.head.appendChild(s)
  }, [clientId, locale, onError])

  useEffect(() => {
    if (!ready || !box.current || !window.google) return
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (res) =>
        start(async () => {
          const out = await signInWithGoogle(res.credential)
          if ('error' in out) onError(out.error)
          else if ('wait' in out) onWait()
          // Полная перезагрузка, а не router.refresh(): middleware переписал этот
          // ответ поверх запрошенного адреса, и обычный запрос той же страницы —
          // единственный честный способ показать её уже с сессией.
          else window.location.reload()
        }),
    })
    window.google.accounts.id.renderButton(box.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      locale: localeProp,
      width: 320,
    })
  }, [ready, clientId, localeProp, onWait, onError])

  if (!clientId) return null
  return (
    <div className="mt-3">
      <div ref={box} className={pending ? 'pointer-events-none opacity-50' : ''} />
      {!ready && <p className="text-[12px] text-white/45">{t(locale, 'login.google.loading')}</p>}
    </div>
  )
}
