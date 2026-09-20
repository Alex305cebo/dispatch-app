// Маленькая плитка с одним числом: число крупно, подпись под ним.
//
// Одна на приложение, чтобы счётчики в разных разделах не разъезжались в стиле.
// Форма фиксированная, цифра одной строкой `nums` — плитки в ряду стоят на общей
// базовой линии, какими бы ни были значения. Ноль гасится до серого: пустой счётчик
// не должен кричать наравне с непустым.

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Info } from '@/components/info'

const TONE = {
  good: 'text-good-400',
  bad: 'text-bad-400',
  warn: 'text-warn-400',
} as const

export function CountTile({
  value,
  label,
  tone,
  info,
  href,
  children,
}: {
  /** Само число или готовая строка — «$7,660», «21%». */
  value: string | number
  label: string
  tone?: keyof typeof TONE
  /** Подсказка ⓘ рядом с подписью. */
  info?: string
  /** Куда ведёт плитка, если ей есть куда вести. */
  href?: string
  children?: ReactNode
}) {
  const muted = value === 0 || value === '0'
  const body = (
    <>
      <div className={`nums truncate text-xl leading-tight font-bold ${muted ? 'text-t3' : tone ? TONE[tone] : 'text-t1'}`}>
        {value}
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-xs text-t3">
        <span className="truncate">{label}</span>
        {info && <Info text={info} />}
      </div>
      {children}
    </>
  )
  const skin = 'panel flex h-full w-full flex-col justify-center px-3 py-2.5'
  if (href)
    return (
      <Link href={href} className={`${skin} transition-colors hover:bg-white/[0.06]`}>
        {body}
      </Link>
    )
  return <div className={skin}>{body}</div>
}
