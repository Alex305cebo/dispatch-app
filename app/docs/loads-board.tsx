'use client'

// Грузы раздела «Документы»: одна строка на груз, в ней и бумаги, и деньги.
//
// Раньше это была страница «Оплата · факторинг» раздела «Финансы», а бумаги того же
// груза лежали в «Файлах» — человек читал «не хватает POD» в одном разделе и шёл
// искать файл в другой. Теперь плитки бумаг стоят в той же строке (components/
// load-papers.tsx) и грузятся на месте, а путь денег идёт под ними.
//
// Без права «Финансы» строка та же, только без сумм и денежных действий: грузы
// сгруппированы по тому, все ли бумаги собраны.
// Данные собирает сервер (app/docs/page.tsx), правила этапов — lib/payments.ts,
// запись — app/docs/payment-actions.ts.

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronDown, Download, Landmark, Search } from 'lucide-react'
import { DocLink } from '@/components/doc-link'
import { LoadPapers, missingPapers, papersComplete, type LoadPaper } from '@/components/load-papers'
import { useLocale } from '@/components/locale-provider'
import { notify } from '@/lib/notify'
import { t, type Locale, type MsgKey } from '@/lib/i18n'
import { usd, usd2, usDate } from '@/lib/fmt'
import { generateInvoice } from '@/app/actions'
import {
  FUNDING_SLOW_DAYS,
  PAY_GROUPS,
  PAY_VIA,
  daysBetween,
  paymentsCsv,
  todayEt,
  type FactoringSettings,
  type LoadPayment,
  type PayGroup,
  type PayVia,
} from '@/lib/payments'
import {
  markChargeback,
  markClosed,
  markFunded,
  markPaidDirect,
  markRejected,
  markSubmitted,
  saveFactoringSettings,
  setPaymentNote,
  undoPaymentStep,
} from './payment-actions'

export type PayRow = {
  id: number
  ref: string | null
  route: string
  status: string
  rate: number
  truck: string
  truckId: number | null
  broker: string | null
  deliveryDate: string | null
  paidAt: string | null
  group: PayGroup
  payment: LoadPayment | null
  /** Все бумаги этого груза: и обязательные четыре, и лишние (пломба, фото). */
  papers: LoadPaper[]
  invoiceNumber: string | null
  feeDefault: number
}

type Form =
  | { kind: 'submit'; ids: number[] }
  | { kind: 'funded'; ids: number[] }
  | { kind: 'reject'; id: number }
  | { kind: 'chargeback'; id: number }
  | { kind: 'direct'; id: number }
  | { kind: 'close'; ids: number[] }
  | { kind: 'note'; id: number }

const GROUP_KEY: Record<PayGroup, MsgKey> = {
  problems: 'payments.group.problems',
  toSubmit: 'payments.group.toSubmit',
  awaitingFunding: 'payments.group.awaitingFunding',
  atRisk: 'payments.group.atRisk',
  funded: 'payments.group.funded',
  inWork: 'payments.group.inWork',
  done: 'payments.group.done',
}
const GROUP_TONE: Record<PayGroup, 'plain' | 'good' | 'warn' | 'bad'> = {
  problems: 'bad',
  toSubmit: 'warn',
  awaitingFunding: 'plain',
  atRisk: 'bad',
  funded: 'good',
  inWork: 'plain',
  done: 'plain',
}
/** Короткие имена бумаг для строки «не хватает» — они одинаковы на всех языках. */
const SHORT_KIND: Partial<Record<string, string>> = { ratecon: 'RC', bol: 'BOL', pod: 'POD' }

const OPEN: PayGroup[] = ['problems', 'toSubmit', 'awaitingFunding', 'atRisk']
const BATCH: PayGroup[] = ['toSubmit', 'awaitingFunding', 'funded', 'atRisk']

const input =
  'min-h-10 w-full rounded-xl border border-white/10 bg-ink-900/60 px-3 py-1.5 text-base text-t1 outline-none transition-colors placeholder:text-t3 focus:border-haul-500 max-md:min-h-11'
const btn =
  'inline-flex min-h-9 items-center rounded-lg border border-white/12 bg-white/[0.04] px-3 text-sm font-semibold text-t1 transition-colors hover:border-white/30 hover:bg-white/[0.08] disabled:opacity-50 max-md:min-h-10'
