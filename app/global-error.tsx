'use client'

// Экран, когда упал не одна страница, а сам макет (меню, шапка) или сервер не смог
// собрать страницу вообще. Без этого файла Next отдаёт свой чёрный «500 Internal Server
// Error» без единой кнопки — так владелец увидел ссылку из письма (10/22/26). Здесь —
// человеческие слова, «Обновить» и «Войти», и запись в «Сбои» Админки (путь и digest),
// чтобы причину было видно, а не гадать. Макета здесь нет — стили свои, строкой.

import { useEffect } from 'react'
import { logClientError } from '@/app/actions'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('global error', error.digest ?? '', error)
    void logClientError({
      path: typeof location !== 'undefined' ? `${location.pathname}${location.search}` : '',
      message: `[global] ${error.message || String(error)}`,
      digest: error.digest,
      agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    }).catch(() => undefined)
  }, [error])

  const btn = {
    padding: '10px 18px',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
  } as const

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f6f7f9', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color: '#1f2937' }}>
        <main style={{ maxWidth: 440, margin: 16, padding: 24, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>Страница не открылась · Page did not load</h1>
          <p style={{ fontSize: 15, lineHeight: 1.5, color: '#4b5563', marginTop: 8 }}>
            Обычно помогает обновить страницу через минуту. Если вы не вошли — войдите, и откроется та же страница.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            <button type="button" onClick={() => reset()} style={{ ...btn, background: '#f97316', color: '#fff', border: 'none' }}>
              Обновить · Retry
            </button>
            <a href="/login" style={{ ...btn, background: '#fff', color: '#1f2937', border: '1px solid #d1d5db' }}>
              Войти · Sign in
            </a>
          </div>
          {error.digest && <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 16 }}>Код: {error.digest}</p>}
        </main>
      </body>
    </html>
  )
}
