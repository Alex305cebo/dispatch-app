import Link from 'next/link'

/**
 * Факт о грузе одной плашкой: подпись и значение. Нажимается, если есть куда вести —
 * телефон брокера звонит, почта открывает письмо, имя ведёт в справочник.
 *
 * Жил внутри load-form.tsx; шапка груза показывает те же факты, и второй такой же
 * плашке там взяться было неоткуда. Сервер его тоже рисует, поэтому без 'use client'.
 */
export function Chip({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <>
      <span className="text-t2">{label}</span>
      <span className="break-all text-t1">{value}</span>
    </>
  )
  const cls = 'flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5 text-[12px]'
  if (!href) return <div className={cls}>{inner}</div>
  // Внутренний адрес — через Link: переход без перезагрузки. tel:/mailto: Link не берёт.
  const external = /^[a-z]+:/i.test(href)
  const hover = `${cls} transition-colors hover:border-haul-500/40`
  return external ? (
    <a href={href} className={hover}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={hover}>
      {inner}
    </Link>
  )
}
