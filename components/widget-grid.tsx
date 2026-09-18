'use client'

// Сетка плиток, которую можно переставить мышью или пальцем. Порядок живёт в
// localStorage браузера — своя раскладка у каждого, в базу ничего не пишется, откат =
// кнопка «Вернуть как было».
//
// Почему своими руками, а не пакетом: единственная зависимость образца с 21st.dev —
// motion, он у нас уже стоит (toaster, notifier, ui.tsx). Ставить react-grid-layout или
// dnd-kit ради этого не нужно.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { motion, useDragControls, useReducedMotion } from 'motion/react'
import { GripVertical } from 'lucide-react'

export type Widget = {
  /** Устойчивый ключ: по нему запоминается место плитки. Менять нельзя — сбросит раскладку. */
  id: string
  /** Ширина в колонках сетки на широком экране. На телефоне колонки всего две. */
  span?: 1 | 2
  node: React.ReactNode
}

/** Сколько держать палец, прежде чем плитка «оторвётся». Меньше — и обычная прокрутка
 * списка начинает таскать плитки; больше — жест не находят. */
const HOLD_MS = 300

/** Порядок из localStorage, отфильтрованный по тому, что реально пришло: виджет могли
 * убрать из кода, а ключ в браузере остался бы навсегда. */
function restore(key: string, ids: string[]): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return ids
    const saved: unknown = JSON.parse(raw)
    if (!Array.isArray(saved)) return ids
    const known = saved.filter((id): id is string => typeof id === 'string' && ids.includes(id))
    // Новые плитки, которых не было на момент сохранения, встают в конец, а не пропадают.
    return [...known, ...ids.filter((id) => !known.includes(id))]
  } catch {
    return ids
  }
}

