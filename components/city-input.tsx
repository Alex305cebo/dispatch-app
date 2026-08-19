'use client'

import { useMemo, useRef, useState } from 'react'

/**
 * Поле города с подсказками.
 *
 * Заменило нативный `<datalist>`. Тот казался самым ленивым решением — браузер
 * фильтрует сам, кода ноль, — но на практике повёл себя негодно: при щелчке по
 * пустому полю Chrome вываливает ВЕСЬ список во всю высоту экрана, поверх
 * соседнего поля, в своей собственной вёрстке, которую не подчинить теме. Сто
 * пятьдесят городов стеной — это не подсказка.
 *
 * Здесь список появляется только после двух введённых букв, показывает не больше
 * восьми совпадений и живёт внутри карточки. Совпадение ищется и по началу
 * строки, и внутри неё, но начало идёт выше: набрав «new», ждёшь Newark и
 * New York, а не Kenner.
 *
 * Поле остаётся обычным текстовым: город не из списка вписывается как есть.
 */
export function CityInput({
  value,
  onChange,
  cities,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  cities: string[]
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // Щелчок по подсказке сначала снимает фокус с поля, и список успел бы
  // закрыться раньше, чем выбор дойдёт. Закрытие по blur поэтому откладываем.
  const closeTimer = useRef<number | undefined>(undefined)

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (q.length < 2) return []
    const starts: string[] = []
    const inside: string[] = []
    for (const c of cities) {
      const l = c.toLowerCase()
      if (l === q) continue // уже набрано целиком — подсказывать нечего
      if (l.startsWith(q)) starts.push(c)
      else if (l.includes(q)) inside.push(c)
      if (starts.length >= 8) break
    }
    return [...starts, ...inside].slice(0, 8)
  }, [value, cities])

  const shown = open && matches.length > 0

  function pick(city: string) {
    onChange(city)
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
        onChange={(e) => {
          onChange(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          closeTimer.current = window.setTimeout(() => setOpen(false), 120)
        }}
        onKeyDown={(e) => {
          if (!shown) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => (i + 1) % matches.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => (i - 1 + matches.length) % matches.length)
          } else if (e.key === 'Enter') {
            // Подставляем подсказку и НЕ даём форме уйти считать: человек ещё
            // выбирает город, а не подтверждает запрос.
            e.preventDefault()
            pick(matches[active] ?? value)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />

      {shown && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-xl">
          {matches.map((c, i) => (
            <li key={c}>
              <button
                type="button"
                // onMouseDown, а не onClick: mousedown срабатывает до blur, и
                // выбор не гонится с закрытием списка.
                onMouseDown={(e) => {
                  e.preventDefault()
                  clearTimeout(closeTimer.current)
                  pick(c)
                }}
                onMouseEnter={() => setActive(i)}
                className={`block w-full px-3 py-2 text-left text-[13px] transition-colors ${
                  i === active ? 'bg-haul-500/20 text-white' : 'text-white/75 hover:bg-white/[0.04]'
                }`}
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
