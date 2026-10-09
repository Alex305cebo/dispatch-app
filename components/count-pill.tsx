// Пилюля фильтра с числом: «Отправить 7», «В работе 3». Одна на «Документы» и «Грузы»,
// чтобы фильтры над списком выглядели одинаково во всех разделах.

const DOT = { good: 'bg-good-400', warn: 'bg-warn-400', bad: 'bg-bad-400' } as const

export function CountPill({
  label,
  count,
  tone = 'plain',
  active,
  onClick,
}: {
  label: string
  count: number
  /** Точка перед словом — когда в этой группе что-то ждёт действия. */
  tone?: 'plain' | keyof typeof DOT
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors ${
        active
          ? 'border-haul-400/50 bg-haul-500/20 text-t1'
          : 'border-white/8 bg-white/[0.03] text-t2 hover:border-white/16 hover:text-t1'
      }`}
    >
      {tone !== 'plain' && <span aria-hidden className={`size-1.5 rounded-full ${DOT[tone]}`} />}
      {label}
      <span className={`nums text-xs font-bold ${active ? 'text-t1' : 'text-t3'}`}>{count}</span>
    </button>
  )
}
