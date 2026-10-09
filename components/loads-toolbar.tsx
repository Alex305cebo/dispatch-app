'use client'

// Панель над списком грузов: поиск, фильтры, сортировка и выгрузка.
//
// Раздел «Грузы» до этого умел только показывать всё подряд тремя способами. Пока
// грузов десяток, это работает; на сотне «найти рейс TQL в Ромеовилль» превращается
// в прокрутку глазами. Диспетчер ищет по одному из четырёх: маршрут, брокер, номер
// груза, водитель — поэтому строка поиска одна и смотрит во все четыре сразу, а не
// заставляет выбирать поле.
//
// Фильтры не «умные»: каждый отвечает на вопрос, который правда задают вслух —
// «что горит по деньгам», «где не собраны бумаги», «что в убыток». Всё считается по
// уже загруженным грузам, ни одного нового запроса.
//
// С 10/09/26 фильтры — пилюли с числом, как на «Документах», и в них же «В работе /
// Завершённые / Все»: раньше это был отдельный переключатель, а сколько грузов в каком
// состоянии — шесть маленьких плиток над картой (план «Порядок в TMS»).

import type { LoadStop } from '@/lib/stops'
import type { RateCheck } from '@/lib/rate-check-core'
import { stopOrder } from '@/lib/loads-dashboard'
import { useMemo, useState } from 'react'
import { Download, Search, X } from 'lucide-react'
import { CountPill } from '@/components/count-pill'
import type { LoadRecord, TruckRecord } from '@/lib/map'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale, type MsgKey } from '@/lib/i18n'

export type LoadFilter = 'working' | 'completed' | 'all' | 'losing' | 'uninvoiced' | 'unpaid' | 'noPod' | 'ready' | 'unassigned'
export type LoadSort = 'newest' | 'rate' | 'rpm' | 'net' | 'nearest'

