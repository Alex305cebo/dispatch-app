'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { fillBrokerMc, runBrokerCheck } from '@/app/actions'
import type { BrokerCheck } from '@/lib/fmcsa'
import { BrokerChecklist } from '@/components/broker-checklist'
import { ShowMore } from '@/components/collapse'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale } from '@/lib/i18n'
import { driveTime, usd } from '@/lib/fmt'

export type DirView = 'all' | 'brokers' | 'facilities' | 'attention'

export type DirBroker = {
  key: string
  name: string
  mc: string | null
  loads: number
  payDays: number | null
  owed: number
  /** Сколько дней ждём самый старый неоплаченный счёт. */
  oldest: number
  /** Сколько дней назад был последний груз этого брокера; null — грузов не было. */
  sinceDays: number | null
  inactive: boolean
  checked: string | null
  search: string
  attention: boolean
}

export type DirFacility = {
  key: string
  name: string
  place: string | null
  visits: number
  dwell: number | null
  search: string
  attention: boolean
}

/** «C.H. Robinson» ищется и как «ch robinson». */
const norm = (s: string) => s.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()

const row =
  'flex min-h-11 items-center justify-between gap-3 rounded-lg border border-white/8 px-3 py-2 transition-colors hover:border-white/20 hover:bg-white/[0.03]'

