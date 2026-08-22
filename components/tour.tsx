'use client'

// Вводная экскурсия «за руку»: подсвечивает то место, куда нажимать, и говорит
// зачем. Показывается первому администратору сразу после установки.
//
// Почему не библиотека. Всё, что тут нужно, — прямоугольник элемента и дырка в
// затемнении: одна тень box-shadow с огромным разбросом даёт и затемнение, и
// вырез, без единой зависимости. Готовые туры (shepherd, driver.js) весят больше,
// чем весь этот файл, и тащат свои стили, которые потом воюют с нашими.
//
// Подсвеченный элемент НЕ перекрыт: вырез не ловит клики, поэтому нажать на него
// можно прямо из экскурсии. Экскурсия ведёт, а не запирает — любой шаг можно
// пропустить, и остальное приложение всё время остаётся живым.

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/button'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { finishTour } from '@/app/tour-actions'
import type { TourStep } from '@/lib/tour'

/** Где остановились. В localStorage, а не в базе: это позиция курсора в экскурсии,
 * а не факт настройки — за факты отвечает сервер (lib/tour.ts), он же решает,
 * какие шаги уже сделаны. 'closed' — свернули к ярлыку. */
const POS = 'tour:pos'

type Box = { top: number; left: number; width: number; height: number }

export function Tour({ steps }: { steps: TourStep[] }) {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)

  const step = steps[i]

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem(POS)
    // Первый несделанный шаг, а не всегда нулевой: если ключи уже вставлены, гонять
    // по ним второй раз — ровно то, за что туры и ненавидят.
    const firstUndone = steps.findIndex((s) => !s.done)
    const start = firstUndone === -1 ? 0 : firstUndone
    if (saved === 'closed') {
      setI(start)
      return
    }
    const n = Number(saved)
    setI(Number.isFinite(n) && n >= 0 && n < steps.length ? n : start)
    setOpen(true)
  }, [steps])

  const place = useCallback(() => {
    const target = step?.target
    if (!target) {
      setBox(null)
      return
    }
    const el = document.querySelector('[data-tour="' + target + '"]')
    if (!el) {
      setBox(null)
      return
    }
    const r = el.getBoundingClientRect()
    // Элемент есть в разметке, но не показан (боковое меню на телефоне, свёрнутая
    // панель) — рисовать вырез нулевого размера незачем.
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
    localStorage.setItem(POS, String(next))
  }

  function close() {
    setOpen(false)
    localStorage.setItem(POS, 'closed')
  }

  async function finish() {
    setOpen(false)
    localStorage.setItem(POS, 'closed')
    await finishTour()
    router.refresh()
  }

  if (!mounted || !step) return null

  // Ярлык: экскурсию свернули, но не прошли. Без него вернуться к ней нельзя вовсе,
  // а бросают такие вещи на середине постоянно.
  if (!open) {
    const left = steps.filter((s) => !s.done).length
    if (left === 0) return null
    return createPortal(
      <button
        onClick={() => setOpen(true)}
        className="panel fixed bottom-28 right-4 z-[190] flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium shadow-lg md:bottom-6"
      >
        <span className="flex size-5 items-center justify-center rounded-full bg-haul-500 text-[11px] font-bold text-white">
          {left}
        </span>
        {t(locale, 'tour.launcher')}
      </button>,
      document.body,
    )
  }

  const page = step.href.split('#')[0] ?? ''
  const onPage = !page || pathname === page || pathname.startsWith(page + '/')
  const isLast = i === steps.length - 1

  // Карточка под вырезом, если снизу есть место, иначе над ним. Без цели — по
  // центру: так выглядят шаги, у которых своей кнопки на странице нет.
  const card = 320
  const vw = typeof window === 'undefined' ? 1024 : window.innerWidth
  const vh = typeof window === 'undefined' ? 768 : window.innerHeight
  const below = box ? vh - (box.top + box.height) > 230 : true
  const cardStyle: React.CSSProperties = box
    ? {
        top: below ? box.top + box.height + 14 : Math.max(12, box.top - 224),
        left: Math.min(Math.max(box.left + box.width / 2 - card / 2, 12), Math.max(12, vw - card - 12)),
        width: card,
      }
    : { top: Math.max(12, vh / 2 - 120), left: Math.max(12, vw / 2 - card / 2), width: card }

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
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[195] bg-black/55" />
      )}

      <div className="panel fixed z-[196] p-4" style={cardStyle}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
          {t(locale, 'tour.stepOf')
            .replace('{n}', String(i + 1))
            .replace('{total}', String(steps.length))}
          {step.done ? ' · ' + t(locale, 'tour.doneMark') : ''}
        </p>
        <h2 className="mt-1 text-[15px] font-semibold">{step.title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">{step.text}</p>

        <div className="mt-3.5 flex items-center gap-2">
          {i > 0 && (
            <Button variant="secondary" size="sm" onClick={() => go(i - 1)}>
              {t(locale, 'tour.back')}
            </Button>
          )}
          {!onPage ? (
            <Button variant="primary" size="sm" onClick={() => router.push(step.href)}>
              {t(locale, 'tour.go')}
            </Button>
          ) : isLast ? (
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
      </div>
    </>,
    document.body,
  )
}
