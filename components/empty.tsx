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
}: {
  icon: LucideIcon
  title: string
  /** One line on why it's empty. Skip it when the title already says everything. */
  text?: string
  action?: { href: string; label: string; icon?: React.ReactNode }
  /** Inside an already-bordered panel or a narrow column — drops the frame and padding. */
  compact?: boolean
}) {
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
