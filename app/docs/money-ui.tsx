// Общие кирпичи вкладок «Деньги»: итог сверху плитками-цифрами, ниже одна таблица.
//
// Образец — «Водители» (29.09.2026 владелец: «это должно быть главным и переделай все
// остальные разделы»): вкладки были разного устройства — где карточки с кнопками, где
// вложенные рамки неделя → диспетчер → водитель, и одни и те же цифры читались
// по-разному. Теперь у всех один порядок: что за период и итог, затем строки таблицы
// с одинаковыми колонками, по нажатию строка раскрывается.

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { usd2, weekLabel } from '@/lib/fmt'
import type { Locale } from '@/lib/i18n'
import { todayEt } from '@/lib/payments'
import { ChipNav } from './tab-nav'

export const rpmOf = (gross: number, miles: number) => (miles > 0 ? gross / miles : null)

/** Цвет RPM строки относительно RPM парка: на 5% выше — зелёный, на 5% ниже — красный. */
export function rpmTone(rate: number | null, base: number | null): string {
  if (rate == null || base == null) return 'text-t1'
  if (rate >= base * 1.05) return 'text-good-400'
  if (rate <= base * 0.95) return 'text-bad-400'
  return 'text-t1'
}

/** Пятница недели как yyyy-mm-dd — так неделя пишется в адресе (?week=). */
export const weekDay = (ms: number) => todayEt(new Date(ms))

/** Недели для полосы выбора: текущая всегда (даже пустая), дальше — недели с работой,
 *  свежие первыми; выбранная — из адреса, иначе текущая. */
export function pickWeeks(keys: Iterable<number>, current: number, param: string | undefined, shown = 8) {
  const list = [...new Set([current, ...keys])]
    .filter((ms) => ms <= current + 7 * 86_400_000)
    .sort((a, b) => b - a)
    .slice(0, shown)
  const chosen = list.find((ms) => weekDay(ms) === param) ?? current
  return { list, chosen }
}

export function WeekChips({
  tab,
  weeks,
  chosen,
  current,
  currentLabel,
  locale,
}: {
  tab: string
  weeks: number[]
  chosen: number
  current: number
  currentLabel: string
  locale: Locale
}) {
  return (
    <ChipNav
      items={weeks.map((ms) => ({
        key: String(ms),
        href: `/docs?tab=${tab}&week=${weekDay(ms)}`,
        label: ms === current ? currentLabel : weekLabel(ms, locale).replace(/ \d{4}$/, ''),
        active: ms === chosen,
      }))}
    />
  )
}

