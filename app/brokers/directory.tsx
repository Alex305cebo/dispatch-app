'use client'

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, Handshake, Search } from 'lucide-react'
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
  /** Склад, куда чаще всего возим этого брокера — вторая половина связи. */
  linked: string | null
  search: string
  attention: boolean
}

export type DirFacility = {
  key: string
  name: string
  place: string | null
  visits: number
  dwell: number | null
  /** Сколько дней назад были здесь; null — даты нет. */
  sinceDays: number | null
  /** Брокер, который чаще всего шлёт сюда грузы. */
  linked: string | null
  search: string
  attention: boolean
}

/** Строка общего списка: брокер и склад лежат в нём вперемешку и выглядят одинаково. */
type Row = { kind: 'broker'; b: DirBroker } | { kind: 'facility'; f: DirFacility }

const rowKey = (r: Row) => (r.kind === 'broker' ? `b:${r.b.key}` : `f:${r.f.key}`)
const rowAttention = (r: Row) => (r.kind === 'broker' ? r.b.attention : r.f.attention)
const rowSince = (r: Row) => (r.kind === 'broker' ? r.b.sinceDays : r.f.sinceDays)
const rowSize = (r: Row) => (r.kind === 'broker' ? r.b.loads : r.f.visits)

/**
 * Порядок общего списка. Сначала то, из-за чего трак теряет деньги или время, потом
 * свежее: диспетчер приходит сюда с вопросом «с кем я сейчас имею дело», а не «покажи
 * весь справочник». Размер (грузы, визиты) — только чтобы развести одинаковые даты.
 */
const byImportance = (a: Row, b: Row) =>
  Number(rowAttention(b)) - Number(rowAttention(a)) ||
  (rowSince(a) ?? 1e9) - (rowSince(b) ?? 1e9) ||
  rowSize(b) - rowSize(a)

/** «C.H. Robinson» ищется и как «ch robinson». */
const norm = (s: string) => s.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()