/** Строка, по которой ищем. Всё, что диспетчер помнит о грузе, в одном месте. */
function haystack(l: LoadRecord, truck: TruckRecord | undefined): string {
  return [
    l.origin,
    l.destination,
    l.brokerName,
    l.referenceId,
    l.brokerMc,
    truck?.driverName,
    truck?.number,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

// Первые три — где груз в жизни (раньше переключатель «В работе / Завершённые / Все»),
// остальные — что по нему не так с деньгами и бумагами.
const SCOPES: { key: LoadFilter; label: MsgKey }[] = [
  { key: 'working', label: 'loads.dash.working' },
  { key: 'completed', label: 'loads.dash.completed' },
  { key: 'all', label: 'loads.filter.all' },
]
const FILTERS: { key: LoadFilter; label: MsgKey }[] = [
  { key: 'losing', label: 'loads.filter.losing' },
  { key: 'uninvoiced', label: 'loads.filter.uninvoiced' },
  { key: 'unpaid', label: 'loads.filter.unpaid' },
  { key: 'noPod', label: 'loads.filter.noPod' },
  { key: 'ready', label: 'loads.filter.ready' },
  { key: 'unassigned', label: 'loads.dash.unassigned' },
]
const ALL_FILTERS = [...SCOPES, ...FILTERS].map((f) => f.key)

/** «В работе» — то, по чему ещё ездят и звонят: заявка, забукированный, в пути. */
const WORKING = new Set<LoadRecord['status']>(['quoted', 'booked', 'in_transit'])

const SORTS: { key: LoadSort; label: MsgKey }[] = [
  { key: 'newest', label: 'loads.sort.newest' },
  { key: 'rate', label: 'loads.sort.rate' },
  { key: 'rpm', label: 'loads.sort.rpm' },
  { key: 'net', label: 'loads.sort.net' },
  { key: 'nearest', label: 'loads.sort.nearest' },
]

export type LoadMetrics = {
  net: number
  rpm: number
  hasPod: boolean
  hasRc: boolean
  /** Ближайшая непройденная остановка открытого груза; null у закрытых. */
  nextStop: LoadStop | null
  /** На сколько минут закрылось окно ближайшей остановки без отметки о приезде
   * (lib/loads-dashboard.ts lateStop); null — не опаздывает. */
  lateMin: number | null
  /** Рыночная ставка за гружёную милю — как в карточке груза: вписанная в груз, иначе DAT
   * по региону погрузки. null — сравнивать не с чем. */
  market: number | null
  /** Дата снимка DAT (MM/DD/YY), когда рынок взят из DAT; null — рынок вписан в груз. */
  marketAt: string | null
  /** Ставка против цели торга по маршруту (lib/rate-check.ts laneTargets) — у открытых грузов. */
  rc?: Pick<RateCheck, 'rpm' | 'target'> | null
}

/** 0 — в пути, 1 — забукирован, 2 — всё остальное. */
export function activeRank(status: string): number {
  return status === 'in_transit' ? 0 : status === 'booked' ? 1 : 2
}

function matches(filter: LoadFilter, l: LoadRecord, m: LoadMetrics | undefined, hasTruck: (id: number) => boolean): boolean {
  switch (filter) {
    case 'working':
      return WORKING.has(l.status)
    case 'completed':
      return !WORKING.has(l.status)
    case 'losing':
      return l.status !== 'cancelled' && l.status !== 'quoted' && (m?.net ?? 0) < 0
    case 'uninvoiced':
      return l.status === 'delivered' && !l.invoicedAt
    case 'unpaid':
      return !!l.invoicedAt && !l.paidAt
    case 'ready':
      return l.status === 'delivered' && !l.invoicedAt && !!m?.hasPod && !!m?.hasRc
    case 'noPod':
      return (l.status === 'delivered' || l.status === 'paid') && !(m?.hasPod ?? false)
    case 'unassigned':
      return l.status !== 'cancelled' && (l.truckId == null || !hasTruck(l.truckId))
    default:
      return true
  }
}

export function useLoadsFilter(
  loads: LoadRecord[],
  trucks: TruckRecord[],
  metrics: Record<number, LoadMetrics>,
  initialQuery = '',
) {
  const [query, setQueryRaw] = useState(initialQuery)
  // «В работе» по умолчанию; поиск из адреса (ссылки из «Направлений») смотрит на всё.
  const [filter, setFilter] = useState<LoadFilter>(initialQuery ? 'all' : 'working')
  const [sort, setSort] = useState<LoadSort>('newest')

  const byId = useMemo(() => new Map(trucks.map((tr) => [tr.id, tr])), [trucks])

  // Начали искать, стоя на «В работе» или «Завершённых», — ищем по всем грузам и честно
  // зажигаем «Все»: иначе нужный рейс прятался бы за пилюлей, которую никто не трогал.
  const setQuery = (v: string) => {
    if (!query.trim() && v.trim() && (filter === 'working' || filter === 'completed')) setFilter('all')
    setQueryRaw(v)
  }

  const queried = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return loads
    // Пробелы = И, а не фраза: «tql ромео» должно находить груз, где эти слова
    // стоят в разных полях.
    const words = q.split(/\s+/)
    return loads.filter((l) => {
      const hay = haystack(l, l.truckId != null ? byId.get(l.truckId) : undefined)
      return words.every((w) => hay.includes(w))
    })
  }, [loads, byId, query])

  // Число на каждой пилюле — сколько грузов она покажет при этом поиске.
  const counts = useMemo(() => {
    const out = {} as Record<LoadFilter, number>
    for (const key of ALL_FILTERS) out[key] = queried.filter((l) => matches(key, l, metrics[l.id], (id) => byId.has(id))).length
    return out
  }, [queried, metrics, byId])

  const result = useMemo(() => {
    let out = queried.filter((l) => matches(filter, l, metrics[l.id], (id) => byId.has(id)))
    if (sort !== 'newest') {
      out = [...out].sort((a, b) => {
        if (sort === 'nearest') {
          const ka = stopOrder(metrics[a.id]?.nextStop)
          const kb = stopOrder(metrics[b.id]?.nextStop)
          return ka === kb ? 0 : ka < kb ? -1 : 1
        }
        if (sort === 'rate') return b.rate - a.rate
        if (sort === 'rpm') return (metrics[b.id]?.rpm ?? 0) - (metrics[a.id]?.rpm ?? 0)
        return (metrics[b.id]?.net ?? 0) - (metrics[a.id]?.net ?? 0)
      })
    }
    // Активные — всегда сверху, при любой сортировке и любом фильтре: в пути, потом
    // забукированные, потом остальные. Сортировка стабильная, внутри группы порядок
    // выбранной сортировки сохраняется.
    // «По ближайшей остановке» уже расставил открытые грузы; закрытые (без остановки) ушли в конец.
    if (sort === 'nearest') return out
    return [...out].sort((a, b) => activeRank(a.status) - activeRank(b.status))
  }, [queried, byId, metrics, filter, sort])

  return { query, setQuery, filter, setFilter, sort, setSort, result, counts }
}

/** Выгрузка того, что сейчас на экране, — для бухгалтера, факторинга и налоговой.
 * Берётся ОТФИЛЬТРОВАННЫЙ список: «выгрузи неоплаченные за месяц» — это фильтр плюс
 * одна кнопка, а не отдельный отчёт, который пришлось бы придумывать. */
