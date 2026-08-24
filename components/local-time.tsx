'use client'

import { useEffect, useState } from 'react'
import { zoneTime } from '@/lib/fmt'

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
  const text = zoneTime(zone, now)
  if (!text) return null

  return (
    <span className={className} title={zone}>
      {text}
    </span>
  )
}
