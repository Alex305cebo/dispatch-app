// Мини-графики под цифрой плитки (Stat): форма недели и «сколько из скольких» — без
// осей и подписей. Владелец, 10/09/26: «меньше цифр и текста, больше визуала».
// Общие для «Грузов», «Траков» и «Amazon», чтобы картинки под цифрами не разъезжались.

const FILL = { haul: 'bg-haul-400', good: 'bg-good-400', warn: 'bg-warn-400' } as const
type Fill = keyof typeof FILL

/** Столбик на день (или неделю): форма без осей. Нулевой день — тонкая черта, чтобы
 *  пустые дни было видно; `null` — дня нет совсем. `mark` — номер столбика, который
 *  горит ярче остальных: «сегодня» в неделе. */
export function Spark({ values, tone, mark }: { values: (number | null)[]; tone: Fill; mark?: number }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0))
  return (
    <div className="mt-3 flex h-7 items-end gap-0.5" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[2px] ${i === mark ? '' : 'opacity-50'} ${FILL[tone]}`}
          style={{ height: v == null ? 0 : `${Math.max(6, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

/** Клетка на каждый трак (или рейс), горят занятые: «сколько из скольких» видно, не
 *  читая цифру. Частей может быть несколько — например, «доставлен» и «в пути»: они
 *  идут слева подряд, остаток — пустые клетки. Больше двух дюжин — сплошная полоса:
 *  клетки стали бы точками. */
export function Cells({
  total,
  lit = 0,
  tone = 'good',
  parts,
}: {
  total: number
  lit?: number
  tone?: Fill
  parts?: { n: number; tone: Fill }[]
}) {
  if (!total) return null
  const segs = parts ?? [{ n: lit, tone }]
  if (total > 24)
    return (
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
        {segs.map((s, i) => (
          <div key={i} className={`h-full rounded-full ${FILL[s.tone]}`} style={{ width: `${(s.n / total) * 100}%` }} />
        ))}
      </div>
    )
  const litCls = segs.flatMap((s) => Array.from({ length: s.n }, () => FILL[s.tone]))
  return (
    <div className="mt-3 flex h-2 gap-[3px]" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`flex-1 rounded-[2px] ${litCls[i] ?? 'bg-white/10'}`} />
      ))}
    </div>
  )
}