function toCsv(loads: LoadRecord[], trucks: TruckRecord[], metrics: Record<number, LoadMetrics>): string {
  const byId = new Map(trucks.map((tr) => [tr.id, tr]))
  const head = [
    'load_id', 'reference', 'status', 'pickup_date', 'delivery_date',
    'origin', 'destination', 'broker', 'broker_mc', 'truck', 'driver',
    'rate', 'loaded_miles', 'deadhead_miles', 'rpm', 'net', 'invoiced_at', 'paid_at',
  ]
  // Кавычки удваиваются, поле в кавычках — иначе запятая в «Dallas, TX» разорвёт строку.
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const rows = loads.map((l) => {
    const tr = l.truckId != null ? byId.get(l.truckId) : undefined
    const m = metrics[l.id]
    return [
      l.id, l.referenceId, l.status, l.pickupDate, l.deliveryDate,
      l.origin, l.destination, l.brokerName, l.brokerMc, tr?.number, tr?.driverName,
      l.rate, l.loadedMiles, l.deadheadMiles, m ? m.rpm.toFixed(2) : '', m ? Math.round(m.net) : '',
      l.invoicedAt, l.paidAt,
    ].map(cell).join(',')
  })
  return [head.join(','), ...rows].join('\n')
}

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const field =
  'min-h-10 w-full rounded-xl border border-white/10 bg-ink-900/60 px-3 py-1.5 text-base text-t1 outline-none transition-colors placeholder:text-t3 focus:border-haul-500 max-md:min-h-11'

export function LoadsToolbar({
  query,
  setQuery,
  filter,
  setFilter,
  sort,
  setSort,
  counts,
  shown,
  total,
  rows,
  trucks,
  metrics,
}: {
  query: string
  setQuery: (v: string) => void
  filter: LoadFilter
  setFilter: (v: LoadFilter) => void
  sort: LoadSort
  setSort: (v: LoadSort) => void
  /** Сколько грузов покажет каждая пилюля при этом поиске (useLoadsFilter). */
  counts: Record<LoadFilter, number>
  shown: number
  total: number
  rows: LoadRecord[]
  trucks: TruckRecord[]
  metrics: Record<number, LoadMetrics>
}) {
  const locale = useLocale()
  const pill = (f: { key: LoadFilter; label: MsgKey }, tone?: 'warn' | 'bad') => (
    <CountPill
      key={f.key}
      label={t(locale, f.label)}
      count={counts[f.key]}
      tone={tone && counts[f.key] > 0 ? tone : 'plain'}
      active={filter === f.key}
      onClick={() => setFilter(f.key)}
    />
  )

  return (
    // Как поиск на «Документах»: строка поиска и выбор над пилюлями, CSV справа.
    <div className="@container panel mb-3 flex flex-col gap-3 p-3">
      <div className="grid grid-cols-[1fr_auto] gap-2 @2xl:flex @2xl:items-center">
        <label className="relative col-span-full min-w-0 @2xl:flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-t3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(locale, 'loads.search.placeholder')}
            className={`${field} pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t(locale, 'loads.search.clear')}
              className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center text-t3 hover:text-t1"
            >
              <X size={14} />
            </button>
          )}
        </label>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as LoadSort)}
          aria-label={t(locale, 'loads.view.sortLabel')}
          className={`${field} min-w-0 @2xl:w-52`}
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {t(locale, s.label)}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => download(toCsv(rows, trucks, metrics), `loads-${new Date().toISOString().slice(0, 10)}.csv`)}
          title={t(locale, 'loads.export.title')}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm font-semibold text-t1 transition-colors hover:border-white/30 hover:bg-white/[0.08] max-md:min-h-11"
        >
          <Download size={14} strokeWidth={2.5} />
          CSV
        </button>
      </div>

      {/* На телефоне пилюли едут вбок одной строкой, на широком — переносятся. */}
      <div role="tablist" className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {SCOPES.map((f) => pill(f))}
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-white/10" />
        {FILTERS.map((f) =>
          // «Не назначены» — только когда такие есть: пустая пилюля про трак лишь шумит.
          f.key === 'unassigned' && counts.unassigned === 0 && filter !== 'unassigned'
            ? null
            : pill(f, f.key === 'losing' ? 'bad' : f.key === 'unassigned' ? 'warn' : undefined),
        )}
        {/* Сколько показано из скольких — иначе после фильтра непонятно, пусто
            потому что ничего нет, или потому что фильтр отсёк всё. */}
        <span className="nums ml-auto shrink-0 pl-2 text-xs text-t3">
          {shown === total
            ? `${total}`
            : t(locale, 'loads.filter.shownOf').replace('{n}', String(shown)).replace('{total}', String(total))}
        </span>
      </div>
    </div>
  )
}

export type { Locale }
