// Карточки главной «Сегодня» по образцу SmartHop (владелец прислал 10/10/26: «наш TMS
// должен выглядеть примерно так же»). Как на образце: цели — кольцом с процентом,
// грузы и задачи — крупной цифрой и коротким списком, деньги — тёмной карточкой,
// топливо — цветной, траки — таблицей со статусом и полосой рейса. Цифр для чтения
// меньше, картинок больше (правило владельца 09.10).
//
// Без 'use client': всё рисуется на сервере, клиентские здесь только кнопки RC и ⓘ.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react'
import { Info } from '@/components/info'
import { RateConButton } from '@/components/ratecon-button'

/** Кольцо «сколько из цели»: процент виден издалека, без чтения цифр. Цель взята —
 *  кольцо полное и зелёное. null — сравнивать не с чем, кольцо пустое. */
export function GoalRing({ pct }: { pct: number | null }) {
  const r = 20
  const c = 2 * Math.PI * r
  const shown = pct == null ? 0 : Math.max(0, Math.min(100, pct))
  const done = pct != null && pct >= 100
  return (
    <span className="relative inline-flex size-[3.25rem] shrink-0 items-center justify-center">
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="stroke-white/10" />
        {shown > 0 && (
          <circle
            cx="24"
            cy="24"
            r={r}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${(shown / 100) * c} ${c}`}
            className={done ? 'stroke-good-500' : 'stroke-haul-500'}
          />
        )}
      </svg>
      <span className="nums text-xs font-bold text-t1">{pct == null ? '—' : `${Math.round(pct)}%`}</span>
    </span>
  )
}

/** Заголовок карточки — ссылка на весь раздел. Растянута на всю карточку (after:inset-0),
 *  поэтому нажимается любое место, а кнопки внутри (ⓘ, RC, строки) лежат поверх неё
 *  своим слоем: ссылка в ссылке и кнопка в ссылке — недопустимый HTML. */
function CardTitle({ href, title, info }: { href: string; title: string; info?: string }) {
  return (
    <h2 className="flex min-w-0 items-center gap-1 text-md font-semibold text-t1">
      {/* На телефоне карточка — пол-экрана: название переносится, а не режется в «Гросс …». */}
      <Link href={href} className="min-w-0 break-words after:absolute after:inset-0 after:rounded-2xl sm:truncate">
        {title}
      </Link>
      {info && (
        <span className="relative z-[1]">
          <Info text={info} />
        </span>
      )}
    </h2>
  )
}

/** Цель и сколько уже есть: кольцо справа, под ним две строки — «Цель» и «Сейчас». */
export function GoalCard({
  title,
  info,
  href,
  pct,
  goal,
  now,
}: {
  title: string
  info?: string
  href: string
  pct: number | null
  goal: { label: string; value: string }
  now: { label: string; value: string }
}) {
  return (
    <div className="panel panel-interactive relative flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <CardTitle href={href} title={title} info={info} />
        <GoalRing pct={pct} />
      </div>
      <dl className="mt-auto pt-2 text-sm">
        <div className="flex items-baseline justify-between gap-2 py-1.5">
          <dt className="text-t3">{goal.label}</dt>
          <dd className="nums whitespace-nowrap font-semibold text-t2">{goal.value}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t border-white/[0.07] py-1.5">
          <dt className="text-t3">{now.label}</dt>
          <dd className="nums whitespace-nowrap font-bold text-t1">{now.value}</dd>
        </div>
      </dl>
    </div>
  )
}

export type ListRow = {
  key: string
  href: string
  title: string
  /** Полный текст в подсказке, когда в строке он сокращён. */
  hint?: string
  /** Правая колонка: дата у груза. */
  side?: string
  /** Важность у задачи: стрелка вверх (красная или жёлтая) или вниз (зелёная). */
  level?: 'high' | 'mid' | 'low'
  rcId?: number
}

const LEVEL: Record<NonNullable<ListRow['level']>, { icon: ReactNode; cls: string }> = {
  high: { icon: <ArrowUp size={14} strokeWidth={2.6} />, cls: 'text-bad-400' },
  mid: { icon: <ArrowUp size={14} strokeWidth={2.6} />, cls: 'text-warn-400' },
  low: { icon: <ArrowDown size={14} strokeWidth={2.6} />, cls: 'text-good-400' },
}

/** Крупная цифра в цвете акцента и короткий список под ней — «Грузы» и «Ждёт тебя».
 *  Над списком подписи колонок, как на образце («Ближайшие · Дата», «Задача · Важность»). */
export function ListCard({
  title,
  info,
  href,
  count,
  head,
  rows,
  empty,
  more,
}: {
  title: string
  info?: string
  href: string
  count: number
  head: [string, string]
  rows: ListRow[]
  empty: string
  /** Ссылка под списком: «Все задачи», «Все грузы». */
  more?: { href: string; label: string }
}) {
  return (
    <div className="panel panel-interactive relative flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <CardTitle href={href} title={title} info={info} />
        <span className="nums text-3xl font-bold leading-none text-haul-400">{count}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-auto pt-3 text-sm text-t3">{empty}</p>
      ) : (
        <div className="mt-2.5">
          <div className="flex justify-between gap-2 pb-1 text-2xs font-medium text-t3">
            <span>{head[0]}</span>
            <span>{head[1]}</span>
          </div>
          <ul className="relative z-[1]">
            {rows.map((r) => (
              // Узкая карточка (телефон, пол-экрана): дата и RC переносятся под название,
              // а само название — в две строки, чтобы «стоит 15 дн» не обрезалось.
              <li key={r.key} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 border-t border-white/[0.07] py-1">
                <Link
                  href={r.href}
                  title={r.hint ?? r.title}
                  className="min-w-0 flex-1 basis-[7rem] text-sm text-t1 hover:underline max-sm:line-clamp-2 max-sm:break-words sm:truncate"
                >
                  {r.title}
                </Link>
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  {r.side && <span className="nums text-xs text-t2">{r.side}</span>}
                  {r.level && (
                    <span className={LEVEL[r.level].cls} aria-hidden>
                      {LEVEL[r.level].icon}
                    </span>
                  )}
                  {r.rcId != null && <RateConButton docId={r.rcId} compact />}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {more && (
        <Link
          href={more.href}
          className="relative z-[1] mt-auto flex items-center gap-0.5 self-start pt-2 text-xs font-semibold text-haul-400 hover:underline"
        >
          {more.label}
          <ChevronRight size={13} strokeWidth={2.4} />
        </Link>
      )}
    </div>
  )
}

/** Тёмная карточка денег («Smart Wallet» на образце): одна большая сумма и полоса —
 *  зелёная часть ждёт в срок, красная просрочена. Тёмная в обеих темах. */
export function WalletCard({
  title,
  info,
  href,
  caption,
  value,
  bar,
  note,
}: {
  title: string
  info?: string
  href: string
  caption: string
  value: string
  /** Доли полосы, 0..1: зелёная и красная. Пусто — полосы нет. */
  bar?: { good: number; bad: number }
  note?: ReactNode
}) {
  return (
    <div className="card-ink panel-interactive relative flex h-full flex-col rounded-2xl p-4">
      <h2 className="flex min-w-0 items-center gap-1 text-md font-semibold">
        <Link href={href} className="min-w-0 break-words after:absolute after:inset-0 after:rounded-2xl">
          {title}
        </Link>
        {info && (
          <span className="relative z-[1]">
            <Info text={info} onColor />
          </span>
        )}
      </h2>
      <div className="mt-auto pt-4">
        <div className="text-xs text-[#fff]/60">{caption}</div>
        <div className="nums mt-0.5 text-3xl font-bold leading-tight tracking-tight">{value}</div>
        {bar && (
          <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-[#fff]/15" aria-hidden>
            <span className="h-full bg-[#4ade80]" style={{ width: `${bar.good * 100}%` }} />
            <span className="h-full bg-[#ff7a85]" style={{ width: `${bar.bad * 100}%` }} />
          </div>
        )}
        {note && <div className="mt-1.5 text-xs text-[#fff]/75">{note}</div>}
      </div>
    </div>
  )
}

/** Цветная карточка топлива («Smart Fuel» на образце): цена галлона плашкой, крупно —
 *  во что обошлось топливо недели, полоса — его доля в гроссе. */
export function FuelCard({
  title,
  info,
  href,
  chip,
  caption,
  value,
  share,
  shareLabel,
}: {
  title: string
  info?: string
  href: string
  chip?: string
  caption: string
  value: string
  /** Доля в гроссе, 0..1. */
  share: number | null
  shareLabel?: string
}) {
  return (
    <div className="panel-interactive relative flex h-full flex-col rounded-2xl bg-haul-500 p-4 text-[#fff] shadow-[var(--shadow-accent)]">
      {/* flex-wrap: на телефоне плашка цены уходит под название, а не режет его в «То…». */}
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <h2 className="flex min-w-0 items-center gap-1 text-md font-semibold">
          <Link href={href} className="min-w-0 break-words after:absolute after:inset-0 after:rounded-2xl">
            {title}
          </Link>
          {info && (
            <span className="relative z-[1]">
              <Info text={info} onColor />
            </span>
          )}
        </h2>
        {chip && <span className="nums shrink-0 rounded-lg bg-[#fff]/20 px-2 py-0.5 text-xs font-semibold">{chip}</span>}
      </div>
      <div className="mt-auto pt-4">
        <div className="text-xs text-[#fff]/80">{caption}</div>
        <div className="nums mt-0.5 text-3xl font-bold leading-tight tracking-tight">{value}</div>
        {share != null && (
          <>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#fff]/25" aria-hidden>
              <span className="block h-full rounded-full bg-[#fff]" style={{ width: `${Math.min(1, share) * 100}%` }} />
            </div>
            {shareLabel && <div className="mt-1.5 text-xs text-[#fff]/85">{shareLabel}</div>}
          </>
        )}
      </div>
    </div>
  )
}

export type TruckStatusRow = {
  id: number
  number: string
  driver: string
  place: string | null
  status: { label: string; kind: 'loaded' | 'pickup' | 'empty' | 'off' }
  /** Сколько шагов рейса пройдено: 0 — груза нет, 1 — груз есть, 2 — погрузился,
   *  3 — доставил. null — трак не работает (ремонт, отпуск, дома). */
  steps: number | null
  caption?: { text: string; tone?: 'warn' | 'bad' | 'good' }
  rcId?: number
}

const PILL: Record<TruckStatusRow['status']['kind'], string> = {
  loaded: 'bg-haul-500 text-[#fff]',
  pickup: 'bg-haul-500/15 text-haul-300',
  empty: 'bg-white/[0.08] text-t2',
  off: 'border border-white/10 text-t3',
}

/** «Статус траков» — таблица как на образце: трак, водитель, где, статус плашкой и
 *  полоса рейса из трёх шагов (груз есть → погрузился → доставил). */
export function TruckStatusCard({
  title,
  info,
  rows,
  all,
  cols,
  steps,
  more,
}: {
  title: string
  info?: string
  rows: TruckStatusRow[]
  all: { href: string; label: string }
  cols: { truck: string; driver: string; place: string; status: string; trip: string }
  /** Подписи трёх шагов рейса — в подсказке у полосы. */
  steps: [string, string, string]
  /** «ещё N» под таблицей, когда траков больше, чем строк. */
  more?: string
}) {
  const capCls = (tone?: 'warn' | 'bad' | 'good') =>
    tone === 'bad' ? 'font-semibold text-bad-400' : tone === 'warn' ? 'text-warn-400' : tone === 'good' ? 'text-good-400' : 'text-t3'
  return (
    <div className="panel flex h-full flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-1 text-md font-semibold text-t1">
          <span className="truncate">{title}</span>
          {info && <Info text={info} />}
        </h2>
        <Link
          href={all.href}
          className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold text-t2 transition-colors hover:border-haul-500 hover:text-haul-400"
        >
          {all.label}
        </Link>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm sm:min-w-[30rem]">
          <thead>
            <tr className="text-left text-2xs font-medium text-t3">
              <th className="py-1.5 pr-2 font-medium">{cols.truck}</th>
              <th className="py-1.5 pr-2 font-medium max-sm:hidden">{cols.driver}</th>
              <th className="py-1.5 pr-2 font-medium max-sm:hidden">{cols.place}</th>
              <th className="py-1.5 pr-2 font-medium">{cols.status}</th>
              <th className="py-1.5 font-medium">{cols.trip}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/[0.07] align-middle">
                <td className="py-1.5 pr-2">
                  <Link href={`/trucks/${r.id}`} className="nums font-semibold text-t1 hover:underline">
                    {r.number}
                  </Link>
                  {/* Телефон: водитель под номером, своего столбца нет — иначе таблица шире экрана. */}
                  {r.driver && <div className="max-w-[7rem] truncate text-xs text-t2 sm:hidden">{r.driver}</div>}
                </td>
                <td className="py-1.5 pr-2 text-t1 max-sm:hidden">
                  <div className="max-w-[8rem] truncate">{r.driver || '—'}</div>
                </td>
                <td className="py-1.5 pr-2 text-t2 max-sm:hidden" title={r.place ?? undefined}>
                  <div className="max-w-[11rem] truncate">{r.place ?? '—'}</div>
                </td>
                <td className="py-1.5 pr-2">
                  <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${PILL[r.status.kind]}`}>
                    {r.status.label}
                  </span>
                </td>
                <td className="py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-[4.5rem] flex-1 sm:min-w-[6rem]">
                      <div className="flex gap-1" title={steps.join(' → ')} aria-hidden>
                        {[1, 2, 3].map((n) => (
                          <span
                            key={n}
                            className={`h-1.5 flex-1 rounded-full ${
                              r.steps == null ? 'bg-white/[0.05]' : n <= r.steps ? 'bg-haul-500' : 'bg-white/10'
                            }`}
                          />
                        ))}
                      </div>
                      {r.caption && (
                        <div className={`mt-1 truncate text-2xs leading-none ${capCls(r.caption.tone)}`}>{r.caption.text}</div>
                      )}
                    </div>
                    {r.rcId != null && <RateConButton docId={r.rcId} compact />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && (
        <Link href={all.href} className="mt-auto self-start pt-2 text-xs font-semibold text-haul-400 hover:underline">
          {more}
        </Link>
      )}
    </div>
  )
}
