// Плитка с цифрой: подпись капсом, иконка в цветном квадрате, крупное число. Одна на
// приложение — обзор и грузы, чтобы плитки не расходились в стиле.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Info } from '@/components/info'

/** Tint used by a tile's icon chip and its meter. Kept to the semantic four so a
 * figure's colour still means something rather than just decorating the grid. */
const ACCENTS = {
  haul: { chip: 'bg-haul-500/15 text-haul-300 ring-haul-400/20', bar: 'bg-haul-400' },
  good: { chip: 'bg-good-500/15 text-good-400 ring-good-400/20', bar: 'bg-good-400' },
  warn: { chip: 'bg-warn-400/15 text-warn-400 ring-warn-400/20', bar: 'bg-warn-400' },
  bad: { chip: 'bg-bad-500/15 text-bad-400 ring-bad-400/20', bar: 'bg-bad-400' },
} as const

export function Stat({
  label,
  value,
  tone,
  sub,
  subTone,
  info,
  href,
  icon,
  accent = 'haul',
  meter,
  hero,
  onClick,
  children,
}: {
  label: string
  value: string
  tone?: 'good' | 'bad'
  /** Secondary line under the big number — e.g. "чистыми $1,740". */
  sub?: string
  subTone?: 'good' | 'bad'
  info?: string
  /** Where the card leads — e.g. the loads list behind a rate total. */
  href?: string
  icon?: ReactNode
  accent?: keyof typeof ACCENTS
  /** 0..1 — draws a thin fill bar along the bottom of the tile. */
  meter?: number
  /** The one figure an owner watches first (rate/profit). Lifts the tile to elevation
   * tier 2 and caps it with an accent strip, so four equal numbers gain a focal point
   * instead of reading as an undifferentiated row. */
  hero?: boolean
  /** Плитка-кнопка: на странице грузов клик сужает список до своих грузов. */
  onClick?: () => void
  /** Мини-график под цифрой. */
  children?: ReactNode
}) {
  const a = ACCENTS[accent]
  const body = (
    <>
      {hero && (
        <span
          aria-hidden
          className={`absolute inset-x-0 top-0 h-[3px] rounded-t-2xl ${a.bar}`}
        />
      )}
      {/* Label first, figure second. The old tile led with the number and buried the
          label underneath in 10px grey, so four tiles in a row read as four loose
          numbers with no way to tell at a glance which was which. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-white/55">
          {/* Переносится на вторую строку, а не обрезается: «TOT…» не говорит ничего,
              две строки говорят всё. Плитки в ряду тянутся до общей высоты. */}
          <span className="min-w-0">{label}</span>
          {info && <Info text={info} />}
        </div>
        {icon && (
          <span
            className={`flex size-6 shrink-0 items-center justify-center rounded-md ring-1 ${a.chip}`}
          >
            {icon}
          </span>
        )}
      </div>

      {/* Размер по ширине экрана: на узком крупный шрифт не помещался и число
          обрезалось молча — это хуже, чем то же число на пару пунктов мельче. */}
      <div
        className={`nums mt-2 break-all font-bold leading-none tracking-tight ${
          hero ? 'text-2xl lg:text-3xl' : 'text-xl lg:text-2xl'
        } ${
          tone === 'good' ? 'text-good-400' : tone === 'bad' ? 'text-bad-400' : ''
        }`}
      >
        {value}
      </div>

      {sub && (
        <div
          className={`nums mt-1 text-xs font-medium ${
            subTone === 'good' ? 'text-good-400/90' : subTone === 'bad' ? 'text-bad-400/90' : 'text-white/55'
          }`}
        >
          {sub}
        </div>
      )}

      {meter !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/8">
          <div
            className={`h-full rounded-full ${a.bar}`}
            style={{ width: `${Math.round(meter * 100)}%` }}
          />
        </div>
      )}
      {children}
    </>
  )

  // Tier 2, not a card of its own: these four sit INSIDE one panel now, the way the
  // reference nests a stats tile inside a stats card. No lift on hover either — an
  // inner tile that rises off its parent breaks the illusion that they're one object;
  // it brightens instead.
  // Не <button>: внутри плитки живёт кнопка ⓘ, а кнопка в кнопке ломает разметку.
  // Клик по ⓘ выборку не запускает.
  if (onClick)
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('button')) onClick()
        }}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            onClick()
          }
        }}
        className={`panel-inset block cursor-pointer px-4 py-4 text-left transition-colors duration-150 hover:bg-white/[0.06] ${
          hero ? 'relative overflow-hidden' : ''
        }`}
      >
        {body}
      </div>
    )
  if (href)
    return (
      <Link
        href={href}
        className={`panel-inset block px-4 py-4 transition-colors duration-150 hover:bg-white/[0.06] ${
          hero ? 'relative overflow-hidden' : ''
        }`}
      >
        {body}
      </Link>
    )
  return <div className="panel-inset px-3.5 py-3">{body}</div>
}
