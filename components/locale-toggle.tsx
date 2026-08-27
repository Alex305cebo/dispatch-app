'use client'

// Выбор языка интерфейса.
//
// Сначала это была кнопка на два положения, показывавшая ДРУГОЙ язык. С пятью
// языками так нельзя: одну кнопку из пяти не покажешь, а листать язык по кругу
// никто не станет.
//
// Потом это был системный <select>, спрятанный прозрачным слоем поверх подписи.
// Выглядело чужеродно: браузер рисует свой белый список поверх тёмного интерфейса,
// в узком месте обрезает его и показывает одну строку из пяти. Поэтому здесь свой
// список — той же тёмной кожей, что и остальные всплывающие панели приложения.
//
// Языки названы НА СЕБЕ: «Español», а не «Spanish». Тот, кто открывает переключатель
// языка, английского может и не знать — в этом и причина, по которой он его открыл.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { useLocale } from '@/components/locale-provider'
import { LOCALES, type Locale } from '@/lib/i18n'

export function LocaleToggle({ collapsed = false }: { collapsed?: boolean }) {
  const locale = useLocale()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0]!

  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function choose(next: Locale) {
    setOpen(false)
    if (next === locale) return
    document.cookie = `locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    // router.refresh(), а не перезагрузка страницы: серверные компоненты перечитают
    // куку и отрисуются заново, но мягко — не теряются ни прокрутка, ни открытые
    // секции, ни состояние форм.
    router.refresh()
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Language"
        aria-expanded={open}
        className={`flex h-8 items-center gap-1 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 text-[11.5px] font-bold uppercase text-white/80 transition-colors hover:border-haul-500/50 hover:bg-haul-500/10 ${
          collapsed ? 'nav-icon-btn is-collapsed' : ''
        }`}
      >
        {current.short}
        <span className="text-[9px] text-white/40">▾</span>
      </button>

      {open && (
        // Открывается ВПРАВО и вверх от кнопки: она стоит в меню аккаунта у левого
        // края экрана, и список, выпадающий влево, упирался бы в край.
        <div className="absolute bottom-0 left-full z-[60] ml-2 w-44 overflow-hidden rounded-xl border border-white/10 bg-ink-900 py-1 shadow-2xl">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => choose(l.code)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/8 ${
                l.code === locale ? 'text-haul-300' : 'text-white/80'
              }`}
            >
              <span className="w-7 shrink-0 text-[10.5px] font-bold uppercase text-white/40">{l.short}</span>
              <span className="min-w-0 flex-1 truncate">{l.native}</span>
              {l.code === locale && <Check size={14} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
