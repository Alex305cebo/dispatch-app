'use client'

// Сетка плиток, которую можно переставить мышью или пальцем.
//
// Перестановка живёт в отдельном режиме, который включает и выключает сам пользователь,
// на каждой странице свой: пока режим выключен, плитки — обычные ссылки, страница
// листается и нажимается как всегда, и случайно ничего не сдвинется. Включённый режим
// тоже запоминается, так что оставить сетку «открытой» можно надолго.
//
// Порядок и сам режим лежат в localStorage браузера — в базу ничего не пишется, откат =
// кнопка «Вернуть как было».
//
// Почему своими руками, а не пакетом: единственная зависимость образца с 21st.dev —
// motion, он у нас уже стоит (toaster, notifier, ui.tsx). Ставить react-grid-layout или
// dnd-kit ради этого не нужно.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { motion, useDragControls, useReducedMotion } from 'motion/react'
import { Check, GripVertical, LayoutGrid } from 'lucide-react'

export type Widget = {
  /** Устойчивый ключ: по нему запоминается место плитки. Менять нельзя — сбросит раскладку. */
  id: string
  /** Ширина в колонках сетки: 1, 2 или во всю строку. На телефоне колонок всего две,
   * поэтому 2 и 'full' там выглядят одинаково. */
  span?: 1 | 2 | 'full'
  node: React.ReactNode
}

