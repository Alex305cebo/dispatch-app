// The shared "there is nothing here" block.
//
// Empty states were a grey sentence in a box — technically an answer, but they read as
// a dead end rather than a starting point. Each one now says what's missing, why the
// space is blank, and (where there is one) offers the action that fills it.

import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/button'

export function Empty({
  icon: Icon,
  title,
  text,
  action,
  compact,
  row,
}: {
  icon: LucideIcon
  title: string
  /** One line on why it's empty. Skip it when the title already says everything. */
  text?: string
  action?: { href: string; label: string; icon?: React.ReactNode }
  /** Inside an already-bordered panel or a narrow column — drops the frame and padding. */
  compact?: boolean
  /** Строкой: иконка, текст и кнопка в один ряд. Для пустой секции ВНУТРИ страницы,
   * где столбик по центру занимает пол-экрана ради одной фразы. */
  row?: boolean
}) {
  if (row) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-white/30 ring-1 ring-white/8">
          <Icon size={16} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1 basis-[14rem]">
          <p className="text-[13px] font-semibold text-white/85">{title}</p>
          {text && <p className="text-[12.5px] leading-snug text-white/50">{text}</p>}
        </div>
        {action && (
          <Button href={action.href} variant="secondary" size="sm" icon={action.icon} className="shrink-0">
            {action.label}
          </Button>
        )}
      </div>
    )
  }
  return (
    <div
      className={
        compact
          ? 'flex flex-col items-center gap-1.5 py-6 text-center'
          : 'panel flex flex-col items-center gap-1.5 px-6 py-10 text-center'
      }
    >
      {/* Muted, not accent-coloured: an empty state is a neutral fact, and tinting it
          the action colour made blank screens look like something needed attention. */}
      <span className="mb-1 flex size-11 items-center justify-center rounded-2xl bg-white/[0.05] text-white/30 ring-1 ring-white/8">
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <p className="text-lg font-semibold text-white/85">{title}</p>
      {text && <p className="max-w-sm text-base leading-relaxed text-white/50">{text}</p>}
      {action && (
        <Button href={action.href} variant="primary" size="sm" icon={action.icon} className="mt-2.5">
          {action.label}
        </Button>
      )}
    </div>
  )
}
