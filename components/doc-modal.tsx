'use client'

// Документ в окне поверх страницы, а не отдельной страницей.
//
// Раньше «Открыть Rate Con» и все ссылки на документы вели на /view/[id] — то есть
// диспетчер уходил со своего места, смотрел бумагу и возвращался кнопкой «назад»,
// теряя прокрутку, открытые секции и выбранную вкладку. Сам просмотрщик
// (components/doc-viewer.tsx) при этом уже был готов работать где угодно: он рисует
// PDF через pdf.js и не зависит от того, что вокруг.
//
// Страница /view/[id] намеренно оставлена: на неё ведут ссылки из писем и Telegram,
// её можно открыть в новой вкладке, и она остаётся запасным ходом, если окно почему-то
// не подошло — ссылка на неё есть в шапке окна.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { DocViewer } from '@/components/doc-viewer'
import { docMeta } from '@/app/actions'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function DocModal({ docId, onClose }: { docId: number; onClose: () => void }) {
  const locale = useLocale()
  const [meta, setMeta] = useState<{ title: string; mime: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void docMeta(docId).then((res) => {
      if (!alive) return
      if ('error' in res) setErr(res.error)
      else setMeta(res)
    })
    return () => {
      alive = false
    }
  }, [docId])

  // Escape закрывает, а прокрутка страницы под окном замирает — иначе колесо
  // прокручивает список позади вместо самого документа.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  // Портал в <body>: окно должно лежать поверх всего, а его предки — карточки со
  // своими transform и overflow:hidden — иначе бы его обрезали и прижали.
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel flex max-h-full w-full max-w-4xl flex-col overflow-hidden p-0"
      >
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-2.5">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
            {meta?.title ?? t(locale, 'common.loading')}
          </span>
          <a
            href={`/view/${docId}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-[11.5px] text-haul-300 hover:underline"
          >
            {t(locale, 'docModal.openPage')}
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'userPanel.close')}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-[15px] text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {err ? (
            <p className="p-6 text-center text-[13px] text-bad-400">{err}</p>
          ) : meta ? (
            <DocViewer id={docId} mime={meta.mime} />
          ) : (
            <p className="p-6 text-center text-[13px] text-white/45">{t(locale, 'common.loading')}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
