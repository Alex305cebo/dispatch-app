'use client'

// Быстрый поиск по всему TMS — Ctrl+K (⌘K на Mac) с любой страницы или кнопка «Поиск»
// в меню. Окно сверху по центру: строка ввода, под ней найденное группами — разделы,
// грузы, траки, брокеры. Стрелки выбирают, Enter открывает, Esc закрывает.
//
// Список грузов, траков и брокеров приходит с сервера один раз при открытии
// (app/search-actions.ts) и живёт минуту; ищется тут же, на каждую букву без круга на
// сервер (lib/quick-search.ts). Клавиша — по коду клавиши, а не по букве: в русской
// раскладке Ctrl+K приходит как «Ctrl+л».

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Handshake, LayoutGrid, Package, Search, Truck } from 'lucide-react'
import { useLocale } from '@/components/locale-provider'
import { t, type MsgKey } from '@/lib/i18n'
import { groupByKind, quickMatch, type QuickItem, type QuickKind } from '@/lib/quick-search'
import { quickSearchIndex } from '@/app/search-actions'

const GROUP: Record<QuickKind, MsgKey> = { page: 'search.pages', load: 'nav.loads', truck: 'nav.trucks', broker: 'search.brokers' }
const ICON: Record<QuickKind, typeof Search> = { page: LayoutGrid, load: Package, truck: Truck, broker: Handshake }
/** Сколько живёт загруженный список: открыл окно через минуту — новый груз уже в нём. */
const FRESH_MS = 60_000

export function QuickSearch({ open, onOpenChange, pages }: { open: boolean; onOpenChange: (open: boolean) => void; pages: QuickItem[] }) {
  const locale = useLocale()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [index, setIndex] = useState<QuickItem[] | null>(null)
  const loadedAt = useRef(0)
  const [loading, start] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Ctrl+K / ⌘K — открыть и закрыть с любой страницы.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyK') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  // Открылось — фокус в строку и свежий список с сервера, если старый уже не свежий.
  useEffect(() => {
    if (!open) return
    setQ('')
    setActive(0)
    requestAnimationFrame(() => inputRef.current?.focus())
    if (Date.now() - loadedAt.current > FRESH_MS)
      start(async () => {
        const items = await quickSearchIndex().catch(() => null)
        if (items) {
          setIndex(items)
          loadedAt.current = Date.now()
        }
      })
  }, [open])

  const found = useMemo(() => (q.trim() ? quickMatch([...pages, ...(index ?? [])], q) : pages), [q, index, pages])
  const groups = useMemo(() => groupByKind(found), [found])
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const go = (item: QuickItem | undefined) => {
    if (!item) return
    onOpenChange(false)
    router.push(item.href)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (flat.length ? (a + 1) % flat.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(flat[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onOpenChange(false)
    }
  }

  let i = -1
  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-center bg-black/40 px-3 pt-[8vh] backdrop-blur-[2px]" onMouseDown={() => onOpenChange(false)}>
      {/* Фон окна сплошной (как лист «Ещё»), а не карточка: у «Стекла» карточка
          полупрозрачная, и страница просвечивала сквозь найденное. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(locale, 'search.open')}
        className="flex max-h-[min(34rem,80vh)] w-full max-w-xl flex-col self-start overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-white/[0.08] px-4">
          <Search size={18} className="shrink-0 text-t3" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t(locale, 'search.placeholder')}
            aria-label={t(locale, 'search.placeholder')}
            role="combobox"
            aria-expanded
            aria-controls="quick-search-list"
            aria-activedescendant={flat[active] ? `qs-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="min-h-14 w-full min-w-0 bg-transparent text-md text-t1 outline-none placeholder:text-t3"
          />
          <kbd className="hidden shrink-0 rounded border border-white/12 px-1.5 py-0.5 text-2xs text-t3 sm:inline">Esc</kbd>
        </div>

        <ul ref={listRef} id="quick-search-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {groups.map((g) => (
            <li key={g.kind} role="presentation">
              <div className="px-4 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-t3">{t(locale, GROUP[g.kind])}</div>
              <ul role="presentation">
                {g.items.map((item) => {
                  i++
                  const n = i
                  const Icon = ICON[item.kind]
                  return (
                    <li
                      key={`${item.kind}-${item.href}`}
                      id={`qs-${n}`}
                      data-i={n}
                      role="option"
                      aria-selected={n === active}
                      onMouseMove={() => n !== active && setActive(n)}
                      onClick={() => go(item)}
                      className={`mx-1.5 flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 ${n === active ? 'bg-haul-500/12' : ''}`}
                    >
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${n === active ? 'bg-haul-500 text-[#fff]' : 'bg-white/[0.06] text-t2'}`}>
                        <Icon size={16} strokeWidth={2.2} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-t1">{item.title}</span>
                        {item.sub && <span className="nums block truncate text-xs text-t3">{item.sub}</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
          {flat.length === 0 && <li className="px-4 py-6 text-center text-sm text-t3">{t(locale, loading && !index ? 'search.loading' : 'search.empty')}</li>}
        </ul>

        {/* Подсказка по клавишам — только где есть клавиатура: на телефоне полоса была бы пустой. */}
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.08] px-4 py-2 text-2xs text-t3 max-sm:hidden">
          <span>{t(locale, 'search.hint')}</span>
          {loading && <span className="ml-auto">{t(locale, 'search.loading')}</span>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Кнопка в меню: на компьютере — строкой «Поиск · Ctrl K» под названием компании,
 *  в свёрнутом меню — одной лупой. */
export function QuickSearchButton({ onClick }: { onClick: () => void }) {
  const locale = useLocale()
  const [mac, setMac] = useState(false)
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), [])
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${t(locale, 'search.open')} (${mac ? '⌘K' : 'Ctrl+K'})`}
      className="nav-search-btn mb-3 hidden min-h-10 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-t3 transition-colors hover:border-white/20 hover:text-t1 md:flex"
    >
      <Search size={18} strokeWidth={1.9} className="shrink-0" aria-hidden />
      <span className="nav-label min-w-0 flex-1 truncate text-left text-base">{t(locale, 'search.open')}</span>
      <kbd className="nav-label shrink-0 rounded border border-white/12 px-1 text-2xs font-medium">{mac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  )
}