/** Итог вкладки: заголовок периода, пояснение справа, цифры плитками, снизу действие. */
export function Summary({
  title,
  note,
  children,
  footer,
}: {
  title: ReactNode
  note?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {note && <span className="flex items-center gap-1 text-xs text-t3">{note}</span>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 @2xl:grid-cols-4">{children}</div>
      {footer && <div className="mt-3 flex flex-wrap gap-2">{footer}</div>}
    </section>
  )
}

export function Figure({
  label,
  value,
  sub,
  accent,
  tone = 'text-t1',
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
  tone?: string
}) {
  return (
    <div className={`panel-inset px-3 py-2.5 ${accent ? 'ring-1 ring-haul-400/30 ring-inset' : ''}`}>
      <div className="text-2xs font-semibold tracking-wide text-t3 uppercase">{label}</div>
      <div className={`nums mt-1 text-xl font-bold ${accent ? 'text-haul-300' : tone}`}>{value}</div>
      {sub && <div className="nums mt-0.5 text-xs text-t3">{sub}</div>}
    </div>
  )
}

/** Сетка строки «имя + четыре цифры» — у водителей, недель и диспетчеров одна. */
export const ROW5 = '@3xl:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]'
/** Сетка строки груза в «Не оплачено» и «Оплачено»: груз, срок, сумма, $/mi, кнопки. */
export const LOAD_ROW = '@3xl:grid-cols-[minmax(0,2.4fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_12.5rem]'

/** Шапка колонок — только на широкой плитке; на узкой у каждой цифры своя подпись. */
export function TableHead({ grid, cols }: { grid: string; cols: string[] }) {
  return (
    <div
      className={`hidden gap-3 border-b border-white/8 px-4 py-2.5 text-2xs font-semibold tracking-wide text-t3 uppercase @3xl:grid ${grid}`}
    >
      {cols.map((c, i) => (
        <span key={i} className={i === 0 ? '' : 'text-right'}>
          {c}
        </span>
      ))}
    </div>
  )
}

/** Цифра строки. На узкой плитке — с подписью над собой, на широкой подпись в шапке. */
export function Cell({
  label,
  value,
  sub,
  strong,
  big,
  tone = 'text-t1',
  className = '',
}: {
  className?: string
  label: string
  value: string
  sub?: string
  strong?: boolean
  big?: boolean
  tone?: string
}) {
  return (
    <div className={`min-w-0 @3xl:text-right ${className}`}>
      <div className="text-2xs font-semibold tracking-wide text-t3 uppercase @3xl:hidden">{label}</div>
      <div className={`nums ${big ? 'text-lg font-bold' : strong ? 'text-md font-semibold' : 'text-md'} ${tone}`}>{value}</div>
      {sub && <div className="nums text-xs text-t3">{sub}</div>}
    </div>
  )
}

/** Раскрывающаяся строка таблицы: сводка — сеткой колонок, под ней подробности. */
export function RowDetails({
  grid,
  head,
  children,
  open,
}: {
  grid: string
  head: ReactNode
  children: ReactNode
  open?: boolean
}) {
  return (
    <details className="group/row" open={open}>
      <summary
        className={`grid cursor-pointer list-none grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-white/[0.03] @3xl:items-center ${grid} [&::-webkit-details-marker]:hidden`}
      >
        {head}
      </summary>
      <div className="border-t border-white/6 bg-white/[0.015] px-2 py-2 @3xl:pl-10">{children}</div>
    </details>
  )
}

/** Первая ячейка раскрывающейся строки: стрелка и имя, под ним — мелкая строка. */
export function NameCell({ title, under }: { title: ReactNode; under?: ReactNode }) {
  return (
    <div className="col-span-2 flex min-w-0 items-center gap-2 @3xl:col-span-1">
      <ChevronDown size={15} className="shrink-0 text-t3 transition-transform group-open/row:rotate-180" />
      <div className="min-w-0">
        <div className="truncate text-md font-semibold text-t1">{title}</div>
        {under}
      </div>
    </div>
  )
}

/** Группа строк внутри таблицы («Просрочено», «Сентябрь 2026»): заголовок с числом и
 *  суммой, сворачивается нажатием. */
export function Group({
  title,
  count,
  amount,
  extra,
  tone = 'plain',
  open,
  children,
}: {
  title: string
  count: number
  amount: string
  extra?: string
  tone?: 'plain' | 'good' | 'warn' | 'bad'
  open: boolean
  children: ReactNode
}) {
  const color =
    tone === 'bad' ? 'text-bad-400' : tone === 'warn' ? 'text-warn-400' : tone === 'good' ? 'text-good-400' : 'text-t1'
  return (
    <details className="group/grp border-b border-white/6 last:border-b-0" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-2 bg-white/[0.025] px-4 py-2.5 transition-colors hover:bg-white/[0.05] [&::-webkit-details-marker]:hidden">
        <ChevronDown size={15} className="shrink-0 -rotate-90 text-t3 transition-transform group-open/grp:rotate-0" />
        <span className={`text-base font-semibold ${color}`}>{title}</span>
        <span className="nums rounded-full bg-white/8 px-1.5 py-0.5 text-xs font-semibold text-t2">{count}</span>
        <span className="nums ml-auto text-base font-semibold text-t1">{amount}</span>
        {extra && <span className="nums text-sm text-t3 max-sm:hidden">{extra}</span>}
      </summary>
      <ul className="divide-y divide-white/6">{children}</ul>
    </details>
  )
}

/** RPM водителя или парка за последние недели — столбиками; выбранная неделя подсвечена.
 *  Высота — от самого низкого RPM за эти недели до самого высокого, иначе $2.80 и
 *  $3.40 выглядели одинаковыми столбиками. Цифры — во всплывающей подсказке. */
export function Trend({
  points,
  min,
  max,
  chosen,
  locale,
}: {
  points: { ms: number; rpm: number | null }[]
  min: number
  max: number
  chosen: number
  locale: Locale
}) {
  if (points.filter((p) => p.rpm != null).length < 2) return null
  const span = max - min || 1
  return (
    <div className="mt-1.5 flex h-5 items-end gap-[3px]">
      {points.map((p) => (
        <span
          key={p.ms}
          title={`${weekLabel(p.ms, locale)}: ${p.rpm != null ? `${usd2.format(p.rpm)}/mi` : '—'}`}
          className={`block w-2 rounded-[2px] ${p.ms === chosen ? 'bg-haul-400' : 'bg-white/25'}`}
          style={{ height: p.rpm != null ? `${5 + ((p.rpm - min) / span) * 15}px` : '2px' }}
        />
      ))}
    </div>
  )
}

/** Строка-ссылка на груз внутри раскрытой строки: маршрут, номер, день — слева; мили,
 *  ставка и $/mi — справа. */
export function LoadLine({
  href,
  route,
  meta,
  miles,
  amount,
  rpm,
}: {
  href: string
  route: string
  meta: string
  miles: number
  amount: string
  rpm: number | null
}) {
  return (
    <Link
      href={href}
      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg px-2 py-1.5 text-sm text-t2 transition-colors hover:bg-white/5 hover:text-t1"
    >
      <span className="min-w-0">
        <span className="text-t1">{route}</span>
        <span className="nums text-t3">{meta}</span>
      </span>
      <span className="nums shrink-0 text-t2">
        {Math.round(miles)} mi · <b className="font-semibold text-t1">{amount}</b>
        {rpm != null ? ` · ${usd2.format(rpm)}/mi` : ''}
      </span>
    </Link>
  )
}
