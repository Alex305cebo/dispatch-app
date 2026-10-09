// Шапка раздела — одна на все страницы (план «Порядок в TMS», 10/09/26). До неё у каждой
// страницы была своя: где заголовок крупный, где мелкий, где подпись есть, где нет,
// кнопка то справа, то под заголовком. Образец — «Документы» (29.09.2026): слева что
// это за раздел и одна строка о том, что на экране; справа главное действие.

import type { ReactNode } from 'react'
import { Info } from '@/components/info'

export function PageHeader({
  title,
  info,
  subtitle,
  actions,
}: {
  title: ReactNode
  /** Текст ⓘ рядом с заголовком — подробности, которые не нужны каждый день. */
  info?: string
  /** Одна строка под заголовком: что на этом экране. */
  subtitle?: ReactNode
  /** Главное действие раздела (кнопка или две) — справа, на телефоне во всю ширину. */
  actions?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          {title}
          {info && <Info side="bottom" text={info} />}
        </h1>
        {subtitle && <p className="mt-0.5 text-base text-t2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1">{actions}</div>}
    </header>
  )
}