export function Directory({
  brokers,
  facilities,
  initialQuery,
  initialView,
}: {
  brokers: DirBroker[]
  facilities: DirFacility[]
  initialQuery: string
  initialView: DirView
}) {
  const locale = useLocale()
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [view, setView] = useState<DirView>(initialView)

  // Поиск и фильтр — в адресе: «назад» из карточки возвращает туда же. replaceState, а не
  // переход: страница не перерисовывается на каждую букву.
  useEffect(() => {
    const p = new URLSearchParams()
    if (query.trim()) p.set('q', query.trim())
    if (view !== 'all') p.set('view', view)
    const qs = p.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [query, view])

  // MC у брокеров без номера подбирается сам, партиями, пока раздел открыт; состояние —
  // строкой, иначе «ищу» и «нет ключа» выглядят одинаково.
  const [mcState, setMcState] = useState<'idle' | 'working' | 'no_key' | 'done'>('idle')
  useEffect(() => {
    let alive = true
    ;(async () => {
      for (let round = 0; round < 8 && alive; round++) {
        setMcState('working')
        const res = await fillBrokerMc().catch(() => null)
        if (!alive) return
        if (!res) return setMcState('done')
        if (res.reason === 'no_key') return setMcState('no_key')
        if (res.filled > 0) router.refresh()
        if (res.left === 0) return setMcState('done')
      }
      if (alive) setMcState('done')
    })()
    return () => {
      alive = false
    }
  }, [router])

  const q = norm(query)
  const qDigits = query.replace(/\D/g, '')
  const hit = (text: string) =>
    !q || norm(text).includes(q) || (qDigits.length >= 3 && text.split('|').some((part) => part.replace(/\D/g, '').includes(qDigits)))

  // Без поиска — только брокеры с грузами; проверенные в реестре без грузов находятся поиском.
  const bList = brokers.filter((b) => (q ? hit(b.search) : b.loads > 0) && (view !== 'attention' || b.attention))
  const fList = facilities.filter((f) => hit(f.search) && (view !== 'attention' || f.attention))
  const counts = useMemo(
    () => ({
      brokers: brokers.filter((b) => b.loads > 0).length,
      facilities: facilities.length,
      attention: brokers.filter((b) => b.attention).length + facilities.filter((f) => f.attention).length,
    }),
    [brokers, facilities],
  )

  // Незнакомый MC — сразу проверка в реестре на том же месте, без второй формы.
  const lookup = /^\s*(?:mc|dot)?\s*#?\s*(\d{4,8})\s*$/i.exec(query)?.[1] ?? null
  const known = !!lookup && brokers.some((b) => b.mc === lookup)
  const [check, setCheck] = useState<{ state: 'idle' | 'loading' | 'done' | 'error'; data?: BrokerCheck; err?: string }>({ state: 'idle' })
  const [, start] = useTransition()
  useEffect(() => setCheck({ state: 'idle' }), [lookup])
  const runCheck = (by: 'mc' | 'dot') => {
    if (!lookup) return
    setCheck({ state: 'loading' })
    start(async () => {
      const res = await runBrokerCheck(by, lookup)
      if ('error' in res) setCheck({ state: 'error', err: res.error === 'no_key' ? t(locale, 'brokers.noKey') : res.error })
      else {
        setCheck({ state: 'done', data: res })
        router.refresh()
      }
    })
  }

  const chips: [DirView, string][] = [
    ['all', t(locale, 'brokers.dir.all')],
    ['brokers', `${t(locale, 'brokers.pageTitle')} ${counts.brokers}`],
    ['facilities', `${t(locale, 'facilities.title')} ${counts.facilities}`],
    ['attention', `${t(locale, 'brokers.dir.attention')} ${counts.attention}`],
  ]
  const both = view === 'all' || view === 'attention'
  const limit = both ? 8 : 40

  return (
    <>
      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 focus-within:border-haul-500/60">
        <Search size={16} className="shrink-0 text-white/45" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(locale, 'brokers.dir.search')}
          aria-label={t(locale, 'brokers.dir.search')}
          className="min-w-0 flex-1 bg-transparent py-2 text-[14px] text-white outline-none placeholder:text-white/40"
        />
      </label>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {chips.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className={`nums min-h-9 rounded-full border px-3 text-[12.5px] font-medium transition-colors max-md:min-h-10 ${
              view === key
                ? 'border-haul-500/60 bg-haul-500/15 text-haul-300'
                : key === 'attention' && counts.attention > 0
                  ? 'border-warn-500/30 text-warn-400 hover:border-warn-500/60'
                  : 'border-white/10 text-white/65 hover:border-white/25 hover:text-white/90'
            }`}
          >
            {label}
          </button>
        ))}
        {mcState === 'working' && <span className="text-[12px] text-white/40">{t(locale, 'brokers.mcWorking')}</span>}
        {mcState === 'no_key' && <span className="text-[12px] text-warn-400">{t(locale, 'brokers.mcNoKey')}</span>}
      </div>

      {lookup && (!known || check.state !== 'idle') && (
        <div className="panel mt-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 text-[13px] text-white/80">{t(locale, 'brokers.dir.unknownMc').replace('{mc}', lookup)}</span>
            <button
              type="button"
              disabled={check.state === 'loading'}
              onClick={() => runCheck('mc')}
              className="min-h-9 rounded-lg bg-haul-500 px-3 text-[12.5px] font-semibold text-white hover:bg-haul-400 disabled:opacity-50 max-md:min-h-11"
            >
              {check.state === 'loading' ? t(locale, 'brokers.checking') : t(locale, 'brokers.dir.checkMc')}
            </button>
            <button
              type="button"
              disabled={check.state === 'loading'}
              onClick={() => runCheck('dot')}
              className="min-h-9 rounded-lg border border-white/12 px-3 text-[12.5px] text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50 max-md:min-h-11"
            >
              {t(locale, 'brokers.dir.checkDot')}
            </button>
          </div>
          {check.state === 'error' && <p className="mt-2 text-[12.5px] text-warn-400">{check.err}</p>}
          {check.state === 'done' && check.data && <BrokerChecklist check={check.data} />}
        </div>
      )}

      <div className={`mt-4 grid gap-4 ${both ? 'md:grid-cols-2' : ''}`}>
        {view !== 'facilities' && (
          <section className="min-w-0">
            <h2 className="nums mb-2 text-base leading-6 font-semibold text-white/90">
              {t(locale, 'brokers.pageTitle')} <span className="text-[13px] font-normal text-white/45">{bList.length}</span>
            </h2>
            {bList.length === 0 ? (
              <p className="text-[13px] text-white/50">{q || view === 'attention' ? t(locale, 'brokers.noMatch') : t(locale, 'brokers.empty')}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <ShowMore
                  key={`b-${view}-${q}`}
                  limit={limit}
                  label={t(locale, 'brokers.dir.more')}
                  items={bList.map((b) => (
                    <BrokerRow key={b.key} b={b} locale={locale} />
                  ))}
                />
              </div>
            )}
          </section>
        )}
        {view !== 'brokers' && (
          <section className="min-w-0">
            <h2 className="nums mb-2 text-base leading-6 font-semibold text-white/90">
              {t(locale, 'facilities.title')} <span className="text-[13px] font-normal text-white/45">{fList.length}</span>
            </h2>
            {fList.length === 0 ? (
              <p className="text-[13px] text-white/50">
                {q || view === 'attention' ? t(locale, 'brokers.noMatch') : t(locale, 'facilities.emptyText')}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <ShowMore
                  key={`f-${view}-${q}`}
                  limit={limit}
                  label={t(locale, 'brokers.dir.more')}
                  items={fList.map((f) => (
                    <FacilityRow key={f.key} f={f} locale={locale} />
                  ))}
                />
              </div>
            )}
          </section>
        )}
      </div>
    </>
  )
}

