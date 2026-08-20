'use client'

import { useEffect, useState } from 'react'

/**
 * Местное время там, где сейчас трак.
 *
 * Клиентский компонент, а не серверный рендер: время, отрисованное на сервере,
 * застывает на момент сборки страницы и уже через минуту врёт. Здесь оно живое и
 * обновляется само.
 *
 * Сервер передаёт только IANA-имя пояса (определено офлайн по координатам, см.
 * lib/tz.ts) — сам перевод делает Intl в браузере, поэтому переход на летнее
 * время и его отмена учитываются без единой строки нашего кода.
 */
export function LocalTime({ zone, className }: { zone: string; className?: string }) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    // Раз в полминуты, а не в секунду: показываем часы и минуты, и лишние
    // перерисовки ради невидимой секунды не нужны.
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Первый рендер пустой намеренно: время на сервере и в браузере разное, и
  // отрисовав его на сервере, мы получили бы расхождение гидратации.
  if (!now) return null

  let text: string
  try {
    text = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now)
  } catch {
    return null
  }

  // Короткое имя пояса рядом с временем: «14:32 PDT». Без него непонятно, чьё
  // это время — водителя или своё.
  let abbr = ''
  try {
    abbr =
      new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
        .formatToParts(now)
        .find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    /* без аббревиатуры тоже читается */
  }

  return (
    <span className={className} title={zone}>
      {text}
      {abbr && ` ${abbr}`}
    </span>
  )
}
