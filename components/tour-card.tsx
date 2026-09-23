'use client'

// Карточка «Пройти обучение» на «Обзоре». Экскурсия (components/tour.tsx) сама
// больше не всплывает: окно во весь экран поверх приложения мешало (решение
// владельца 23.09.2026). Вместо него — эта карточка: нажал на неё, экскурсия
// открылась с того шага, где её бросили.
//
// ✕ прячет карточку, но не экскурсию: она остаётся под «?» у колокольчика.
// Гостю демо — до конца визита (sessionStorage, демо общее на всех), админу —
// насовсем (localStorage). После «Готово» у админа карточку убирает сервер
// (tourSteps → null), у гостя — событие FINISHED_EVENT.

import { useEffect, useRef, useState } from 'react'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { OPEN_EVENT, FINISHED_EVENT } from '@/components/tour'

const HIDDEN = 'tour:card'

export function TourCard({ total, done, persist }: { total: number; done: number; persist: 'local' | 'session' }) {
  const locale = useLocale()
  const [hidden, setHidden] = useState(false)
  const [started, setStarted] = useState(false)
  const [imgOk, setImgOk] = useState(true)
  const img = useRef<HTMLImageElement>(null)

  const store = () => (persist === 'session' ? window.sessionStorage : window.localStorage)

  useEffect(() => {
    // Снимок мог не загрузиться ещё до гидрации — тогда onError уже не сработает.
    const el = img.current
    if (el && el.complete && el.naturalWidth === 0) setImgOk(false)
    try {
      if (store().getItem(HIDDEN) === '1') setHidden(true)
      const pos = store().getItem('tour:pos')
      setStarted(pos !== null && pos !== '0' && pos !== 'closed')
    } catch {}
    const onFinish = () => hide()
    window.addEventListener(FINISHED_EVENT, onFinish)
    return () => window.removeEventListener(FINISHED_EVENT, onFinish)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function hide() {
    setHidden(true)
    try {
      store().setItem(HIDDEN, '1')
    } catch {}
  }

  if (hidden) return null

  const open = () => {
    setStarted(true)
    window.dispatchEvent(new Event(OPEN_EVENT))
  }
  const hideLabel = t(locale, 'tour.card.hide')

  return (
    <div className="panel group relative mb-4 overflow-hidden">
      {/* Свечение слева — чтобы карточка читалась как приглашение, а не ещё одна
          плитка с цифрами. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-16 size-48 rounded-full bg-haul-500/25 blur-3xl"
      />
      <button
        type="button"
        onClick={open}
        className="relative flex w-full items-center gap-4 p-3 pr-12 text-left sm:p-4 sm:pr-14"
      >
        {imgOk ? (
          // Снимок того самого «Обзора», с которого начинается экскурсия.
          <img
            ref={img}
            src={`/guide/${locale}/overview.jpg`}
            alt=""
            onError={() => setImgOk(false)}
            className="hidden h-16 w-28 shrink-0 rounded-lg border border-white/10 object-cover object-top transition-transform duration-300 group-hover:scale-[1.03] sm:block"
          />
        ) : null}
        <span
          aria-hidden
          className={`flex size-11 shrink-0 items-center justify-center rounded-full bg-haul-500/20 text-haul-300 ${imgOk ? 'sm:hidden' : ''}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-5">
            <path d="M22 10 12 5 2 10l10 5 10-5Z" />
            <path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-md font-semibold">{t(locale, 'tour.card.title')}</span>
          <span className="mt-0.5 block text-sm text-t3">
            {t(locale, 'tour.card.sub').replace('{n}', String(total))}
          </span>
          {persist === 'local' && done > 0 && (
            <span className="mt-2 flex items-center gap-2">
              <span className="h-1.5 max-w-40 flex-1 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-haul-400" style={{ width: `${(done / total) * 100}%` }} />
              </span>
              <span className="nums text-xs text-t3">
                {t(locale, 'tour.card.progress').replace('{done}', String(done)).replace('{total}', String(total))}
              </span>
            </span>
          )}
        </span>
        <span className="hidden h-9 shrink-0 items-center gap-1.5 rounded-xl border border-haul-400/30 bg-haul-500 px-3.5 text-base font-semibold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_2px_8px_-2px_rgba(109,90,232,0.55)] transition-colors group-hover:bg-haul-400 sm:inline-flex">
          {t(locale, started ? 'tour.card.continue' : 'tour.card.start')}
          <span aria-hidden>→</span>
        </span>
      </button>
      <button
        type="button"
        onClick={hide}
        title={hideLabel}
        aria-label={hideLabel}
        className="absolute right-2 top-2 flex size-8 sm:top-1/2 sm:-translate-y-1/2 items-center justify-center rounded-full text-t3 transition-colors hover:bg-white/10 hover:text-t1"
      >
        ✕
      </button>
    </div>
  )
}