export function WidgetGrid({
  storageKey,
  widgets,
  hint,
  resetLabel = 'Вернуть как было',
  className = '',
}: {
  storageKey: string
  widgets: Widget[]
  /** Подсказка над сеткой: на тачскрине и мышью жесты разные, текст даёт вызывающий. */
  hint?: (touch: boolean) => React.ReactNode
  resetLabel?: string
  className?: string
}) {
  const ids = widgets.map((w) => w.id)
  const key = ids.join(',')
  const [order, setOrder] = useState<string[]>(ids)
  const [touch, setTouch] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const reduce = useReducedMotion()
  const cells = useRef(new Map<string, HTMLElement>())
  const hintId = useId()

  // Порядок и тип указателя читаются только в браузере: на сервере localStorage нет, а
  // разное дерево на сервере и на клиенте — это гидрация #418.
  useEffect(() => {
    setOrder(restore(storageKey, key.split(',')))
    setTouch(window.matchMedia('(pointer: coarse)').matches)
  }, [storageKey, key])

  const save = useCallback((k: string, next: string[]) => {
    try {
      localStorage.setItem(k, JSON.stringify(next))
    } catch {
      // приватный режим — раскладка просто не переживёт перезагрузку
    }
  }, [])

  const move = useCallback(
    (id: string, to: number) => {
      setOrder((prev) => {
        const from = prev.indexOf(id)
        if (from < 0 || to < 0 || to >= prev.length || to === from) return prev
        const next = prev.slice()
        next.splice(to, 0, next.splice(from, 1)[0])
        save(storageKey, next)
        return next
      })
    },
    [save, storageKey],
  )

  /** Над какой плиткой сейчас палец или курсор. Считаем попаданием точки в чужой
   * прямоугольник, а не «наибольшим перекрытием»: плитки разной ширины, и широкую
   * перекрытие засчитывает раньше, чем её реально накрыли. */
  const over = (x: number, y: number, self: string): string | null => {
    for (const [id, el] of cells.current) {
      if (id === self) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id
    }
    return null
  }

  const byId = new Map(widgets.map((w) => [w.id, w]))
  const list = order.map((id) => byId.get(id)).filter((w): w is Widget => !!w)
  const moved = order.join(',') !== key

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-white/55">
        <span id={hintId}>{hint?.(touch)}</span>
        {moved && (
          <button
            type="button"
            onClick={() => {
              setOrder(key.split(','))
              save(storageKey, key.split(','))
            }}
            className="shrink-0 rounded-md px-2 py-1 font-medium text-white/70 ring-1 ring-white/12 hover:bg-white/[0.06]"
          >
            {resetLabel}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {list.map((w, i) => (
          <Cell
            key={w.id}
            widget={w}
            index={i}
            total={list.length}
            touch={touch}
            reduce={!!reduce}
            hintId={hintId}
            dragging={dragging === w.id}
            bind={(el) => {
              if (el) cells.current.set(w.id, el)
              else cells.current.delete(w.id)
            }}
            onStart={() => setDragging(w.id)}
            onOver={(x, y) => {
              const id = over(x, y, w.id)
              if (id) move(w.id, order.indexOf(id))
            }}
            onEnd={() => {
              setDragging(null)
              save(storageKey, order)
            }}
            onStep={(d) => move(w.id, i + d)}
          />
        ))}
      </div>
    </div>
  )
}

function Cell({
  widget,
  index,
  total,
  touch,
  reduce,
  hintId,
  dragging,
  bind,
  onStart,
  onOver,
  onEnd,
  onStep,
}: {
  widget: Widget
  index: number
  total: number
  touch: boolean
  reduce: boolean
  hintId: string
  dragging: boolean
  bind: (el: HTMLElement | null) => void
  onStart: () => void
  onOver: (x: number, y: number) => void
  onEnd: () => void
  onStep: (d: -1 | 1) => void
}) {
  const controls = useDragControls()
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null)
  const from = useRef<{ x: number; y: number } | null>(null)
  const el = useRef<HTMLDivElement | null>(null)
  const [armed, setArmed] = useState(false)
  const armedRef = useRef(false)
  armedRef.current = armed

  const cancel = useCallback(() => {
    if (hold.current) clearTimeout(hold.current)
    hold.current = null
    from.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  // Как только плитку взяли пальцем, прокрутку страницы надо отобрать у браузера прямо
  // посреди жеста. Одного touch-action мало: браузер решает, чей это жест, на первом
  // движении, а к этому моменту плитка ещё не взята — он уводил палец в прокрутку и
  // присылал pointercancel, то есть перетаскивание на телефоне не начиналось вовсе.
  // Помогает только preventDefault на touchmove, а для него слушатель должен быть
  // не-passive, чего React на onTouchMove не даёт.
  useEffect(() => {
    const node = el.current
    if (!node) return
    const stop = (e: TouchEvent) => {
      if (armedRef.current && e.cancelable) e.preventDefault()
    }
    node.addEventListener('touchmove', stop, { passive: false })
    return () => node.removeEventListener('touchmove', stop)
  }, [])

  // Жест начинается не сразу. Мышью — сразу, пальцем — после удержания: иначе обычная
  // прокрутка страницы и боковая прокрутка таблицы внутри плитки превращались бы в
  // перетаскивание, и список стало бы не пролистать.
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (e.pointerType === 'mouse') {
      setArmed(true)
      controls.start(e)
      return
    }
    from.current = { x: e.clientX, y: e.clientY }
    const ev = e
    hold.current = setTimeout(() => {
      setArmed(true)
      navigator.vibrate?.(8)
      controls.start(ev)
    }, HOLD_MS)
  }

  const maybeCancel = (e: React.PointerEvent) => {
    if (!hold.current || !from.current) return
    if (Math.hypot(e.clientX - from.current.x, e.clientY - from.current.y) > 10) cancel()
  }

  return (
    <motion.div
      ref={(node: HTMLDivElement | null) => {
        el.current = node
        bind(node)
      }}
      layout={reduce ? false : 'position'}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 38 }}
      drag
      dragListener={false}
      dragControls={controls}
      dragSnapToOrigin
      dragElastic={0.12}
      dragMomentum={false}
      // Пока плитку не взяли, страница и таблица внутри должны прокручиваться как
      // обычно, поэтому жесты остаются у браузера.
      style={{
        touchAction: armed ? 'none' : 'auto',
        userSelect: armed ? 'none' : undefined,
        zIndex: dragging ? 20 : 1,
      }}
      onContextMenu={(e) => {
        // Долгое нажатие на телефоне иначе поднимает системное меню поверх плитки.
        if (armed) e.preventDefault()
      }}
      onPointerDown={down}
      onPointerMove={maybeCancel}
      onPointerUp={() => {
        cancel()
        setArmed(false)
      }}
      onPointerCancel={() => {
        cancel()
        setArmed(false)
      }}
      onDragStart={onStart}
      onDrag={(_, info) => onOver(info.point.x, info.point.y)}
      onDragEnd={() => {
        setArmed(false)
        onEnd()
      }}
      whileDrag={{ scale: 1.03, boxShadow: 'var(--shadow-e3)' }}
      className={`group relative ${widget.span === 2 ? 'col-span-2' : ''} ${
        dragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      {widget.node}

      {/* Ручка. Мышью — видна при наведении, на тачскрине — всегда: наведения там нет, и
          невидимая ручка означает, что жест просто не найдут. Она же — точка, с которой
          плитку переставляют с клавиатуры. */}
      <button
        type="button"
        aria-label={`Переставить плитку (${index + 1} из ${total})`}
        aria-describedby={hintId}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
          if (!d) return
          e.preventDefault()
          onStep(d)
        }}
        className={`absolute right-1 top-1 flex size-6 items-center justify-center rounded-md text-white/45 transition-opacity hover:bg-white/10 hover:text-white/80 focus-visible:opacity-100 ${
          touch ? 'opacity-60' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <GripVertical size={14} strokeWidth={2.5} />
      </button>
    </motion.div>
  )
}
