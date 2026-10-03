import type { Locale } from '@/lib/i18n'

// Флаг языка рисунком. Эмодзи-флаги Windows не рисует (показывает «US», «RU»), поэтому
// простые SVG 3:2: полосы и главный знак, без мелких деталей — на 20–24 px их не видно.
// ponytail: KZ без орнамента — на таком размере читаются только цвета.
const FLAGS: Record<Locale, React.ReactNode> = {
  // Английский — флаг США, упрощённый (владелец, 10/03/26): 13 тонких полос на 20 px
  // сливались в тёмное пятно, а белые полосы шли из фона bg-white, который в светлой
  // теме перекрашен (--color-white). Теперь 7 крупных полос, белое рисуем сами, в синем
  // поле — несколько белых звёзд-точек, чтобы флаг узнавался.
  en: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect y="0.0" width="30" height="2.857" fill="#b22234" />
      <rect y="5.714" width="30" height="2.857" fill="#b22234" />
      <rect y="11.429" width="30" height="2.857" fill="#b22234" />
      <rect y="17.143" width="30" height="2.857" fill="#b22234" />
      <rect width="13" height="11.429" fill="#3c3b6e" />
      <circle cx="2.4" cy="2.4" r="1" fill="#fff" />
      <circle cx="6.5" cy="2.4" r="1" fill="#fff" />
      <circle cx="10.6" cy="2.4" r="1" fill="#fff" />
      <circle cx="4.45" cy="5.7" r="1" fill="#fff" />
      <circle cx="8.55" cy="5.7" r="1" fill="#fff" />
      <circle cx="2.4" cy="9.0" r="1" fill="#fff" />
      <circle cx="6.5" cy="9.0" r="1" fill="#fff" />
      <circle cx="10.6" cy="9.0" r="1" fill="#fff" />
    </>
  ),
  ru: (
    <>
      <rect width="30" height="6.67" fill="#fff" />
      <rect y="6.67" width="30" height="6.67" fill="#0039a6" />
      <rect y="13.33" width="30" height="6.67" fill="#d52b1e" />
    </>
  ),
  es: (
    <>
      <rect width="30" height="20" fill="#aa151b" />
      <rect y="5" width="30" height="10" fill="#f1bf00" />
    </>
  ),
  uk: (
    <>
      <rect width="30" height="10" fill="#0057b7" />
      <rect y="10" width="30" height="10" fill="#ffd700" />
    </>
  ),
  ro: (
    <>
      <rect width="10" height="20" fill="#002b7f" />
      <rect x="10" width="10" height="20" fill="#fcd116" />
      <rect x="20" width="10" height="20" fill="#ce1126" />
    </>
  ),
  kk: (
    <>
      <rect width="30" height="20" fill="#00afca" />
      <circle cx="15" cy="9" r="3.6" fill="#fec50c" />
    </>
  ),
}

export function LocaleFlag({ code, className = 'h-4 w-6' }: { code: Locale; className?: string }) {
  return (
    <svg viewBox="0 0 30 20" className={`shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/10 ${className}`} aria-hidden>
      {FLAGS[code]}
    </svg>
  )
}
