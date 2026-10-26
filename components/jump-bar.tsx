'use client'

// Плавающая плашка-переход над разделом: все траки («Траки») или грузы, которые
// сейчас везут («Грузы»), — по кнопке на каждый, нажатие открывает карточку.
// Та же липкая полоса, что «Трак ⇄ Груз» на карточках (components/pair-bar.tsx):
// диспетчер прыгает по парку, не прокручивая список.
//
// Компьютер: все кнопки видны, переносятся строками. Телефон: одна строка с
// прокруткой пальцем и кнопка «Показать все» — тогда тоже строками. Ничего не
// обрезается: длинная подпись сокращается многоточием, полная — в title.

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, Package, Truck } from 'lucide-react'
import { RateConButton } from '@/components/ratecon-button'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export type JumpItem = {
  id: number
  href: string
  /** Первая строка, жирным: «TRK-1935 · Juan L.» или «Manteno, IL → Aurora, CO». */
  title: string
  /** Вторая строка, мелко: куда едет / где стоит / трак груза. */
  sub: string
  /** busy — везёт, free — свободен, off — не работает, late — опаздывает. */
  tone: 'busy' | 'free' | 'off' | 'late'
  /** Rate Con груза на кнопке — открывается окном поверх страницы. */
  rcId?: number | null
}

const DOT: Record<JumpItem['tone'], string> = {
  busy: 'bg-haul-400',
  free: 'bg-good-400',
  off: 'bg-t3',
  late: 'bg-bad-400',
}

export function JumpBar({ kind, items }: { kind: 'trucks' | 'loads'; items: JumpItem[] }) {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  const Icon = kind === 'trucks' ? Truck : Package
  return (
    <nav
      aria-label={t(locale, kind === 'trucks' ? 'pair.fleetTrucks' : 'pair.fleetLoads')}
      // Раскрытый список на телефоне — уже не липкий: высокая полоса закрывала бы экран.
      className={`${open ? 'max-sm:static' : ''} sticky top-[var(--sticky-top)] z-30 mt-2 rounded-xl border border-white/8 bg-ink-950/85 p-1 backdrop-blur sm:mt-3 sm:rounded-2xl sm:p-1.5`}
    >
      <div className="flex items-start gap-1.5">
        <span
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-1.5 text-xs font-semibold text-t2"
          title={t(locale, kind === 'trucks' ? 'pair.fleetTrucks' : 'pair.fleetLoads')}
        >
          <Icon size={16} className={kind === 'trucks' ? 'text-haul-400' : 'text-good-400'} aria-hidden />
          <span className="nums">{items.length}</span>
        </span>
        <ul
          className={`flex min-w-0 flex-1 gap-1 ${
            open ? 'flex-wrap' : 'overflow-x-auto [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible'
          }`}
        >
          {items.map((it) => (
            <li
              key={it.id}
              className="flex h-11 shrink-0 items-center rounded-lg border border-white/12 bg-ink-900/70 transition-colors hover:border-haul-400/60 hover:bg-haul-500/10"
            >
              <Link href={it.href} title={`${it.title} — ${it.sub}`} className="flex h-full min-w-0 items-center gap-2 px-2">
                <span className={`size-2 shrink-0 rounded-full ${DOT[it.tone]}`} aria-hidden />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="max-w-[8.5rem] truncate sm:max-w-[11rem] text-sm font-semibold text-t1">{it.title}</span>
                  <span className="max-w-[8.5rem] truncate sm:max-w-[11rem] text-xs text-t2">{it.sub}</span>
                </span>
              </Link>
              {it.rcId != null && (
                <span className="pr-1">
                  <RateConButton docId={it.rcId} compact />
                </span>
              )}
            </li>
          ))}
        </ul>
        {/* Свернуть/развернуть — только на телефоне: на компьютере и так видно всё. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={t(locale, open ? 'pair.fleetLess' : 'pair.fleetMore')}
          aria-label={t(locale, open ? 'pair.fleetLess' : 'pair.fleetMore')}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-white/12 text-t2 hover:border-haul-400/60 hover:text-white sm:hidden"
        >
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>
    </nav>
  )
}
