'use client'

// Флаг текущего языка — круглая кнопка в ряду аккаунта, рядом с колокольчиком
// (владелец 03.10.2026: «переключение языков должно быть на видном месте»).
// Раньше язык прятался в меню аватара. Список — fixed-слой от кнопки, чтобы
// его не срезал overflow сайдбара; закрывается ✕, Escape и щелчком мимо.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { useLocale } from '@/components/locale-provider'
import { LocaleFlag } from '@/components/locale-flags'
import { LOCALES, LOCALE_COOKIE, t, type Locale } from '@/lib/i18n'

export function LocaleQuick() {
  const router = useRouter()
  const locale = useLocale()
  const [pos, setPos] = useState<React.CSSProperties | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pos) return
    function onPointerDown(e: PointerEvent) {
      const n = e.target as Node
      if (popRef.current?.contains(n) || btnRef.current?.contains(n)) return
      setPos(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPos(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pos])

  function toggle() {
    if (pos) return setPos(null)
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const w = 208
    const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12))
    // Кнопка в верхней панели (телефон) — список вниз; внизу сайдбара — вверх.
    setPos(
      r.top < window.innerHeight / 2
        ? { left, top: r.bottom + 8, width: w }
        : { left, bottom: window.innerHeight - r.top + 8, width: w },
    )
  }

  function choose(next: Locale) {
    setPos(null)
    if (next === locale) return
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    router.refresh()
  }

  const label = t(locale, 'userPanel.tileLang')

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        aria-expanded={!!pos}
        className="nav-icon-btn flex size-9 items-center justify-center rounded-full border border-white/10 hover:border-white/25"
      >
        {/* Код языка буквами, а не флагом: мелкий флаг на кружке читался тёмным пятном
            и выбивался из линейных значков ряда. Флаги — в самом списке. */}
        <span className="text-sm font-semibold tracking-wide">{LOCALES.find((l) => l.code === locale)?.short}</span>
      </button>
      {pos && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={label}
          style={pos}
          className="fixed z-[60] rounded-2xl border border-white/10 bg-ink-900 p-1.5 shadow-2xl"
        >
          <div className="flex items-center justify-between px-2 pb-1 pt-0.5">
            <span className="text-sm font-semibold text-t2">{label}</span>
            <button
              type="button"
              onClick={() => setPos(null)}
              aria-label={t(locale, 'common.close')}
              title={t(locale, 'common.close')}
              className="flex size-7 items-center justify-center rounded-full text-t2 hover:bg-white/8 hover:text-t1"
            >
              <X size={16} />
            </button>
          </div>
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => choose(l.code)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-base transition-colors hover:bg-white/8 ${
                l.code === locale ? 'text-haul-300' : 'text-t1'
              }`}
            >
              <LocaleFlag code={l.code} className="h-3.5 w-5 shrink-0 rounded-[2px]" />
              <span className="min-w-0 flex-1 truncate">{l.native}</span>
              {l.code === locale && <Check size={14} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