/** Сколько держать палец, прежде чем плитка «оторвётся». Меньше — и обычная прокрутка
 * начинает таскать плитки; больше — жест не находят. Держится и во включённом режиме:
 * иначе длинную страницу в нём стало бы не пролистать. */
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
  hintTouch = 'Нажмите, подержите и потяните плитку',
  hintPointer = 'Потяните плитку мышью',
  rearrangeLabel = 'Переставить',
  doneLabel = 'Готово',
  resetLabel = 'Вернуть как было',
  className = '',
}: {
  storageKey: string
  widgets: Widget[]
  /** Подсказка внутри режима: на тачскрине и мышью жесты разные. Две готовые строки, а
   * не функция от вида указателя: сетка — клиентский компонент, а функцию в него со
   * страницы-сервера передать нельзя, Next отвечает ошибкой прямо в браузер. */
  hintTouch?: string
  hintPointer?: string
  rearrangeLabel?: string
  doneLabel?: string
  resetLabel?: string
  className?: string
}) {
  const ids = widgets.map((w) => w.id)
  const key = ids.join(',')
  const [order, setOrder] = useState<string[]>(ids)
  const [edit, setEdit] = useState(false)
  const [touch, setTouch] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const reduce = useReducedMotion()
  const cells = useRef(new Map<string, HTMLElement>())
  const hintId = useId()
  const editKey = `${storageKey}:edit`

  // Порядок, режим и тип указателя читаются только в браузере: на сервере localStorage
  // нет, а разное дерево на сервере и на клиенте — это гидрация #418.
  useEffect(() => {
    setOrder(restore(storageKey, key.split(',')))
    try {
      setEdit(localStorage.getItem(`${storageKey}:edit`) === '1')
    } catch {
      /* приватный режим */
    }
    setTouch(window.matchMedia('(pointer: coarse)').matches)
  }, [storageKey, key])

  const save = useCallback((k: string, value: string) => {
    try {
      localStorage.setItem(k, value)
    } catch {
      // приватный режим — выбор просто не переживёт перезагрузку
    }
  }, [])

  const move = useCallback(
    (id: string, to: number) => {
      setOrder((prev) => {
        const from = prev.indexOf(id)
        if (from < 0 || to < 0 || to >= prev.length || to === from) return prev
        const next = prev.slice()
        next.splice(to, 0, next.splice(from, 1)[0])
        save(storageKey, JSON.stringify(next))
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
        <span id={hintId}>{edit ? (touch ? hintTouch : hintPointer) : null}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {edit && moved && (
            <button
              type="button"
              onClick={() => {
                setOrder(key.split(','))
                save(storageKey, JSON.stringify(key.split(',')))
              }}
              className="rounded-md px-2 py-1 font-medium text-white/70 ring-1 ring-white/12 hover:bg-white/[0.06]"
            >
              {resetLabel}
            </button>
          )}
          <button
            type="button"
            aria-pressed={edit}
            onClick={() => {
              setEdit(!edit)
              save(editKey, edit ? '0' : '1')
            }}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 font-medium ring-1 transition-colors ${
              edit
                ? 'bg-haul-500/15 text-haul-300 ring-haul-400/30 hover:bg-haul-500/25'
                : 'text-white/60 ring-white/12 hover:bg-white/[0.06]'
            }`}
          >
            {edit ? <Check size={13} strokeWidth={2.5} /> : <LayoutGrid size={13} strokeWidth={2.5} />}
            {edit ? doneLabel : rearrangeLabel}
          </button>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {list.map((w, i) => (
          <Cell
            key={w.id}
            widget={w}
            index={i}
            total={list.length}
            edit={edit}
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
              save(storageKey, JSON.stringify(order))
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
  edit,
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
  edit: boolean
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
  const dragged = useRef(false)
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
  // Выключили режим на полпути — снимаем взведённость, иначе плитка осталась бы с
  // отобранной прокруткой.
  useEffect(() => {
    if (!edit) {
      cancel()
      setArmed(false)
    }
  }, [edit, cancel])

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
    // Плитка часто целиком ссылка (цифра ведёт на список грузов). Ссылку браузер
    // умеет перетаскивать сам, и его собственный жест перехватывал мышь: палец
    // работал, а мышью плитка не двигалась вовсе. Запрещаем родной перенос.
    const noNativeDrag = (e: DragEvent) => e.preventDefault()
    node.addEventListener('touchmove', stop, { passive: false })
    node.addEventListener('dragstart', noNativeDrag)
    return () => {
      node.removeEventListener('touchmove', stop)
      node.removeEventListener('dragstart', noNativeDrag)
    }
  }, [])

  // Жест начинается не сразу. Мышью — сразу, пальцем — после удержания: иначе обычная
  // прокрутка страницы превращалась бы в перетаскивание, и список стало бы не пролистать.
  const down = (e: React.PointerEvent) => {
    if (!edit) return
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
      drag={edit}
      dragListener={false}
      dragControls={controls}
      dragSnapToOrigin
      dragElastic={0.12}
      dragMomentum={false}
      // Пока плитку не взяли, страница и содержимое внутри прокручиваются как обычно,
      // поэтому жесты остаются у браузера.
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
      onDragStart={() => {
        dragged.current = true
        onStart()
      }}
      onDrag={(_, info) => onOver(info.point.x, info.point.y)}
      onDragEnd={() => {
        setArmed(false)
        onEnd()
      }}
      // Плитка-ссылка после перетаскивания досылает click, и вместо переставленной
      // раскладки открывался список грузов. Гасим ровно один щелчок — тот, что
      // пришёл следом за перетаскиванием.
      onClickCapture={(e) => {
        if (!dragged.current) return
        dragged.current = false
        e.preventDefault()
        e.stopPropagation()
      }}
      whileDrag={edit ? { scale: 1.03, boxShadow: 'var(--shadow-e3)' } : undefined}
      // В режиме перестановки содержимое плитки не нажимается: иначе попытка её
      // подвинуть открывала бы ссылку под пальцем. Пунктирная рамка говорит, что
      // сетка сейчас «открыта».
      className={`group relative [&>a]:h-full [&>div]:h-full ${
        edit
          ? 'cursor-grab rounded-2xl ring-1 ring-dashed ring-haul-400/40 [&>a]:pointer-events-none [&>div]:pointer-events-none'
          : ''
      } ${widget.span === 'full' ? 'col-span-2 lg:col-span-4' : widget.span === 2 ? 'col-span-2' : ''} ${
        dragging ? 'cursor-grabbing' : ''
      }`}
    >
      {widget.node}

      {/* Ручка — только во включённом режиме и в нижнем правом углу. В верхнем она
          ложилась ровно на иконку плитки, и четыре точки поверх значка читались как
          соринки на экране. Она же — точка, с которой плитку двигают с клавиатуры. */}
      {edit && (
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
          className="absolute bottom-0.5 right-0.5 flex size-7 items-center justify-center rounded-md text-haul-300/70 hover:bg-white/10 hover:text-haul-300"
        >
          <GripVertical size={14} strokeWidth={2.5} />
        </button>
      )}
    </motion.div>
  )
}