const primary =
  'inline-flex min-h-9 items-center rounded-lg bg-haul-500 px-3 text-sm font-semibold text-white shadow-[0_6px_16px_-8px_rgba(124,108,255,0.9)] transition-colors hover:bg-haul-400 disabled:opacity-50 max-md:min-h-10'

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s)

export function LoadsBoard({
  rows,
  settings,
  today,
  initialQuery = '',
  initialStage = '',
  money = true,
}: {
  rows: PayRow[]
  settings: FactoringSettings
  today: string
  /** Пришли по ссылке с груза (lib/payments.ts financesHref) — сразу найден и раскрыт. */
  initialQuery?: string
  /** Этап, с которого открыть список (ссылка с плитки-числа над ним). */
  initialStage?: string
  /** Есть право «Финансы»: суммы, этапы факторинга и действия с деньгами. Без него
   * остаются те же грузы и их бумаги, разложенные по тому, всё ли собрано. */
  money?: boolean
}) {
  const locale = useLocale()
  const [pending, start] = useTransition()
  const [query, setQuery] = useState(initialQuery)
  const [broker, setBroker] = useState('')
  const [truck, setTruck] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [form, setForm] = useState<Form | null>(null)
  const [editSettings, setEditSettings] = useState(false)
  const [stage, setStage] = useState(initialStage || 'all')
  const factor = settings.name

  const brokers = useMemo(() => [...new Set(rows.map((r) => r.broker).filter((b): b is string => !!b))].sort(), [rows])
  const trucks = useMemo(() => [...new Set(rows.map((r) => r.truck))].sort(), [rows])
  const shown = rows.filter((r) => {
    if (broker && r.broker !== broker) return false
    if (truck && r.truck !== truck) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [r.ref, r.route, r.broker, r.truck, r.invoiceNumber, r.payment?.factorRef, String(r.id)]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q))
  })
  const byGroup = new Map<PayGroup, PayRow[]>()
  for (const r of shown) byGroup.set(r.group, [...(byGroup.get(r.group) ?? []), r])

  // Группы списка. С правом «Финансы» — этапы денег, как и было. Без него делить по
  // этапам факторинга нечего, и груз важен другим: собраны бумаги или нет.
  type Section = { key: string; title: string; short: string; tone: 'plain' | 'good' | 'warn' | 'bad'; group: PayGroup; rows: PayRow[]; defaultOpen: boolean }
  const sections: Section[] = money
    ? PAY_GROUPS.map((g) => ({
        key: g,
        title: fill(t(locale, GROUP_KEY[g]), { factor }),
        short: t(locale, `docs.stage.${g}` as MsgKey),
        tone: GROUP_TONE[g],
        group: g,
        rows: byGroup.get(g) ?? [],
        defaultOpen: OPEN.includes(g) || !!initialQuery,
      }))
    : [
        {
          key: 'missing',
          title: t(locale, 'papers.group.missing'),
          short: t(locale, 'docs.stage.missing'),
          tone: 'warn' as const,
          group: 'toSubmit' as PayGroup,
          rows: shown.filter((r) => r.group !== 'inWork' && !papersComplete(r.papers)),
          defaultOpen: true,
        },
        {
          key: 'inWork',
          title: t(locale, 'papers.group.inWork'),
          short: t(locale, 'docs.stage.inWork'),
          tone: 'plain' as const,
          group: 'inWork' as PayGroup,
          rows: shown.filter((r) => r.group === 'inWork'),
          defaultOpen: true,
        },
        {
          key: 'ready',
          title: t(locale, 'papers.group.ready'),
          short: t(locale, 'docs.stage.ready'),
          tone: 'good' as const,
          group: 'done' as PayGroup,
          rows: shown.filter((r) => r.group !== 'inWork' && papersComplete(r.papers)),
          defaultOpen: !!initialQuery,
        },
      ]

  const selRows = rows.filter((r) => selected.has(r.id))
  const selGroups = new Set(selRows.map((r) => (r.group === 'atRisk' ? 'funded' : r.group)))
  const selGroup = selGroups.size === 1 ? [...selGroups][0]! : null

  const toggle = (id: number) =>
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const run = (fn: () => Promise<{ error: string } | { ok: true; count: number }>, after?: () => void) =>
    start(async () => {
      const res = await fn()
      if ('error' in res) return notify('error', res.error)
      notify('ok', fill(t(locale, 'payments.done'), { n: res.count }))
      setForm(null)
      setSelected(new Set())
      after?.()
    })

  const exportCsv = () => {
    const csv = paymentsCsv(
      shown.map((r) => ({
        loadId: r.id,
        referenceId: r.ref,
        route: r.route,
        truck: r.truck,
        broker: r.broker,
        rate: r.rate,
        status: r.status,
        stage: r.payment?.stage ?? r.group,
        payment: r.payment,
      })),
    )
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `payments-${today}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // Полоса этапов над списком: «Все» и по пилюле на каждую непустую группу. Пилюля
  // сужает список до одной группы — длинный экран из семи групп читается по одной.
  const visible = sections.filter((sec) => sec.rows.length > 0)
  const active = stage !== 'all' && visible.some((sec) => sec.key === stage) ? stage : 'all'
  const listed = active === 'all' ? visible : visible.filter((sec) => sec.key === active)

  return (
    <div id="board" className="@container flex scroll-mt-4 flex-col gap-3">
      {/* Поиск и фильтры — для всех групп сразу; CSV выгружает то, что видно. */}
      <div className="panel flex flex-col gap-3 p-3">
        <div className={`grid gap-2 @2xl:flex @2xl:items-center ${money ? 'grid-cols-[1fr_1fr_auto]' : 'grid-cols-2'}`}>
          <label className="relative col-span-full min-w-0 @2xl:flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-t3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(locale, money ? 'payments.filter.search' : 'papers.filter.search')}
              className={`${input} pl-9`}
            />
          </label>
          <select value={broker} onChange={(e) => setBroker(e.target.value)} className={`${input} min-w-0 @2xl:w-48`}>
            <option value="">{t(locale, 'payments.filter.allBrokers')}</option>
            {brokers.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select value={truck} onChange={(e) => setTruck(e.target.value)} className={`${input} min-w-0 @2xl:w-48`}>
            <option value="">{t(locale, 'payments.filter.allTrucks')}</option>
            {trucks.map((tr) => (
              <option key={tr} value={tr}>
                {tr}
              </option>
            ))}
          </select>
          {money && (
            <button type="button" onClick={exportCsv} className={`${btn} justify-center gap-1.5`}>
              <Download size={14} strokeWidth={2.5} />
              CSV
            </button>
          )}
        </div>

        {visible.length > 1 && (
          <div role="tablist" className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none]">
            <StagePill
              label={t(locale, 'docs.stage.all')}
              count={shown.length}
              active={active === 'all'}
              onClick={() => setStage('all')}
            />
            {visible.map((sec) => (
              <StagePill
                key={sec.key}
                label={sec.short}
                count={sec.rows.length}
                tone={sec.tone}
                active={active === sec.key}
                onClick={() => setStage(active === sec.key ? 'all' : sec.key)}
              />
            ))}
          </div>
        )}

        {/* Факторинг и его условия — одна тихая строка, правится на месте. */}
        {money && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-white/6 pt-2.5 text-sm text-t3">
            {!editSettings ? (
              <>
                <Landmark size={14} className="shrink-0" />
                <span className="min-w-0">
                  {t(locale, 'docs.factoring')}: <b className="font-semibold text-t1">{factor}</b> ·{' '}
                  {settings.recourse
                    ? fill(t(locale, 'payments.settings.recourseOn'), { n: settings.recourseDays })
                    : t(locale, 'payments.settings.recourseOff')}{' '}
                  · {t(locale, 'payments.settings.fee')}
                </span>
                <button type="button" onClick={() => setEditSettings(true)} className="font-medium text-haul-400 hover:underline max-md:min-h-9">
                  {t(locale, 'payments.settings.edit')}
                </button>
              </>
            ) : (
              <SettingsForm
                initial={settings}
                locale={locale}
                pending={pending}
                onCancel={() => setEditSettings(false)}
                onSave={(s) => run(() => saveFactoringSettings(s), () => setEditSettings(false))}
              />
            )}
          </div>
        )}
      </div>

      {/* Выбранные грузы — одним действием: брокер или факторинг проводит их пакетом. */}
      {money && selRows.length > 0 && (
        <div className="panel sticky top-2 z-10 border-haul-500/40 px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-base">
            <span className="font-semibold">
              {fill(t(locale, 'payments.batch.selected'), {
                n: selRows.length,
                amt: usd.format(selRows.reduce((s, r) => s + r.rate, 0)),
              })}
            </span>
            {selGroup === 'toSubmit' && (
              <button type="button" className={primary} onClick={() => setForm({ kind: 'submit', ids: selRows.map((r) => r.id) })}>
                {fill(t(locale, 'payments.batch.submit'), { factor })}
              </button>
            )}
            {selGroup === 'awaitingFunding' && (
              <button type="button" className={primary} onClick={() => setForm({ kind: 'funded', ids: selRows.map((r) => r.id) })}>
                {t(locale, 'payments.batch.funded')}
              </button>
            )}
            {selGroup === 'funded' && (
              <button type="button" className={primary} onClick={() => setForm({ kind: 'close', ids: selRows.map((r) => r.id) })}>
                {fill(t(locale, 'payments.act.close'), { factor })}
              </button>
            )}
            {!selGroup && <span className="text-warn-400">{t(locale, 'payments.batch.mixed')}</span>}
            <button type="button" className="ml-auto text-t3 hover:text-t1 max-md:min-h-9" onClick={() => setSelected(new Set())}>
              {t(locale, 'payments.batch.clear')} ×
            </button>
          </div>
          {form && 'ids' in form && form.ids.length > 1 && (
            <ActionForm
              key={JSON.stringify(form)}
              form={form}
              rows={rows}
              factor={factor}
              today={today}
              locale={locale}
              pending={pending}
              onCancel={() => setForm(null)}
              run={run}
            />
          )}
        </div>
      )}

      {shown.length === 0 && (
        <p className="panel p-6 text-center text-base text-t3">
          {rows.length ? t(locale, 'payments.nothingFound') : t(locale, 'payments.empty')}
        </p>
      )}

      {listed.map((sec) => {
        const list = sec.rows
        const g = sec.group
        const batch = money && BATCH.includes(g)
        return (
          <details
            key={`${sec.key}:${active}`}
            open={active !== 'all' || sec.defaultOpen}
            className="group/sec panel overflow-hidden"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 transition-colors hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
              <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[sec.tone]}`} />
              <span className={`min-w-0 flex-1 truncate text-md font-semibold ${sec.tone === 'plain' ? 'text-t1' : TEXT[sec.tone]}`}>
                {sec.title}
              </span>
              <span className="nums shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-xs font-bold text-t2">{list.length}</span>
              {money && <span className="nums shrink-0 text-md font-bold text-t1">{usd.format(list.reduce((s, r) => s + r.rate, 0))}</span>}
              <ChevronDown size={16} className="shrink-0 text-t3 transition-transform duration-200 group-open/sec:rotate-180" />
            </summary>
            <ul className="divide-y divide-white/6 border-t border-white/8">
              {list.map((r) => (
                <li
                  key={r.id}
                  id={`pay-${r.id}`}
                  className={`relative scroll-mt-20 px-3 py-3.5 transition-colors @xl:px-4 hover:bg-white/[0.025] ${
                    selected.has(r.id) ? 'bg-haul-500/[0.07]' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {batch && (
                      <input
                        type="checkbox"
                        aria-label={r.route}
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        className="mt-1 size-4 shrink-0 accent-haul-500 max-md:size-5"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-3">
                        <Link href={`/loads/${r.id}`} className="min-w-0 flex-1 hover:[&_.route]:text-haul-300">
                          <div className="route text-md font-semibold text-t1 transition-colors">{r.route}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-t3">
                            {r.ref && <span className="nums text-t2">#{r.ref}</span>}
                            {r.ref && <span aria-hidden>·</span>}
                            <span>{r.truck}</span>
                            {r.broker && (
                              <>
                                <span aria-hidden>·</span>
                                <span>{r.broker}</span>
                              </>
                            )}
                          </div>
                          {money && <StageLine row={r} group={g} settings={settings} today={today} locale={locale} />}
                        </Link>
                        {money && <span className="nums shrink-0 text-lg font-bold text-t1">{usd.format(r.rate)}</span>}
                      </div>
                      {/* Бумаги слева, действия с деньгами справа — одной строкой на
                          широкой плитке, двумя на узкой. */}
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
                        <LoadPapers loadId={r.id} papers={r.papers} urgent={g !== 'inWork'} />
                        {money && (
                          // Узкая плитка: главное действие во всю ширину, остальные парой под
                          // ним — три кнопки в столбик занимали на телефоне пол-экрана.
                          <div className="grid w-full grid-cols-2 items-center gap-2 [&>*]:justify-center [&>*:first-child]:col-span-2 @xl:flex @xl:w-auto @xl:flex-wrap @xl:[&>*:first-child]:col-span-1 @3xl:justify-end">
                            <RowActions row={r} group={g} factor={factor} locale={locale} pending={pending} setForm={setForm} run={run} />
                          </div>
                        )}
                      </div>
                      {money && form && (('id' in form && form.id === r.id) || ('ids' in form && form.ids.length === 1 && form.ids[0] === r.id)) && (
                        <ActionForm
                          key={JSON.stringify(form)}
                          form={form}
                          rows={rows}
                          factor={factor}
                          today={today}
                          locale={locale}
                          pending={pending}
                          onCancel={() => setForm(null)}
                          run={run}
                        />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )
      })}
    </div>
  )
}

const DOT = { plain: 'bg-t3', good: 'bg-good-400', warn: 'bg-warn-400', bad: 'bg-bad-400' } as const
const TEXT = { good: 'text-good-400', warn: 'text-warn-400', bad: 'text-bad-400' } as const

function StagePill({
  label,
  count,
  tone = 'plain',
  active,
  onClick,
}: {
  label: string
  count: number
  tone?: 'plain' | 'good' | 'warn' | 'bad'
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

/** Одна строка «где деньги сейчас» под маршрутом. */
function StageLine({
  row: r,
  group,
  settings,
  today,
  locale,
}: {
  row: PayRow
  group: PayGroup
  settings: FactoringSettings
  today: string
  locale: Locale
}) {
  const p = r.payment
  const parts: { text: string; tone?: 'warn' | 'bad' | 'good' }[] = []
  if (group === 'inWork') {
    if (r.deliveryDate) parts.push({ text: fill(t(locale, 'payments.deliveryDue'), { date: usDate(r.deliveryDate) }) })
  } else if (group === 'toSubmit') {
    if (r.deliveryDate) {
      parts.push({ text: fill(t(locale, 'payments.delivered'), { date: usDate(r.deliveryDate) }) })
      const d = daysBetween(r.deliveryDate, today)
      if (d > 0) parts.push({ text: fill(t(locale, 'payments.daysAgo'), { n: d }), tone: d > 3 ? 'warn' : undefined })
    }
    const missing = missingPapers(r.papers).map((k) => SHORT_KIND[k] ?? k)
    if (missing.length) parts.push({ text: fill(t(locale, 'payments.docsMissing'), { docs: missing.join(' / ') }), tone: 'bad' })
  } else if (p?.stage === 'submitted' && p.submittedOn) {
    const d = daysBetween(p.submittedOn, today)
    parts.push({ text: fill(t(locale, 'payments.submitted'), { date: usDate(p.submittedOn) }) })
    parts.push({ text: fill(t(locale, 'payments.waitingDays'), { n: d }), tone: d > FUNDING_SLOW_DAYS ? 'warn' : undefined })
    if (p.factorRef) parts.push({ text: `№ ${p.factorRef}` })
  } else if ((p?.stage === 'funded' || p?.stage === 'closed') && p.fundedOn) {
    parts.push({ text: fill(t(locale, 'payments.funded'), { date: usDate(p.fundedOn) }), tone: 'good' })
    if (p.advanceAmount != null) parts.push({ text: fill(t(locale, 'payments.advance'), { amt: usd2.format(p.advanceAmount) }) })
    if (p.feeAmount != null) parts.push({ text: fill(t(locale, 'payments.fee'), { amt: usd2.format(p.feeAmount) }) })
    if (p.stage === 'closed' && p.closedOn) parts.push({ text: fill(t(locale, 'payments.closed'), { date: usDate(p.closedOn) }) })
    else if (settings.recourse) {
      const left = settings.recourseDays - daysBetween(p.fundedOn, today)
      if (group === 'atRisk')
        parts.push({
          text: left >= 0 ? fill(t(locale, 'payments.recourseIn'), { n: left }) : fill(t(locale, 'payments.recourseOverdue'), { n: -left }),
          tone: 'bad',
        })
    }
  } else if (p?.stage === 'rejected') {
    parts.push({ text: fill(t(locale, 'payments.rejected'), { date: usDate(p.rejectedOn), reason: p.rejectReason ?? '' }), tone: 'bad' })
  } else if (p?.stage === 'chargeback') {
    parts.push({
      text: fill(t(locale, 'payments.chargeback'), { date: usDate(p.chargebackOn), amt: usd2.format(p.chargebackAmount ?? 0) }),
      tone: 'bad',
    })
  } else if (p?.stage === 'paid') {
    parts.push({
      text: fill(t(locale, 'payments.paidDirect'), {
        date: usDate(p.paidOn),
        via: t(locale, `payments.via.${p.paidVia ?? 'other'}` as MsgKey),
        amt: usd2.format(p.paidAmount ?? r.rate),
      }),
      tone: 'good',
    })
  } else if (r.paidAt) {
    parts.push({ text: fill(t(locale, 'payments.legacyPaid'), { date: usDate(todayEt(new Date(r.paidAt))) }), tone: 'good' })
  }
  if (p?.note) parts.push({ text: `✎ ${p.note}` })
  if (!parts.length) return null
  const toneClass = { warn: 'text-warn-400', bad: 'text-bad-400', good: 'text-good-400' } as const
  return (
    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-sm text-t2">
      {parts.map((x, i) => (
        <span key={i} className={x.tone ? toneClass[x.tone] : undefined}>
          {i > 0 ? '· ' : ''}
          {x.text}
        </span>
      ))}
    </div>
  )
}

function RowActions({
  row: r,
  group,
  factor,
  locale,
  pending,
  setForm,
  run,
}: {
  row: PayRow
  group: PayGroup
  factor: string
  locale: Locale
  pending: boolean
  setForm: (f: Form) => void
  run: (fn: () => Promise<{ error: string } | { ok: true; count: number }>) => void
}) {
  const [building, startBuild] = useTransition()
  const undo = r.payment && (
    <button
      type="button"
      disabled={pending}
      className="text-sm text-t3 transition-colors hover:text-bad-400 max-md:min-h-9"
      onClick={() => {
        if (window.confirm(fill(t(locale, 'payments.act.undoConfirm'), { route: r.route }))) run(() => undoPaymentStep(r.id))
      }}
    >
      {t(locale, 'payments.act.undo')}
    </button>
  )
  const note = r.payment && (
    <button type="button" className="text-sm text-t3 hover:text-t1 max-md:min-h-9" onClick={() => setForm({ kind: 'note', id: r.id })}>
      {t(locale, 'payments.act.note')}
    </button>
  )
  const invoiceDoc = r.papers.find((p) => p.kind === 'invoice') ?? null
  const packet = invoiceDoc ? (
    <DocLink docId={invoiceDoc.id} className={btn}>
      {t(locale, 'payments.act.packet')}
    </DocLink>
  ) : (
    <button
      type="button"
      disabled={building}
      className={btn}
      onClick={() =>
        startBuild(async () => {
          const res = await generateInvoice(r.id)
          if ('error' in res) notify('error', res.error)
          else window.open(`/api/docs/${res.docId}`, '_blank')
        })
      }
    >
      {building ? '…' : t(locale, 'payments.act.buildPacket')}
    </button>
  )
  switch (group) {
    case 'toSubmit':
      return (
        <>
          <button type="button" className={primary} onClick={() => setForm({ kind: 'submit', ids: [r.id] })}>
            {fill(t(locale, 'payments.act.submit'), { factor })}
          </button>
          {packet}
          <button type="button" className={btn} onClick={() => setForm({ kind: 'direct', id: r.id })}>
            {t(locale, 'payments.act.direct')}
          </button>
        </>
      )
    case 'awaitingFunding':
      return (
        <>
          <button type="button" className={primary} onClick={() => setForm({ kind: 'funded', ids: [r.id] })}>
            {t(locale, 'payments.act.funded')}
          </button>
          <button type="button" className={btn} onClick={() => setForm({ kind: 'reject', id: r.id })}>
            {t(locale, 'payments.act.reject')}
          </button>
          {packet}
          {note}
          {undo}
        </>
      )
    case 'funded':
    case 'atRisk':
      return (
        <>
          <button type="button" className={primary} onClick={() => setForm({ kind: 'close', ids: [r.id] })}>
            {fill(t(locale, 'payments.act.close'), { factor })}
          </button>
          <button type="button" className={btn} onClick={() => setForm({ kind: 'chargeback', id: r.id })}>
            {t(locale, 'payments.act.chargeback')}
          </button>
          {note}
          {undo}
        </>
      )
    case 'problems':
      return (
        <>
          <button type="button" className={primary} onClick={() => setForm({ kind: 'submit', ids: [r.id] })}>
            {fill(t(locale, 'payments.act.resubmit'), { factor })}
          </button>
          <button type="button" className={btn} onClick={() => setForm({ kind: 'direct', id: r.id })}>
            {t(locale, 'payments.act.direct')}
          </button>
          {note}
          {undo}
        </>
      )
    case 'done':
      return (
        <>
          {note}
          {undo}
          {!r.payment && <span className="text-sm text-t3">{t(locale, 'payments.legacyHint')}</span>}
        </>
      )
    default:
      return <span className="text-sm text-t3">{t(locale, 'payments.inWorkHint')}</span>
  }
}

function ActionForm({
  form,
  rows,
  factor,
  today,
  locale,
  pending,
  onCancel,
  run,
}: {
  form: Form
  rows: PayRow[]
  factor: string
  today: string
  locale: Locale
  pending: boolean
  onCancel: () => void
  run: (fn: () => Promise<{ error: string } | { ok: true; count: number }>) => void
}) {
  const one = 'id' in form ? rows.find((r) => r.id === form.id) : rows.find((r) => r.id === form.ids[0])
  const [on, setOn] = useState(today)
  const [ref, setRef] = useState('')
  const [reason, setReason] = useState('')
  const [via, setVia] = useState<PayVia>('ach')
  const [amount, setAmount] = useState(one ? String(one.payment?.advanceAmount ?? one.rate) : '')
  const [note, setNote] = useState(one?.payment?.note ?? '')
  // Аванс и комиссия у каждого груза свои: по умолчанию комиссия — % факторинга трака.
  const ids = 'ids' in form ? form.ids : [form.id]
  const [money, setMoney] = useState<Record<number, { advance: string; fee: string }>>(() =>
    Object.fromEntries(
      ids.map((id) => {
        const r = rows.find((x) => x.id === id)!
        return [id, { advance: String(Math.round((r.rate - r.feeDefault) * 100) / 100), fee: String(r.feeDefault) }]
      }),
    ),
  )

  const dateField = (
    <label className="flex flex-col gap-1 text-xs text-t2">
      {t(locale, 'payments.form.date')}
      <input type="date" value={on} max={today} onChange={(e) => setOn(e.target.value)} className={input} />
    </label>
  )
  let body: React.ReactNode = null
  let submit: () => void = () => {}
  switch (form.kind) {
    case 'submit':
      body = (
        <>
          {dateField}
          <label className="flex flex-col gap-1 text-xs text-t2">
            {fill(t(locale, 'payments.form.ref'), { factor })}
            <input value={ref} onChange={(e) => setRef(e.target.value)} className={input} />
          </label>
        </>
      )
      submit = () => run(() => markSubmitted(form.ids, on, ref))
      break
    case 'funded':
      body = (
        <>
          {dateField}
          <div className="flex w-full flex-col gap-1.5">
            {form.ids.map((id) => {
              const r = rows.find((x) => x.id === id)!
              const m = money[id]!
              return (
                <div key={id} className="grid grid-cols-[1fr_7rem_6rem] items-end gap-2 max-sm:grid-cols-2">
                  <span className="truncate pb-1.5 text-sm text-t2 max-sm:col-span-2">
                    {r.route} · {usd.format(r.rate)}
                  </span>
                  <label className="flex flex-col gap-1 text-xs text-t2">
                    {t(locale, 'payments.form.advance')}
                    <input inputMode="decimal" value={m.advance} onChange={(e) => setMoney({ ...money, [id]: { ...m, advance: e.target.value } })} className={input} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-t2">
                    {t(locale, 'payments.form.fee')}
                    <input inputMode="decimal" value={m.fee} onChange={(e) => setMoney({ ...money, [id]: { ...m, fee: e.target.value } })} className={input} />
                  </label>
                </div>
              )
            })}
          </div>
        </>
      )
      submit = () => run(() => markFunded(form.ids.map((id) => ({ loadId: id, advance: money[id]!.advance, fee: money[id]!.fee })), on))
      break
    case 'close':
      body = dateField
      submit = () => run(() => markClosed(form.ids, on))
      break
    case 'reject':
      body = (
        <>
          {dateField}
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-t2">
            {t(locale, 'payments.form.reason')}
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={input} />
          </label>
        </>
      )
      submit = () => run(() => markRejected(form.id, on, reason))
      break
    case 'chargeback':
      body = (
        <>
          {dateField}
          <label className="flex flex-col gap-1 text-xs text-t2">
            {t(locale, 'payments.form.amount')}
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
          </label>
        </>
      )
      submit = () => run(() => markChargeback(form.id, on, amount))
      break
    case 'direct':
      body = (
        <>
          {dateField}
          <label className="flex flex-col gap-1 text-xs text-t2">
            {t(locale, 'payments.form.via')}
            <select value={via} onChange={(e) => setVia(e.target.value as PayVia)} className={input}>
              {PAY_VIA.map((v) => (
                <option key={v} value={v}>
                  {t(locale, `payments.via.${v}` as MsgKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-t2">
            {t(locale, 'payments.form.amount')}
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-t2">
            {t(locale, 'payments.form.paidRef')}
            <input value={ref} onChange={(e) => setRef(e.target.value)} className={input} />
          </label>
        </>
      )
      submit = () => run(() => markPaidDirect(form.id, { via, on, amount, ref }))
      break
    case 'note':
      body = (
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-t2">
          {t(locale, 'payments.act.note')}
          <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
        </label>
      )
      submit = () => run(() => setPaymentNote(form.id, note))
      break
  }
  return (
    <div className="mt-2.5 flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
      {body}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={submit} className={primary}>
          {pending ? '…' : t(locale, 'payments.act.save')}
        </button>
        <button type="button" onClick={onCancel} className={btn}>
          {t(locale, 'payments.act.cancel')}
        </button>
      </div>
    </div>
  )
}

function SettingsForm({
  initial,
  locale,
  pending,
  onSave,
  onCancel,
}: {
  initial: FactoringSettings
  locale: Locale
  pending: boolean
  onSave: (s: FactoringSettings) => void
  onCancel: () => void
}) {
  const [s, setS] = useState(initial)
  return (
    <div className="flex w-full flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-t2">
        {t(locale, 'payments.settings.name')}
        <input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} className={input} />
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm text-t2">
        <input type="checkbox" checked={s.recourse} onChange={(e) => setS({ ...s, recourse: e.target.checked })} className="size-4 accent-haul-500" />
        {t(locale, 'payments.settings.recourse')}
      </label>
      {s.recourse && (
        <label className="flex flex-col gap-1 text-xs text-t2">
          {t(locale, 'payments.settings.days')}
          <input
            inputMode="numeric"
            value={s.recourseDays}
            onChange={(e) => setS({ ...s, recourseDays: Number(e.target.value) || 0 })}
            className={`${input} w-24`}
          />
        </label>
      )}
      <button type="button" disabled={pending} onClick={() => onSave(s)} className={primary}>
        {t(locale, 'payments.act.save')}
      </button>
      <button type="button" onClick={onCancel} className={btn}>
        {t(locale, 'payments.act.cancel')}
      </button>
    </div>
  )
}