const row =
  'block min-h-11 rounded-lg border border-white/8 px-3 py-2 transition-colors hover:border-white/20 hover:bg-white/[0.03]'

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

  // Один список вместо двух колонок: брокер и склад — стороны одного дела, и искать
  // их по отдельности приходилось только потому, что так было сделано. Без поиска
  // брокеры без грузов не показываются: проверенные в реестре находятся поиском.
  const list: Row[] = [
    ...(view === 'facilities' ? [] : brokers.filter((b) => (q ? hit(b.search) : b.loads > 0)).map((b): Row => ({ kind: 'broker', b }))),
    ...(view === 'brokers' ? [] : facilities.filter((f) => hit(f.search)).map((f): Row => ({ kind: 'facility', f }))),
  ]
    .filter((r) => view !== 'attention' || rowAttention(r))
    .sort(byImportance)
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

  // Чипы не переключают экраны, а сужают один и тот же список — поэтому у «Все» тоже
  // стоит число: видно, что оно равно сумме, и что ничего не спрятано.
  const chips: [DirView, string][] = [
    ['all', `${t(locale, 'brokers.dir.all')} ${counts.brokers + counts.facilities}`],
    ['brokers', `${t(locale, 'brokers.pageTitle')} ${counts.brokers}`],
    ['facilities', `${t(locale, 'facilities.title')} ${counts.facilities}`],
    ['attention', `${t(locale, 'brokers.dir.attention')} ${counts.attention}`],
  ]

  return (
    <>
      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 focus-within:border-haul-500/60">
        <Search size={16} className="shrink-0 text-t3" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(locale, 'brokers.dir.search')}
          aria-label={t(locale, 'brokers.dir.search')}
          className="min-w-0 flex-1 bg-transparent py-2 text-[14px] text-white outline-none placeholder:text-t3"
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
                  : 'border-white/10 text-t2 hover:border-white/25 hover:text-t1'
            }`}
          >
            {label}
          </button>
        ))}
        {mcState === 'working' && <span className="text-[12px] text-t3">{t(locale, 'brokers.mcWorking')}</span>}
        {mcState === 'no_key' && <span className="text-[12px] text-warn-400">{t(locale, 'brokers.mcNoKey')}</span>}
      </div>

      {lookup && (!known || check.state !== 'idle') && (
        <div className="panel mt-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 text-[13px] text-t1">{t(locale, 'brokers.dir.unknownMc').replace('{mc}', lookup)}</span>
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
              className="min-h-9 rounded-lg border border-white/12 px-3 text-[12.5px] text-t2 hover:border-white/30 hover:text-white disabled:opacity-50 max-md:min-h-11"
            >
              {t(locale, 'brokers.dir.checkDot')}
            </button>
          </div>
          {check.state === 'error' && <p className="mt-2 text-[12.5px] text-warn-400">{check.err}</p>}
          {check.state === 'done' && check.data && <BrokerChecklist check={check.data} />}
        </div>
      )}

      {list.length === 0 ? (
        <p className="mt-4 text-[13px] text-t3">
          {q || view === 'attention' ? t(locale, 'brokers.noMatch') : t(locale, 'brokers.dir.empty')}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-1.5">
          <ShowMore
            key={`${view}-${q}`}
            limit={12}
            label={t(locale, 'brokers.dir.more')}
            items={list.map((r) =>
              r.kind === 'broker' ? <BrokerRow key={rowKey(r)} b={r.b} locale={locale} /> : <FacilityRow key={rowKey(r)} f={r.f} locale={locale} />,
            )}
          />
        </div>
      )}
    </>
  )
}

/**
 * Общая оболочка строки: значок слева говорит, брокер это или склад, дальше имя,
 * под ним одна строка фактов, справа одно главное число. Обе половины раздела
 * выглядят одинаково — иначе смешанный список читался бы как два списка подряд.
 */
function DirRow({
  href,
  icon,
  kindLabel,
  name,
  meta,
  linked,
  right,
  rightCls,
}: {
  href: string
  icon: ReactNode
  kindLabel: string
  name: string
  meta: ReactNode
  /** Вторая сторона связи — своей строкой во всю ширину, её нельзя обрезать. */
  linked: string | null
  right: string | null
  rightCls: string
}) {
  return (
    <Link href={href} className={row}>
      <span className="flex items-center gap-3">
        <span
          aria-label={kindLabel}
          title={kindLabel}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-t3"
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-t1">{name}</span>
          <span className="nums block truncate text-[12px] text-t3">{meta}</span>
        </span>
        {right && <span className={`nums max-w-[38%] shrink-0 text-right text-[12px] ${rightCls}`}>{right}</span>}
      </span>
      {/* Связь со второй половиной раздела — своей строкой во всю ширину. В общей
          строке её всегда обрезало первой именно на телефоне, а она здесь главное:
          ради неё брокеры и склады и сведены в один список. */}
      {linked && <span className="mt-0.5 block truncate pl-10 text-[12px] text-t3">{linked}</span>}
    </Link>
  )
}

/** Давно не возили / давно не были — после этого порога это стоит показать в строке. */
const STALE_DAYS = 90

/** «чаще всего — Walmart DC»: вторая сторона связи, брокер у склада и склад у брокера. */
const linkedText = (linked: string | null, locale: Locale) =>
  linked ? t(locale, 'brokers.dir.mostOften').replace('{x}', linked) : null

/** Строка брокера: сколько возили и когда, справа — одно главное про деньги. */
function BrokerRow({ b, locale }: { b: DirBroker; locale: Locale }) {
  const status = b.inactive
    ? { text: t(locale, 'brokers.dir.inactive'), cls: 'text-bad-400' }
    : b.owed > 0 && b.oldest > 30
      ? { text: t(locale, 'brokers.dir.owedLate').replace('{sum}', usd.format(b.owed)).replace('{n}', String(b.oldest)), cls: 'text-warn-400' }
      : b.owed > 0
        ? { text: t(locale, 'brokers.dir.owed').replace('{sum}', usd.format(b.owed)), cls: 'text-t2' }
        : b.payDays != null
          ? { text: t(locale, 'brokers.paysIn').replace('{n}', String(b.payDays)), cls: b.payDays <= 30 ? 'text-good-400' : 'text-warn-400' }
          : b.loads === 0 && b.checked
            ? { text: t(locale, 'brokers.dir.checked').replace('{date}', b.checked), cls: 'text-t3' }
            : null
  // Две вещи, не больше: сколько возили и с кем это связано. «Когда возили в
  // последний раз» из строки убрано — свежесть и так видна порядком списка, а вот
  // «давно не возили» само не всплывёт, поэтому оно остаётся.
  const meta = [
    b.loads > 0 ? t(locale, 'brokers.loadsCount').replace('{n}', String(b.loads)) : null,
    b.sinceDays != null && b.sinceDays > STALE_DAYS ? t(locale, 'brokers.dir.lastDays').replace('{n}', String(b.sinceDays)) : null,
  ].filter(Boolean)
  return (
    <DirRow
      href={`/brokers/${encodeURIComponent(b.key)}`}
      icon={<Handshake size={15} aria-hidden />}
      kindLabel={t(locale, 'brokers.dir.kindBroker')}
      name={b.name}
      meta={meta.join(' · ') || t(locale, 'brokers.dir.kindBroker')}
      linked={linkedText(b.linked, locale)}
      right={status?.text ?? null}
      rightCls={status?.cls ?? ''}
    />
  )
}

/** Строка склада: где это и как часто бываем, справа — сколько там стоим. */
function FacilityRow({ f, locale }: { f: DirFacility; locale: Locale }) {
  const meta = [
    f.place,
    t(locale, 'facilities.visits').replace('{n}', String(f.visits)),
    f.sinceDays != null && f.sinceDays > STALE_DAYS ? t(locale, 'brokers.dir.visitDays').replace('{n}', String(f.sinceDays)) : null,
  ].filter(Boolean)
  return (
    <DirRow
      href={`/facilities/${encodeURIComponent(f.key)}`}
      icon={<Building2 size={15} aria-hidden />}
      kindLabel={t(locale, 'brokers.dir.kindFacility')}
      name={f.name}
      meta={meta.join(' · ') || t(locale, 'brokers.dir.kindFacility')}
      linked={linkedText(f.linked, locale)}
      // Справа у склада — только то, во что он нам обходится: сколько там стоим.
      right={f.dwell != null ? t(locale, 'facilities.dwell').replace('{t}', driveTime(f.dwell, locale)) : null}
      rightCls={f.attention ? 'text-bad-400' : 'text-t2'}
    />
  )
}
