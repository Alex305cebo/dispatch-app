'use client'

// Вводная экскурсия «как это работает»: экран за экраном, со снимком каждого.
// Показывается администратору при первом входе и каждому гостю демо.
//
// Шаг со снимком — карточка по центру: картинка сверху, рассказ под ней, кнопка
// «Открыть экран» ведёт на ту самую страницу. Шаг без снимка (их почти нет) —
// прежний вырез в затемнении вокруг нужной кнопки.
//
// Почему не библиотека. Вырез — одна тень box-shadow с огромным разбросом;
// карточка — обычный div. Готовые туры (shepherd, driver.js) весят больше, чем
// весь этот файл, и тащат свои стили, которые потом воюют с нашими.
//
// Экскурсия ведёт, а не запирает: любой шаг можно закрыть, приложение под ней
// остаётся живым, а вернуться можно ярлыком внизу справа.

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/button'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { finishTour } from '@/app/tour-actions'
import type { TourStep } from '@/lib/tour'

type Box = { top: number; left: number; width: number; height: number }

export function Tour({
  steps,
  persist,
}: {
  steps: TourStep[]
  /** Где помнить позицию. 'local' — админ: свернул сегодня, вернулся завтра к тому
   * же шагу. 'session' — демо: у каждого нового гостя с начала, потому что демо
   * общее на всех и запоминать там нечего и не для кого. */
  persist: 'local' | 'session'
}) {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [imgOk, setImgOk] = useState(true)

  const step = steps[i]
  const store = () => (persist === 'session' ? window.sessionStorage : window.localStorage)
  const POS = 'tour:pos'

  useEffect(() => {
    setMounted(true)
    const saved = store().getItem(POS)
    // Первый несделанный шаг, а не всегда нулевой: если ключи уже вставлены, гонять
    // по ним второй раз — ровно то, за что туры и ненавидят.
    const firstUndone = steps.findIndex((s) => !s.done)
    const start = firstUndone === -1 ? 0 : firstUndone
    if (saved === 'closed') {
      setI(start)
      return
    }
    const n = Number(saved)
    setI(Number.isFinite(n) && saved !== null && n >= 0 && n < steps.length ? n : start)
    setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps])

  useEffect(() => setImgOk(true), [i])

  const place = useCallback(() => {
    const target = step?.target
    if (!target || step?.image) {
      setBox(null)
      return
    }
    const el = document.querySelector('[data-tour="' + target + '"]')
    if (!el) {
      setBox(null)
      return
    }
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) {
      setBox(null)
      return
    }
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [step])

  useEffect(() => {
    if (!open) return
    place()
    // Пересчёт по таймеру, а не только по scroll/resize: страница дорисовывается
    // после навигации, панели раскрываются анимацией, и цель успевает переехать
    // уже после того, как оба события отгремели. Четверть секунды незаметна.
    const timer = setInterval(place, 250)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      clearInterval(timer)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place, pathname])

  function go(next: number) {
    setI(next)
    store().setItem(POS, String(next))
  }

  function close() {
    setOpen(false)
    store().setItem(POS, 'closed')
  }

  async function finish() {
    setOpen(false)
    store().setItem(POS, 'closed')
    if (persist === 'local') {
      await finishTour()
      router.refresh()
    }
  }

  if (!mounted || !step) return null

  // Ярлык: экскурсию свернули. Без него вернуться к ней нельзя вовсе, а бросают
  // такие вещи на середине постоянно. В демо — всегда, у админа — пока есть
  // несделанное.
  if (!open) {
    const left = steps.filter((s) => !s.done).length
    if (persist === 'local' && left === 0) return null
    // Живёт в ряду аккаунта рядом с колокольчиком (слот в components/nav.tsx),
    // круглой кнопкой «?» — как остальные иконки ряда. Плавающая плашка справа
    // внизу висела над контентом и была «не пойми чья». Слота нет (страница без
    // навигации) — прежний запасной вариант у правого края.
    const slot = document.getElementById('tour-launcher-slot')
    const label = t(locale, 'tour.launcher')
    return createPortal(
      slot ? (
        <span className="relative">
          <button
            type="button"
            onClick={() => setOpen(true)}
            title={label}
            aria-label={label}
            className="nav-icon-btn flex size-9 items-center justify-center rounded-full border border-white/10 hover:border-white/25"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
          </button>
          {persist === 'local' && (
            <span className="pointer-events-none absolute -right-1 -top-1 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-haul-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-ink-950">
              {left}
            </span>
          )}
        </span>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="panel fixed bottom-28 right-4 z-[190] flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium shadow-lg md:bottom-6"
        >
          {persist === 'local' && (
            <span className="flex size-5 items-center justify-center rounded-full bg-haul-500 text-[11px] font-bold text-white">
              {left}
            </span>
          )}
          {label}
        </button>
      ),
      slot ?? document.body,
    )
  }

  const page = step.href.split('#')[0] ?? ''
  const onPage = !page || pathname === page || pathname.startsWith(page + '/')
  const isLast = i === steps.length - 1
  const withImage = !!step.image && imgOk

  const vw = typeof window === 'undefined' ? 1024 : window.innerWidth
  const vh = typeof window === 'undefined' ? 768 : window.innerHeight
  // Со снимком — широкая карточка по центру; без — узкая у подсвеченной кнопки.
  const card = withImage ? Math.min(720, vw - 24) : Math.min(320, vw - 24)
  const below = box ? vh - (box.top + box.height) > 230 : true
  const cardStyle: React.CSSProperties = box
    ? {
        top: below ? box.top + box.height + 14 : Math.max(12, box.top - 224),
        left: Math.min(Math.max(box.left + box.width / 2 - card / 2, 12), Math.max(12, vw - card - 12)),
        width: card,
      }
    : { top: 12, left: Math.max(12, vw / 2 - card / 2), width: card, maxHeight: vh - 24, overflowY: 'auto' }

  const nav = (
    <div className="mt-3.5 flex items-center gap-2">
      {i > 0 && (
        <Button variant="secondary" size="sm" onClick={() => go(i - 1)}>
          {t(locale, 'tour.back')}
        </Button>
      )}
      {!onPage && step.href && (
        <Button variant="secondary" size="sm" onClick={() => router.push(step.href)}>
          {t(locale, 'tour.go')}
        </Button>
      )}
      {isLast ? (
        <Button variant="primary" size="sm" onClick={finish}>
          {t(locale, 'tour.done')}
        </Button>
      ) : (
        <Button variant="primary" size="sm" onClick={() => go(i + 1)}>
          {t(locale, 'tour.next')}
        </Button>
      )}
      <button onClick={close} className="ml-auto text-[12px] text-white/45 transition-colors hover:text-white/80">
        {t(locale, 'tour.skip')}
      </button>
    </div>
  )

  return createPortal(
    <>
      {box ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[195] rounded-xl ring-2 ring-haul-400 transition-all duration-200"
          style={{
            top: box.top - 6,
            left: box.left - 6,
            width: box.width + 12,
            height: box.height + 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 z-[195] bg-black/55" onClick={close} />
      )}

      <div className="panel fixed z-[196] p-4" style={cardStyle}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
          {t(locale, 'tour.stepOf')
            .replace('{n}', String(i + 1))
            .replace('{total}', String(steps.length))}
          {step.done ? ' · ' + t(locale, 'tour.doneMark') : ''}
        </p>
        <h2 className="mt-1 text-[15px] font-semibold">{step.title}</h2>
        {step.image && imgOk && (
          // Снимок настоящего экрана. Нет файла (снимок ещё не снят) — картинка
          // молча исчезает, карточка сужается, текст остаётся.
          <img
            src={`/guide/${locale}/${step.image}.jpg`}
            alt=""
            onError={() => setImgOk(false)}
            className="mt-3 w-full rounded-lg border border-white/10"
          />
        )}
        <p className="mt-2.5 text-[13px] leading-relaxed text-white/72">{step.text}</p>
        {nav}
      </div>
    </>,
    document.body,
  )
}
