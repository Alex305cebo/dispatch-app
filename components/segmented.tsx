'use client'

// Переключатель одним сегментом: разделы «Документов» (Грузы · Траки · Корзина) и вид
// «Грузов» (Список · Неделя · Карта). Вид один на оба места, а работают по-разному:
// у «Документов» кнопки — ссылки (app/docs/tab-nav.tsx), у «Грузов» вид меняется на
// месте, без перехода — все три вида рисуются из одной выборки грузов.

import type { ReactNode } from 'react'

export const SEGMENT_BAR = 'panel grid auto-cols-fr grid-flow-col gap-1 p-1 sm:inline-grid'

export const segmentClass = (on: boolean) =>
  `flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-xl px-4 text-base font-medium transition-colors select-none max-sm:flex-col max-sm:gap-0.5 max-sm:px-1 max-sm:py-1.5 max-sm:text-sm ${
    on ? 'bg-haul-500 text-white shadow-[0_6px_18px_-8px_rgba(124,108,255,0.9)]' : 'text-t2 hover:bg-white/6 hover:text-t1 active:bg-white/10'
  }`

export function Segmented<K extends string>({
  items,
  value,
  onChange,
  label,
  className = '',
}: {
  items: { key: K; label: string; icon?: ReactNode }[]
  value: K
  onChange: (key: K) => void
  /** Подпись для читалки экрана: что именно переключается. */
  label: string
  className?: string
}) {
  return (
    <div role="tablist" aria-label={label} className={`${SEGMENT_BAR} ${className}`}>
      {items.map((s) => (
        <button key={s.key} type="button" role="tab" aria-selected={s.key === value} onClick={() => onChange(s.key)} className={segmentClass(s.key === value)}>
          {s.icon}
          {s.label}
        </button>
      ))}
    </div>
  )
}
