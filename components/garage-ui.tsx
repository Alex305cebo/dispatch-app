'use client'

// Мелкие живые детали «Гаража»: числа досчитывают до своего значения при открытии.
// Сервер и первый кадр рисуют то же число, что и в конце, — без «0» до загрузки скрипта
// и без расхождения при гидрации; отсчёт начинается после монтирования.

import { useEffect, useState } from 'react'

export function CountUp({ value, format = 'int', duration = 900 }: { value: number; format?: 'int' | 'usd'; duration?: number }) {
  const [shown, setShown] = useState(value)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !value) {
      setShown(value)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      setShown(value * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  const n = Math.round(shown)
  return <span className="nums">{format === 'usd' ? `$${n.toLocaleString('en-US')}` : n.toLocaleString('en-US')}</span>
}