/** Строка брокера: имя и число грузов слева, справа одно главное про деньги. */
function BrokerRow({ b, locale }: { b: DirBroker; locale: Locale }) {
  const status = b.inactive
    ? { text: t(locale, 'brokers.dir.inactive'), cls: 'text-bad-400' }
    : b.owed > 0 && b.oldest > 30
      ? { text: t(locale, 'brokers.dir.owedLate').replace('{sum}', usd.format(b.owed)).replace('{n}', String(b.oldest)), cls: 'text-warn-400' }
      : b.owed > 0
        ? { text: t(locale, 'brokers.dir.owed').replace('{sum}', usd.format(b.owed)), cls: 'text-white/60' }
        : b.payDays != null
          ? { text: t(locale, 'brokers.paysIn').replace('{n}', String(b.payDays)), cls: b.payDays <= 30 ? 'text-good-400' : 'text-warn-400' }
          : b.loads === 0 && b.checked
            ? { text: t(locale, 'brokers.dir.checked').replace('{date}', b.checked), cls: 'text-white/45' }
            : null
  return (
    <Link href={`/brokers/${encodeURIComponent(b.key)}`} className={row}>
      <span className="min-w-0 truncate">
        <span className="text-[13.5px] font-medium text-white/90">{b.name}</span>
        {b.loads > 0 && <span className="nums text-[12px] text-white/45"> · {t(locale, 'brokers.loadsCount').replace('{n}', String(b.loads))}</span>}
        {b.sinceDays != null && (
          <span className={`nums text-[12px] ${b.sinceDays > 90 ? 'text-warn-400/80' : 'text-white/40'}`}>
            {' · '}
            {b.sinceDays === 0
              ? t(locale, 'brokers.dir.lastToday')
              : t(locale, 'brokers.dir.lastDays').replace('{n}', String(b.sinceDays))}
          </span>
        )}
      </span>
      {status && <span className={`nums shrink-0 text-right text-[12px] ${status.cls}`}>{status.text}</span>}
    </Link>
  )
}

/** Строка склада: название и город слева, справа сколько раз были и сколько стоим. */
function FacilityRow({ f, locale }: { f: DirFacility; locale: Locale }) {
  return (
    <Link href={`/facilities/${encodeURIComponent(f.key)}`} className={row}>
      <span className="min-w-0 truncate">
        <span className="text-[13.5px] font-medium text-white/90">{f.name}</span>
        {f.place && <span className="text-[12px] text-white/45"> · {f.place}</span>}
      </span>
      <span className={`nums shrink-0 text-right text-[12px] ${f.attention ? 'text-bad-400' : 'text-white/60'}`}>
        {t(locale, 'facilities.visits').replace('{n}', String(f.visits))}
        {f.dwell != null && ` · ${t(locale, 'facilities.dwell').replace('{t}', driveTime(f.dwell, locale))}`}
      </span>
    </Link>
  )
}
