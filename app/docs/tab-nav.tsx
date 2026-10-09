'use client'

// Переключатели «Документов»: разделы сегментом и вкладки «Денег» пилюлями.
//
// Все страницы собираются на сервере (force-dynamic), а смена вкладки меняет только
// ?tab=, поэтому общая заглушка загрузки (app/loading.tsx) здесь не показывается:
// нажатая кнопка стояла как была, пока сервер не вернёт новую вкладку, и на живой
// базе это читалось как «плохо нажимается» (владелец, 29.09.2026). Теперь нажатая
// кнопка загорается сразу, а вместо значка крутится колесо, пока вкладка грузится.

import Link, { useLinkStatus } from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SEGMENT_BAR, segmentClass } from '@/components/segmented'

export type NavItem = { key: string; href: string; label: string; icon?: ReactNode; active: boolean }

/** Какая кнопка горит: нажатая — сразу, до ответа сервера; потом — та, что пришла с сервера. */
function useActiveKey(items: NavItem[]) {
  const serverActive = items.find((i) => i.active)?.key ?? null
  const query = useSearchParams().toString()
  const [pressed, setPressed] = useState<string | null>(null)
  // Ответ пришёл или адрес сменился иначе (кнопка «назад») — снова верим серверу.
  useEffect(() => setPressed(null), [serverActive, query])
  return [pressed ?? serverActive, setPressed] as const
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
    />
  )
}

/** Значок, пока ссылка не нажата; колесо, пока грузится её вкладка. */
function IconOrSpinner({ icon }: { icon?: ReactNode }) {
  const { pending } = useLinkStatus()
  if (pending) return <Spinner />
  return <>{icon}</>
}

function ChipSpinner() {
  const { pending } = useLinkStatus()
  return pending ? <Spinner size={12} /> : null
}

export function SectionNav({ items, label }: { items: NavItem[]; label: string }) {
  const [active, press] = useActiveKey(items)
  return (
    <nav aria-label={label} className={`${SEGMENT_BAR} mb-4`}>
      {items.map((s) => {
        const on = s.key === active
        return (
          <Link
            key={s.key}
            href={s.href}
            onClick={() => press(s.key)}
            aria-current={on ? 'page' : undefined}
            className={segmentClass(on)}
          >
            <IconOrSpinner icon={s.icon} />
            {s.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function ChipNav({ items, className = '' }: { items: NavItem[]; className?: string }) {
  const [active, press] = useActiveKey(items)
  const bar = useRef<HTMLDivElement>(null)
  const serverActive = items.find((i) => i.active)?.key
  // На телефоне пилюли листаются вбок, и открытая вкладка («Факторинг», «Оплачено»)
  // оказывалась за краем экрана — подвигаем полосу так, чтобы она была видна.
  useEffect(() => {
    const el = bar.current
    const on = el?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!el || !on || el.scrollWidth <= el.clientWidth) return
    const left = on.getBoundingClientRect().left - el.getBoundingClientRect().left
    el.scrollLeft += left - (el.clientWidth - on.offsetWidth) / 2
  }, [serverActive])
  return (
    <div ref={bar} className={`-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 ${className}`}>
      {items.map((c) => {
        const on = c.key === active
        return (
          <Link
            key={c.key}
            href={c.href}
            onClick={() => press(c.key)}
            aria-current={on ? 'page' : undefined}
            className={`inline-flex min-h-9 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors select-none ${
              on
                ? 'border-haul-400/50 bg-haul-500/20 text-t1'
                : 'border-white/8 bg-white/4 text-t2 hover:border-white/16 hover:text-t1 active:bg-white/10'
            }`}
          >
            {c.label}
            <ChipSpinner />
          </Link>
        )
      })}
    </div>
  )
}
