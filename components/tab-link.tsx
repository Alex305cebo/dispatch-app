import Link from 'next/link'

/** Вкладка-ссылка под заголовком раздела: «Финансы», «Рынок». */
export function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
        active ? 'border-haul-500 text-white' : 'border-transparent text-t3 hover:text-t1'
      }`}
    >
      {children}
    </Link>
  )
}
