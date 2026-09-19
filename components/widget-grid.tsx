'use client'

// Сетка плиток, которую можно переставить мышью или пальцем и у каждой выбрать
// размер: маленькая, широкая, большая.
//
// Перестановка живёт в отдельном режиме, который включает и выключает сам пользователь,
// на каждой странице свой: пока режим выключен, плитки — обычные ссылки, страница
// листается и нажимается как всегда, и случайно ничего не сдвинется. Это тем важнее,
// что порядок ОБЩИЙ для всей компании: случайный сдвиг пальцем менял бы экран всей
// смене, а не только себе. Сам факт включённого режима — личный, он в localStorage.
//
// Раскладка приходит уже готовой со страницы (lib/tiles.ts читает её из settings) и
// сохраняется серверным действием saveTileLayout. В браузере не хранится ничего, кроме
// галочки «режим включён».
//
// Почему своими руками, а не пакетом: единственная зависимость образца с 21st.dev —
// motion, он у нас уже стоит (toaster, notifier, ui.tsx). Ставить react-grid-layout или
// dnd-kit ради этого не нужно.

import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react'
import { motion, useDragControls, useReducedMotion } from 'motion/react'
import { Check, GripVertical, LayoutGrid } from 'lucide-react'
import { saveTileLayout } from '@/app/actions'
import { TILE_SIZES, type TilePage, type TilePlacement, type TileSize } from '@/lib/tiles-core'

export type Widget = {
  /** Устойчивый ключ: по нему запоминается место плитки. Менять нельзя — сбросит раскладку. */
  id: string
  node: React.ReactNode
}

/** Сколько держать палец, прежде чем плитка «оторвётся». Меньше — и обычная прокрутка
 * начинает таскать плитки; больше — жест не находят. Держится и во включённом режиме:
 * иначе длинную страницу в нём стало бы не пролистать. */
const HOLD_MS = 300

/** Ширина в колонках. Сетка — две колонки на телефоне и четыре на большом экране.
 *  На телефоне широкая и большая выглядят одинаково: колонок всего две, и это не ошибка. */
const SPAN: Record<TileSize, string> = {
  s: '',
  w: 'col-span-2',
  l: 'col-span-2 lg:col-span-4',
}

