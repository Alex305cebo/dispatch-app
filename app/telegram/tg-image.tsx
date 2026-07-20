'use client'

// Thumbnail → full-screen lightbox instead of navigating to the raw image URL —
// clicking a driver's photo used to leave the chat entirely (no back/close, and
// inside the installed PWA there's no browser chrome to escape it with).

import { useEffect, useState } from 'react'
import { notify } from '@/lib/notify'

export function TgImage({ src }: { src: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mb-1 block">
        <img src={src} alt="Вложение" className="max-h-64 rounded-lg" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <div className="absolute right-3 top-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <a
              href={src}
              download
              title="Скачать"
              className="flex size-9 items-center justify-center rounded-full bg-white/10 text-[15px] text-white/85 transition-colors hover:bg-white/20"
            >
              ⭳
            </a>
            <button
              type="button"
              title="Скопировать ссылку"
              onClick={() => {
                navigator.clipboard.writeText(location.origin + src)
                notify('ok', 'Ссылка скопирована')
              }}
              className="flex size-9 items-center justify-center rounded-full bg-white/10 text-[15px] text-white/85 transition-colors hover:bg-white/20"
            >
              🔗
            </button>
            <button
              type="button"
              title="Закрыть"
              onClick={() => setOpen(false)}
              className="flex size-9 items-center justify-center rounded-full bg-white/10 text-[15px] text-white/85 transition-colors hover:bg-white/20"
            >
              ✕
            </button>
          </div>
          <img
            src={src}
            alt="Вложение"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain"
          />
        </div>
      )}
    </>
  )
}
