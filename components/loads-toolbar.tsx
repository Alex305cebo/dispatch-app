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

import { useMemo, useState } from 'react'
import { Download, Search, X } from 'lucide-react'
import type { LoadRecord, TruckRecord } from '@/lib/map'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale, type MsgKey } from '@/lib/i18n'

export type LoadFilter = 'all' | 'losing' | 'uninvoiced' | 'unpaid' | 'noPod'
export type LoadSort = 'newest' | 'rate' | 'rpm' | 'net'

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

const FILTERS: { key: LoadFilter; label: MsgKey }[] = [
  { key: 'all', label: 'loads.filter.all' },
  { key: 'losing', label: 'loads.filter.losing' },
  { key: 'uninvoiced', label: 'loads.filter.uninvoiced' },
  { key: 'unpaid', label: 'loads.filter.unpaid' },
  { key: 'noPod', label: 'loads.filter.noPod' },
]

const SORTS: { key: LoadSort; label: MsgKey }[] = [
  { key: 'newest', label: 'loads.sort.newest' },
  { key: 'rate', label: 'loads.sort.rate' },
  { key: 'rpm', label: 'loads.sort.rpm' },
  { key: 'net', label: 'loads.sort.net' },
]

export type LoadMetrics = { net: number; rpm: number; hasPod: boolean }

export function useLoadsFilter(
  loads: LoadRecord[],
  trucks: TruckRecord[],
  metrics: Record<number, LoadMetrics>,
) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LoadFilter>('all')
  const [sort, setSort] = useState<LoadSort>('newest')

  const byId = useMemo(() => new Map(trucks.map((tr) => [tr.id, tr])), [trucks])

  const result = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = loads
    if (q) {
      // Пробелы = И, а не фраза: «tql ромео» должно находить груз, где эти слова
      // стоят в разных полях.
      const words = q.split(/\s+/)
      out = out.filter((l) => {
        const hay = haystack(l, l.truckId != null ? byId.get(l.truckId) : undefined)
        return words.every((w) => hay.includes(w))
      })
    }
    out = out.filter((l) => {
      const m = metrics[l.id]
      switch (filter) {
        case 'losing':
          return l.status !== 'cancelled' && l.status !== 'quoted' && (m?.net ?? 0) < 0
        case 'uninvoiced':
          return l.status === 'delivered' && !l.invoicedAt
        case 'unpaid':
          return !!l.invoicedAt && !l.paidAt
        case 'noPod':
          return (l.status === 'delivered' || l.status === 'paid') && !(m?.hasPod ?? false)
        default:
          return true
      }
    })
    if (sort !== 'newest') {
      out = [...out].sort((a, b) => {
        if (sort === 'rate') return b.rate - a.rate
        if (sort === 'rpm') return (metrics[b.id]?.rpm ?? 0) - (metrics[a.id]?.rpm ?? 0)
        return (metrics[b.id]?.net ?? 0) - (metrics[a.id]?.net ?? 0)
      })
    }
    return out
  }, [loads, byId, metrics, query, filter, sort])

  return { query, setQuery, filter, setFilter, sort, setSort, result }
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

export function LoadsToolbar({
  query,
  setQuery,
  filter,
  setFilter,
  sort,
  setSort,
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
  shown: number
  total: number
  rows: LoadRecord[]
  trucks: TruckRecord[]
  metrics: Record<number, LoadMetrics>
}) {
  const locale = useLocale()

  return (
    <div className="panel mb-3 flex flex-col gap-2 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[12rem] flex-1 items-center">
          <Search size={14} className="pointer-events-none absolute left-2.5 text-white/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(locale, 'loads.search.placeholder')}
            className="w-full rounded-lg border border-white/10 bg-ink-950/70 py-1.5 pl-8 pr-7 text-[13px] text-white outline-none focus:border-haul-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t(locale, 'loads.search.clear')}
              className="absolute right-2 text-white/40 hover:text-white/80"
            >
              <X size={13} />
            </button>
          )}
        </label>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as LoadSort)}
          className="rounded-lg border border-white/10 bg-ink-950/70 px-2 py-1.5 text-[12.5px] text-white/85 outline-none focus:border-haul-500"
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
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[12.5px] font-medium text-white/75 transition-colors hover:border-white/25 hover:text-white"
        >
          <Download size={13} />
          CSV
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
              filter === f.key ? 'bg-haul-500/25 text-haul-300' : 'bg-white/6 text-white/60 hover:text-white/90'
            }`}
          >
            {t(locale, f.label)}
          </button>
        ))}
        {/* Сколько показано из скольких — иначе после фильтра непонятно, пусто
            потому что ничего нет, или потому что фильтр отсёк всё. */}
        <span className="nums ml-auto text-[11.5px] text-white/40">
          {shown === total
            ? `${total}`
            : t(locale, 'loads.filter.shownOf').replace('{n}', String(shown)).replace('{total}', String(total))}
        </span>
      </div>
    </div>
  )
}

export type { Locale }