export function WidgetGrid({
  page,
  layout,
  defaults,
  widgets,
  labels,
  className = '',
}: {
  page: TilePage
  /** Порядок и размеры, уже склеенные сервером из сохранённого и заданного страницей. */
  layout: TilePlacement[]
  /** Что задала сама страница — к этому возвращает «Вернуть как было». */
  defaults: TilePlacement[]
  widgets: Widget[]
  /** Готовые строки, а не функция перевода: сетка — клиентский компонент, а функцию в
   * него со страницы-сервера передать нельзя, Next отвечает ошибкой прямо в браузер. */
  labels: {
    rearrange: string
    done: string
    reset: string
    hintTouch: string
    hintPointer: string
    shared: string
    size: string
    sizeNames: Record<TileSize, string>
    saveFailed: string
  }
  className?: string
}) {
  const [places, setPlaces] = useState<TilePlacement[]>(layout)
  const [edit, setEdit] = useState(false)
  const [touch, setTouch] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [, startSaving] = useTransition()
  const reduce = useReducedMotion()
  const cells = useRef(new Map<string, HTMLElement>())
  const hintId = useId()
  const editKey = `tiles:${page}:edit`

  // Сервер мог прислать другую раскладку (кто-то переставил у себя, страница
  // перерисовалась) — принимаем её, пока плитку не держат в руке.
  useEffect(() => {
    if (!dragging) setPlaces(layout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  // Режим и тип указателя читаются только в браузере: на сервере localStorage нет, а
  // разное дерево на сервере и на клиенте — это гидрация #418.
  useEffect(() => {
    try {
      setEdit(localStorage.getItem(`tiles:${page}:edit`) === '1')
    } catch {
      /* приватный режим */
    }
    setTouch(window.matchMedia('(pointer: coarse)').matches)
  }, [page])

  /** Записывается в базу, а не в браузер: порядок общий. Новый порядок на экране
   *  остаётся в любом случае — если сохранить не вышло, говорим это словами, а не
   *  откатываем работу человека молча. */
  const persist = useCallback(
    (next: TilePlacement[]) => {
      startSaving(async () => {
        const res = await saveTileLayout(page, next).catch(() => ({ error: 'x' }))
        setFailed(!!res && 'error' in res)
      })
    },
    [page],
  )

  /** Двигаем по КЛЮЧУ соседа, а не по номеру места на экране. На разделе это одно и
   *  то же, а на карточке груза и трака — нет: там половина плиток условная (нет
   *  заметок брокера — нет и плитки), и сохранённый порядок длиннее видимого. Номер
   *  с экрана указал бы в раскладке на чужую плитку, и та уехала бы не туда. */
  const move = useCallback(
    (id: string, overId: string) => {
      setPlaces((prev) => {
        const from = prev.findIndex((p) => p.id === id)
        const to = prev.findIndex((p) => p.id === overId)
        if (from < 0 || to < 0 || to === from) return prev
        const next = prev.slice()
        next.splice(to, 0, next.splice(from, 1)[0])
        return next
      })
    },
    [],
  )

  const resize = useCallback(
    (id: string, size: TileSize) => {
      setPlaces((prev) => {
        const next = prev.map((p) => (p.id === id ? { ...p, size } : p))
        persist(next)
        return next
      })
    },
    [persist],
  )

  /** Над какой плиткой сейчас палец или курсор. Считаем попаданием точки в чужой
   * прямоугольник, а не «наибольшим перекрытием»: плитки разной ширины, и широкую
   * перекрытие засчитывает раньше, чем её реально накрыли.
   *
   * Точка приходит от motion в координатах ДОКУМЕНТА, а getBoundingClientRect даёт
   * координаты окна, поэтому прокрутку надо прибавить. Без этого перестановка
   * работала только у самого верха страницы: стоило прокрутить — и точка улетала
   * ниже всех прямоугольников, плитка возвращалась на место, и это читалось как
   * «перетаскивание не работает». */
  const over = (x: number, y: number, self: string): string | null => {
    const sx = window.scrollX
    const sy = window.scrollY
    for (const [id, el] of cells.current) {
      if (id === self) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left + sx && x <= r.right + sx && y >= r.top + sy && y <= r.bottom + sy) return id
    }
    return null
  }

  // Раскладка может быть длиннее того, что страница отдала: на карточке груза и
  // трака часть плиток условная. Чего сейчас нет — просто не рисуем, место в
  // сохранённом порядке за ним остаётся.
  const byId = new Map(widgets.map((w) => [w.id, w]))
  const list = places.filter((p) => byId.has(p.id))
  const same =
    places.length === defaults.length &&
    places.every((p, i) => p.id === defaults[i].id && p.size === defaults[i].size)

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-t3">
        <span id={hintId}>
          {failed ? (
            <span className="text-bad-400">{labels.saveFailed}</span>
          ) : edit ? (
            <>
              {touch ? labels.hintTouch : labels.hintPointer}
              {' · '}
              <span className="text-t3">{labels.shared}</span>
            </>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {edit && !same && (
            <button
              type="button"
              onClick={() => {
                setPlaces(defaults)
                persist(defaults)
              }}
              className="rounded-md px-2 py-1 font-medium text-t2 ring-1 ring-white/12 hover:bg-white/[0.06]"
            >
              {labels.reset}
            </button>
          )}
          <button
            type="button"
            aria-pressed={edit}
            onClick={() => {
              setEdit(!edit)
              try {
                localStorage.setItem(editKey, edit ? '0' : '1')
              } catch {
                // приватный режим — выбор просто не переживёт перезагрузку
              }
            }}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 font-medium ring-1 transition-colors ${
              edit
                ? 'bg-haul-500/15 text-haul-300 ring-haul-400/30 hover:bg-haul-500/25'
                : 'text-t2 ring-white/12 hover:bg-white/[0.06]'
            }`}
          >
            {edit ? <Check size={13} strokeWidth={2.5} /> : <LayoutGrid size={13} strokeWidth={2.5} />}
            {edit ? labels.done : labels.rearrange}
          </button>
        </span>
      </div>

      {/* dense: плитки разного размера оставляют дыры в строке, и без него широкая,
          не влезшая в остаток строки, уезжала вниз, а слева зиял пустой квадрат. */}
      <div className="grid grid-cols-2 gap-2.5 [grid-auto-flow:dense] lg:grid-cols-4">
        {list.map((p, i) => (
          <Cell
            key={p.id}
            id={p.id}
            size={p.size}
            node={byId.get(p.id)!.node}
            index={i}
            total={list.length}
            edit={edit}
            reduce={!!reduce}
            hintId={hintId}
            labels={labels}
            dragging={dragging === p.id}
            bind={(el) => {
              if (el) cells.current.set(p.id, el)
              else cells.current.delete(p.id)
            }}
            onStart={() => setDragging(p.id)}
            onOver={(x, y) => {
              const id = over(x, y, p.id)
              if (id) move(p.id, id)
            }}
            onEnd={() => {
              setDragging(null)
              persist(places)
            }}
            onStep={(d) => {
              const neighbour = list[i + d]
              if (!neighbour) return
              move(p.id, neighbour.id)
              // Клавиатурой плитка идёт по одному шагу, и сохранять надо каждый: у
              // стрелки нет «конца жеста», после которого можно записать разом.
              setPlaces((next) => {
                persist(next)
                return next
              })
            }}
            onResize={(size) => resize(p.id, size)}
          />
        ))}
      </div>
    </div>
  )
}

function Cell({
  id,
  size,
  node,
  index,
  total,
  edit,
  reduce,
  hintId,
  labels,
  dragging,
  bind,
  onStart,
  onOver,
  onEnd,
  onStep,
  onResize,
}: {
  id: string
  size: TileSize
  node: React.ReactNode
  index: number
  total: number
  edit: boolean
  reduce: boolean
  hintId: string
  labels: { size: string; sizeNames: Record<TileSize, string> }
  dragging: boolean
  bind: (el: HTMLElement | null) => void
  onStart: () => void
  onOver: (x: number, y: number) => void
  onEnd: () => void
  onStep: (d: -1 | 1) => void
  onResize: (size: TileSize) => void
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
    // Нажатие по переключателю размера — не начало перетаскивания.
    if ((e.target as HTMLElement).closest('[data-tile-controls]')) return
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
      // :not([data-tile-controls]) в каждом правиле обязателен. Без него h-full
      // растягивал сам переключатель размера на всю плитку (он тоже прямой потомок),
      // а pointer-events-none отнимал у него нажатия — кнопки были видны и не
      // работали.
      // mt-0 — потому что блоки пришли со страниц, где отступ сверху был у них
      // собственный («mt-4» в самом компоненте). В сетке расстояние задаёт gap, и
      // чужой отступ сажал плитку ниже соседки в той же строке.
      className={`group relative [&>*:not([data-tile-controls])]:mt-0 [&>*:not([data-tile-controls])]:h-full ${
        edit
          ? 'cursor-grab rounded-2xl ring-1 ring-dashed ring-haul-400/40 [&>*:not([data-tile-controls])]:pointer-events-none'
          : ''
      } ${SPAN[size]} ${dragging ? 'cursor-grabbing' : ''}`}
    >
      {node}

      {/* Размер и ручка — только во включённом режиме. Ручка в нижнем правом углу: в
          верхнем она ложилась ровно на иконку плитки, и четыре точки поверх значка
          читались как соринки на экране. Она же — точка, с которой плитку двигают с
          клавиатуры. */}
      {edit && (
        <div
          data-tile-controls
          className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded-lg bg-ink-950/80 p-0.5 backdrop-blur"
        >
          <span className="flex items-center rounded-md ring-1 ring-white/12" role="group" aria-label={labels.size}>
            {TILE_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={size === s}
                title={labels.sizeNames[s]}
                aria-label={labels.sizeNames[s]}
                onClick={() => onResize(s)}
                className={`flex size-6 items-center justify-center first:rounded-l-md last:rounded-r-md transition-colors ${
                  size === s ? 'bg-haul-500/25 text-haul-300' : 'text-t3 hover:bg-white/10 hover:text-t2'
                }`}
              >
                <SizeMark size={s} />
              </button>
            ))}
          </span>
          <button
            type="button"
            aria-label={`${labels.size} (${index + 1}/${total})`}
            aria-describedby={hintId}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
              if (!d) return
              e.preventDefault()
              onStep(d)
            }}
            className="flex size-7 items-center justify-center rounded-md text-haul-300/70 hover:bg-white/10 hover:text-haul-300"
          >
            <GripVertical size={14} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </motion.div>
  )
}

/** Значок размера — сам прямоугольник нужной пропорции, а не буква: три подписи
 *  «М / Ш / Б» на шести языках разъехались бы по ширине, а форма понятна без слов. */
function SizeMark({ size }: { size: TileSize }) {
  const w = size === 's' ? 7 : size === 'w' ? 12 : 14
  const h = size === 'l' ? 11 : 7
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden>
      <rect
        x={(16 - w) / 2}
        y={(14 - h) / 2}
        width={w}
        height={h}
        rx="2"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  )
}
