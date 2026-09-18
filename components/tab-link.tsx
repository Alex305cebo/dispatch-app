import Link from 'next/link'

/** Вкладка-ссылка под заголовком раздела: «Финансы», «Рынок и брокеры». */
export function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
        active ? 'border-haul-500 text-white' : 'border-transparent text-white/55 hover:text-white/85'
      }`}
    >
      {children}
    </Link>
  )
}
