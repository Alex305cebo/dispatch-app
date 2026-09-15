import { Flag } from 'lucide-react'
import { t, type Locale } from '@/lib/i18n'

/** С какого порожнего пробега это красный флаг: больше 120–150 миль пустыми не ездят. */
export const DEADHEAD_FLAG_MI = 150

/**
 * Красный флаг «порожний больше 150 миль». Почти всегда это не порожний, а ошибка:
 * между прошлой выгрузкой и этим пикапом не заведён груз, или порожний посчитан не от
 * той точки (так у Olathe → Caldwell вышло 1842 мили). В списках — маленькая метка с
 * подсказкой, на странице груза — строка с объяснением, где поправить.
 */
export function DeadheadFlag({
  miles,
  locale,
  banner = false,
  className = '',
}: {
  miles: number
  locale: Locale
  banner?: boolean
  className?: string
}) {
  if (!(miles > DEADHEAD_FLAG_MI)) return null
  const n = Math.round(miles).toLocaleString('en-US')
  const text = t(locale, 'dhFlag.text').replace('{n}', n)
  if (banner)
    return (
      <p className={`flex items-start gap-1.5 rounded-xl border border-bad-500/35 bg-bad-500/[0.07] px-3 py-2 text-[12.5px] leading-snug text-white/85 ${className}`}>
        <Flag size={14} strokeWidth={2.4} className="mt-0.5 shrink-0 text-bad-400" />
        <span>{text}</span>
      </p>
    )
  return (
    <span
      title={text}
      className={`nums inline-flex items-center gap-1 rounded bg-bad-500/15 px-1.5 py-0.5 text-[10.5px] font-bold text-bad-400 ring-1 ring-bad-500/30 ${className}`}
    >
      <Flag size={10} strokeWidth={2.8} />
      DH {n} mi
    </span>
  )
}
