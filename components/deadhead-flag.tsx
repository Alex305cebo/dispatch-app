'use client'

import { useState, useTransition } from 'react'
import { Flag } from 'lucide-react'
import { setDeadhead } from '@/app/actions'
import { DEADHEAD_FLAG_MI } from '@/lib/load-status'
import { notify } from '@/lib/notify'
import { t, type Locale } from '@/lib/i18n'

/**
 * Красный флаг «Deadhead больше 150 миль». Почти всегда это ошибка: между прошлой выгрузкой
 * и этим пикапом не заведён груз, или в день было две выгрузки и посчитано не от той. В
 * списках — маленькая метка с подсказкой; на странице груза — строка с «Исправить»
 * (вписать своё число) и «Всё верно» (оставить как есть). Решает диспетчер: подтверждённое
 * число (deadhead_ok_miles) флаг больше не показывает.
 */
export function DeadheadFlag({
  miles,
  okMiles = null,
  loadId,
  locale,
  banner = false,
  className = '',
}: {
  miles: number
  okMiles?: number | null
  /** Есть — на строке флага кнопки «Исправить» и «Всё верно». */
  loadId?: number
  locale: Locale
  banner?: boolean
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(Math.round(miles)))
  const [busy, start] = useTransition()
  if (!(miles > DEADHEAD_FLAG_MI) || (okMiles != null && okMiles === Math.round(miles))) return null
  const n = Math.round(miles).toLocaleString('en-US')
  const text = t(locale, 'dhFlag.text').replace('{n}', n)
  if (!banner)
    return (
      <span
        title={text}
        className={`nums inline-flex items-center gap-1 rounded bg-bad-500/15 px-1.5 py-0.5 text-[10.5px] font-bold text-bad-400 ring-1 ring-bad-500/30 ${className}`}
      >
        <Flag size={10} strokeWidth={2.8} />
        DH {n} mi
      </span>
    )
  const save = (mi: number) =>
    start(async () => {
      if (loadId == null) return
      const res = await setDeadhead(loadId, mi)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', t(locale, 'dhFlag.saved').replace('{n}', String(Math.round(mi))))
        setEditing(false)
      }
    })
  const btn =
    'inline-flex min-h-8 items-center rounded-lg px-3 text-[12px] font-semibold transition-colors disabled:opacity-50 max-md:min-h-10'
  return (
    <div className={`rounded-xl border border-bad-500/35 bg-bad-500/[0.07] px-3 py-2 text-[12.5px] leading-snug text-white/85 ${className}`}>
      <p className="flex items-start gap-1.5">
        <Flag size={14} strokeWidth={2.4} className="mt-0.5 shrink-0 text-bad-400" />
        <span>{text}</span>
      </p>
      {loadId != null && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
          {editing ? (
            <>
              <label className="flex items-center gap-1.5 text-[12px] text-white/70">
                {t(locale, 'dhFlag.label')}
                <input
                  inputMode="numeric"
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && value !== '' && save(Number(value))}
                  className="nums h-8 w-20 rounded-lg border border-white/15 bg-ink-900 px-2 text-[13px] text-white outline-none focus:border-haul-500 max-md:h-10"
                />
              </label>
              <button type="button" disabled={busy || value === ''} onClick={() => save(Number(value))} className={`${btn} bg-haul-500 text-white hover:bg-haul-400`}>
                {t(locale, 'dhFlag.save')}
              </button>
              <button type="button" onClick={() => setEditing(false)} className={`${btn} border border-white/15 text-white/75 hover:text-white`}>
                {t(locale, 'dhFlag.cancel')}
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => setEditing(true)} className={`${btn} bg-haul-500 text-white hover:bg-haul-400`}>
                {t(locale, 'dhFlag.fix')}
              </button>
              <button type="button" disabled={busy} onClick={() => save(miles)} className={`${btn} border border-white/15 text-white/80 hover:border-white/35 hover:text-white`}>
                {t(locale, 'dhFlag.ok')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
