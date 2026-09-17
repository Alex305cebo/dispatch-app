import type { Locale } from '@/lib/i18n'

// Флаг языка рисунком. Эмодзи-флаги Windows не рисует (показывает «US», «RU»), поэтому
// простые SVG 3:2: полосы и главный знак, без мелких деталей — на 20–24 px их не видно.
// ponytail: US без звёзд, KZ без орнамента — на таком размере читаются только цвета.
const FLAGS: Record<Locale, React.ReactNode> = {
  en: (
    <>
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} y={(i * 40) / 13} width="30" height={20 / 13} fill="#b22234" />
      ))}
      <rect width="13" height={(20 / 13) * 7} fill="#3c3b6e" />
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
    <svg viewBox="0 0 30 20" className={`shrink-0 overflow-hidden rounded-[3px] bg-white ring-1 ring-black/10 ${className}`} aria-hidden>
      {FLAGS[code]}
    </svg>
  )
}
