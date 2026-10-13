// Плитка с цифрой — одна на приложение, чтобы плитки разделов не расходились в стиле.
// С 13/10/26 — по образцу SmartHop (владелец: «мне понравился новый вид, переделай всё»):
// название обычными буквами и жирным, справа кольцо «сколько из скольких», крупное
// число обычным шрифтом, под ним картинка. Подписей капсом и значков в цветном квадрате
// на образце нет — их больше нет и здесь.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Info } from '@/components/info'
import { GoalRing } from '@/components/today-cards'

/** Цвет полосы под цифрой. Только смысловые четыре: цвет значит что-то, а не красит. */
const ACCENTS = {
  haul: { bar: 'bg-haul-400' },
  good: { bar: 'bg-good-400' },
  warn: { bar: 'bg-warn-400' },
  bad: { bar: 'bg-bad-400' },
} as const

export function Stat({
  label,
  value,
  tone,
  sub,
  subTone,
  info,
  href,
  accent = 'haul',
  meter,
  hero,
  onClick,
  compact,
  surface = 'inset',
  word,
  ring,
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
  /** Больше не рисуется (образец SmartHop — без значков на плитках); оставлен, чтобы
   *  разделы не ломались, пока их плитки не переписаны. */
  icon?: ReactNode
  accent?: keyof typeof ACCENTS
  /** 0..1 — draws a thin fill bar along the bottom of the tile. */
  meter?: number
  /** Главная цифра ряда (гросс): на ступень крупнее остальных. Цветной полосы сверху
   *  больше нет — на образце её нет. */
  hero?: boolean
  /** На какой поверхности живёт плитка. 'inset' — внутри общей карточки (так она
   * устроена на странице грузов). 'panel' — сама себе карточка: в переставляемой
   * сетке плитка лежит прямо на странице, и плёнка panel-inset на ней не видна. */
  surface?: 'inset' | 'panel'
  /** Плитка-кнопка: на странице грузов клик сужает список до своих грузов. */
  onClick?: () => void
  /** Поля и число на шаг мельче: когда плиток на экране много и первый экран телефона
   * иначе занимают одни только четыре числа. Обычные плитки не трогает. */
  compact?: boolean
  /** Значение — слово («Georgia», «горячий»), а не число: оно и подпись под ним —
   *  обычным шрифтом и с переносом по словам. Моноширинный — только у цифр. */
  word?: boolean
  /** Кольцо справа от названия — доля 0..100 («сколько из скольких», как на образце
   *  SmartHop). null — кольцо пустое: сравнивать не с чем. */
  ring?: number | null
  /** Мини-график под цифрой. */
  children?: ReactNode
}) {
  const a = ACCENTS[accent]
  const skin = surface === 'panel' ? 'panel panel-interactive' : 'panel-inset'
  const body = (
    <>
      {/* Название первым, цифра второй. Жирное и обычными буквами, как заголовок
          карточки на образце; переносится на вторую строку, а не обрезается: «TOT…»
          не говорит ничего. Справа — кольцо, если плитка про долю. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1 text-md font-semibold leading-snug text-t1">
          <span className="min-w-0">{label}</span>
          {info && <Info text={info} />}
        </div>
        {ring !== undefined && <GoalRing pct={ring} />}
      </div>

      {/* Размер по ширине экрана: на узком крупный шрифт не помещался и число
          обрезалось молча — это хуже, чем то же число на пару пунктов мельче. */}
      <div
        className={`${word ? 'break-words' : 'nums break-all'} font-bold leading-none tracking-tight ${
          ring !== undefined ? 'mt-0' : compact ? 'mt-2 lg:mt-3' : 'mt-3'
        } ${
          hero
            ? compact
              ? 'text-xl lg:text-3xl'
              : 'text-2xl lg:text-3xl'
            : compact
              ? 'text-lg lg:text-2xl'
              : 'text-xl lg:text-2xl'
        } ${
          tone === 'good' ? 'text-good-400' : tone === 'bad' ? 'text-bad-400' : ''
        }`}
      >
        {value}
      </div>

      {sub && (
        <div
          className={`${word ? '' : 'nums '}mt-1.5 text-xs font-medium ${
            subTone === 'good' ? 'text-good-400/90' : subTone === 'bad' ? 'text-bad-400/90' : 'text-t3'
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
        className={`${skin} block cursor-pointer text-left transition-colors duration-150 hover:bg-white/[0.06] ${
          compact ? 'px-3 py-2.5 lg:px-4 lg:py-4' : 'px-4 py-4'
        } ${hero ? 'relative overflow-hidden' : ''}`}
      >
        {body}
      </div>
    )
  if (href)
    return (
      <Link
        href={href}
        className={`${skin} block transition-colors duration-150 hover:bg-white/[0.06] ${
          compact ? 'px-3 py-2.5 lg:px-4 lg:py-4' : 'px-4 py-4'
        } ${hero ? 'relative overflow-hidden' : ''}`}
      >
        {body}
      </Link>
    )
  return <div className={`${skin} px-3.5 py-3`}>{body}</div>
}
