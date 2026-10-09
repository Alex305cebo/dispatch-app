// Лента «Ждёт тебя» на «Сегодня» — всё, по чему нужно что-то сделать, в одном месте
// (план «Порядок в TMS», 10/09/26). До неё это лежало в трёх местах: пустые траки,
// сроки документов и важное от брокера — плитками «Обзора», опоздания, бумаги и
// счета — блоком «Требуют действия» на «Грузах».
//
// Разделы идут по срочности, пустых разделов нет вовсе. В разделе пять первых строк,
// остальные под «ещё N» — без скрипта, обычным <details>.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Info } from '@/components/info'
import { RateConButton } from '@/components/ratecon-button'

export type FeedTone = 'bad' | 'warn' | 'haul' | 'good'

export type FeedItem = {
  key: string
  href: string
  title: ReactNode
  detail: ReactNode
  /** Цвет правой части строки; без него — приглушённый. */
  tone?: FeedTone
  /** Правая часть — сумма: моноширинные цифры, чтобы столбик сумм читался ровно. */
  money?: boolean
  /** Строка про груз с Rate Con — кнопка открыть его справа от строки. */
  rcId?: number
}

export type FeedSection = {
  key: string
  title: string
  icon: ReactNode
  tone: FeedTone
  info?: string
  /** Итог справа от заголовка раздела, например «$648/день простоя». */
  aside?: ReactNode
  items: FeedItem[]
}

const CHIP: Record<FeedTone, string> = {
  bad: 'bg-bad-500/15 text-bad-400 ring-bad-400/25',
  warn: 'bg-warn-400/15 text-warn-400 ring-warn-400/25',
  haul: 'bg-haul-500/15 text-haul-300 ring-haul-400/25',
  good: 'bg-good-500/15 text-good-400 ring-good-400/25',
}

const TEXT: Record<FeedTone, string> = {
  bad: 'text-bad-400',
  warn: 'text-warn-400',
  haul: 'text-haul-300',
  good: 'text-good-400',
}

const SHOWN = 5

export function TodayFeed({
  title,
  empty,
  more,
  sections,
}: {
  title: string
  /** Что сказать, когда ничего не ждёт. */
  empty: string
  /** «ещё {n}» */
  more: string
  sections: FeedSection[]
}) {
  const live = sections.filter((s) => s.items.length > 0)
  const total = live.reduce((n, s) => n + s.items.length, 0)
  return (
    <section className="panel h-full p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg leading-7 font-semibold text-t1">
        {title}
        {total > 0 && (
          <span className="nums rounded-full bg-warn-400/15 px-2 text-sm leading-6 font-semibold text-warn-400 ring-1 ring-warn-400/25">
            {total}
          </span>
        )}
      </h2>
      {live.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-base text-good-400">
          <CheckCircle2 size={17} strokeWidth={2.25} />
          {empty}
        </p>
      ) : (
        // На широком экране — две колонки, когда разделов хватает на обе: длинная лента
        // в одну колонку на 1100 px читается как таблица с пустой серединой.
        <div className={`mt-3 ${live.length >= 3 ? 'lg:columns-2 lg:gap-10' : ''}`}>
          {live.map((s) => (
            <Section key={s.key} section={s} more={more} />
          ))}
        </div>
      )}
    </section>
  )
}

function Section({ section: s, more }: { section: FeedSection; more: string }) {
  const head = s.items.slice(0, SHOWN)
  const tail = s.items.slice(SHOWN)
  return (
    <div className="mb-5 break-inside-avoid last:mb-0">
      <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/8 pb-2">
        <span className={`flex size-6 shrink-0 items-center justify-center rounded-md ring-1 ${CHIP[s.tone]}`}>{s.icon}</span>
        <span className={`text-base leading-6 font-semibold ${TEXT[s.tone]}`}>{s.title}</span>
        <span className="nums text-sm text-t3">{s.items.length}</span>
        {s.info && <Info text={s.info} />}
        {s.aside && <span className="ml-auto text-sm text-t3">{s.aside}</span>}
      </h3>
      <ul className="divide-y divide-white/[0.06]">
        {head.map((item) => (
          <Row key={item.key} item={item} />
        ))}
      </ul>
      {tail.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none py-1.5 text-sm font-medium text-haul-300 hover:underline group-open:hidden max-md:min-h-9 [&::-webkit-details-marker]:hidden">
            {more.replace('{n}', String(tail.length))}
          </summary>
          <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
            {tail.map((item) => (
              <Row key={item.key} item={item} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Row({ item }: { item: FeedItem }) {
  return (
    // Кнопка Rate Con — рядом со ссылкой, а не внутри: <button> в <a> — невалидная разметка.
    <li className="flex items-center gap-2">
      <Link
        href={item.href}
        className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-base text-t1 transition-colors hover:text-white max-md:min-h-11 max-md:items-center"
      >
        <span className="min-w-0 break-words">{item.title}</span>
        {/* Без shrink-0: длинная подпись («Пикап · Chicago, IL · окно закрылось…») на
            телефоне уходит на вторую строку целиком, а не за край экрана. */}
        <span className={`min-w-0 break-words text-sm ${item.money ? 'nums' : ''} ${item.tone ? TEXT[item.tone] : 'text-t3'}`}>{item.detail}</span>
      </Link>
      {item.rcId && <RateConButton docId={item.rcId} compact />}
    </li>
  )
}
