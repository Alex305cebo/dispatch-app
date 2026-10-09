'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

// Уроки Amazon Relay живут на сайте курсов (репо Dispatch4you-Courses, страницы
// protected/pages/amazon-relay*.html). Ссылками, а не копией: уроки там правятся и
// дополняются видео, а доступ к ним платный — сайт курсов сам пускает ученика по
// его входу. Адреса — из nav.html сайта; английские лежат под /en/.
//
// С 10/09/26 (план «Порядок в TMS») уроки — не плитка внизу раздела, а окошко кнопки
// «Уроки» в шапке: кнопка и раньше была, но только прокручивала страницу к плитке.
// Список тот же — четыре урока, у каждого «Урок» и «Видео».
const COURSES = 'https://dispatch4you.com'

const PARTS: { title: 'amazon.lesson1' | 'amazon.lesson2' | 'amazon.lesson3' | 'amazon.lesson4'; page: string; video: string }[] = [
  { title: 'amazon.lesson1', page: 'amazon-relay', video: 'amazon-relay-video' },
  { title: 'amazon.lesson2', page: 'amazon-relay-2-loads', video: 'amazon-relay-video-2' },
  { title: 'amazon.lesson3', page: 'amazon-relay-3-problems', video: 'amazon-relay-video-3' },
  { title: 'amazon.lesson4', page: 'amazon-relay-4-money-rating', video: 'amazon-relay-video-4' },
]

const LINK =
  'inline-flex min-h-9 items-center rounded-lg border border-white/12 px-2.5 text-sm text-t2 hover:border-white/25 hover:text-t1 max-md:min-h-11'

export function AmazonLessons() {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const base = `${COURSES}${locale === 'ru' ? '' : '/en'}/pages/`

  // Старая ссылка вела к плитке уроков (/amazon#amazon-lessons) — теперь она открывает окошко.
  useEffect(() => {
    if (window.location.hash === '#amazon-lessons') setOpen(true)
  }, [])

  // Закрывается Escape и нажатием мимо окна — как остальные окошки приложения.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="amazon-lessons"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-white/12 px-3 text-sm font-semibold text-haul-300 hover:border-haul-500/50"
      >
        📚 {t(locale, 'amazon.lessonsShort')}
      </button>
      {open && (
        <div
          id="amazon-lessons"
          // Сплошная подложка, как у меню аккаунта: стекло panel пропускало плитки под окном.
          className="absolute right-0 top-full z-50 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-ink-900 p-4 shadow-2xl max-sm:w-full"
        >
          <h2 className="text-base font-bold text-t1">{t(locale, 'amazon.lessons')}</h2>
          <p className="mb-3 text-sm text-t2">{t(locale, 'amazon.lessonsHint')}</p>
          <ol className="flex flex-col gap-2">
            {PARTS.map((p, i) => (
              <li key={p.page} className="panel-inset flex flex-wrap items-center gap-2 rounded-xl p-3">
                <span className="nums mr-1 text-sm font-bold text-haul-300">{i + 1}</span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-t1">{t(locale, p.title)}</span>
                <a href={`${base}${p.page}.html`} target="_blank" rel="noopener" className={LINK}>
                  📖 {t(locale, 'amazon.lessonRead')}
                </a>
                <a href={`${base}${p.video}.html`} target="_blank" rel="noopener" className={LINK}>
                  🎬 {t(locale, 'amazon.lessonVideo')}
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
