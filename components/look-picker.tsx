'use client'

// Кнопка «Вид» в ряду аккаунта (на месте прежней луны): тема, цвет и карточки — тремя
// рядами кнопок в одном окошке. Владелец, 10/10/26, прислал образец SmartHop — светлый,
// плоский, с оранжевым акцентом; по умолчанию теперь он, а прежнее тёмное «Жидкое
// стекло» включается здесь же, в два нажатия. Выбор применяется сразу, без перезагрузки:
// меняются только атрибуты <html>, цвета перекрашивает globals.css (lib/look.ts).
//
// Окошко — fixed-слой от кнопки, как у языка (locale-quick.tsx): его не срезает
// overflow сайдбара. Закрывается ✕, Escape и щелчком мимо.

import { useEffect, useRef, useState } from 'react'
import { Check, Moon, Palette, Sun, X } from 'lucide-react'
import { useLocale } from '@/components/locale-provider'
import { t, type MsgKey } from '@/lib/i18n'
import { ACCENTS, DEFAULT_LOOK, lookOf, type Accent, type Look } from '@/lib/look'

/** Образцы цвета — сами цвета кнопок, а не переменные: в окошке видны все три сразу. */
const SWATCH: Record<Accent, { color: string; name: MsgKey }> = {
  orange: { color: '#e0560c', name: 'look.orange' },
  violet: { color: '#7c6cff', name: 'look.violet' },
  blue: { color: '#2563eb', name: 'look.blue' },
}

export function LookPicker() {
  const locale = useLocale()
  const [look, setLook] = useState<Look>(DEFAULT_LOOK)
  const [pos, setPos] = useState<React.CSSProperties | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => setLook(lookOf(document.documentElement.dataset)), [])

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
    const w = 280
    const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12))
    // Кнопка в верхней панели (телефон) — окошко вниз; внизу сайдбара — вверх.
    setPos(
      r.top < window.innerHeight / 2
        ? { left, top: r.bottom + 8, width: w }
        : { left, bottom: window.innerHeight - r.top + 8, width: w },
    )
  }

  function pick(patch: Partial<Look>) {
    const next = { ...look, ...patch }
    setLook(next)
    const d = document.documentElement.dataset
    d.theme = next.theme
    d.accent = next.accent
    d.surface = next.surface
    try {
      localStorage.setItem('theme', next.theme)
      localStorage.setItem('accent', next.accent)
      localStorage.setItem('surface', next.surface)
    } catch {
      /* приватный режим — выбор просто не запомнится */
    }
  }

  const label = t(locale, 'look.title')
  // Две кнопки в ряд: выбранная залита акцентом.
  const seg = (on: boolean) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors ${
      on ? 'bg-haul-500 text-[#fff] shadow-sm' : 'text-t2 hover:bg-white/8 hover:text-t1'
    }`
  const row = 'flex gap-0.5 rounded-xl border border-white/10 bg-white/[0.03] p-1'
  const caption = 'px-1 pb-1.5 pt-3 text-2xs font-semibold uppercase tracking-wide text-t3'

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
        <Palette size={18} strokeWidth={1.8} aria-hidden />
      </button>
      {pos && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={label}
          style={pos}
          className="fixed z-[60] rounded-2xl border border-white/10 bg-ink-900 p-2.5 shadow-2xl"
        >
          <div className="flex items-center justify-between pl-1">
            <span className="text-sm font-semibold text-t1">{label}</span>
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

          <div className={caption}>{t(locale, 'theme.pick')}</div>
          <div role="group" aria-label={t(locale, 'theme.pick')} className={row}>
            <button type="button" aria-pressed={look.theme === 'light'} onClick={() => pick({ theme: 'light' })} className={seg(look.theme === 'light')}>
              <Sun size={14} aria-hidden />
              {t(locale, 'theme.lightShort')}
            </button>
            <button type="button" aria-pressed={look.theme === 'dark'} onClick={() => pick({ theme: 'dark' })} className={seg(look.theme === 'dark')}>
              <Moon size={14} aria-hidden />
              {t(locale, 'theme.darkShort')}
            </button>
          </div>

          <div className={caption}>{t(locale, 'look.accent')}</div>
          <div role="group" aria-label={t(locale, 'look.accent')} className="flex gap-2 px-1">
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={look.accent === a}
                onClick={() => pick({ accent: a })}
                title={t(locale, SWATCH[a].name)}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  look.accent === a ? 'bg-white/8 text-t1' : 'text-t2 hover:bg-white/[0.05] hover:text-t1'
                }`}
              >
                <span
                  className="flex size-7 items-center justify-center rounded-full text-[#fff] shadow-sm"
                  style={{ backgroundColor: SWATCH[a].color }}
                >
                  {look.accent === a && <Check size={15} strokeWidth={3} aria-hidden />}
                </span>
                <span className="max-w-full truncate">{t(locale, SWATCH[a].name)}</span>
              </button>
            ))}
          </div>

          <div className={caption}>{t(locale, 'look.surface')}</div>
          <div role="group" aria-label={t(locale, 'look.surface')} className={row}>
            <button type="button" aria-pressed={look.surface === 'flat'} onClick={() => pick({ surface: 'flat' })} className={seg(look.surface === 'flat')}>
              {t(locale, 'look.flat')}
            </button>
            <button type="button" aria-pressed={look.surface === 'glass'} onClick={() => pick({ surface: 'glass' })} className={seg(look.surface === 'glass')}>
              {t(locale, 'look.glass')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
