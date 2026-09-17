'use client'

// «Оплата · факторинг» — рабочее место бухгалтера: путь денег за каждый груз.
// Данные собирает сервер (app/invoices/page.tsx), правила этапов — lib/payments.ts,
// запись — app/invoices/payment-actions.ts.

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { Collapse } from '@/components/collapse'
import { DocLink } from '@/components/doc-link'
import { RateConButton } from '@/components/ratecon-button'
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
  rcId: number | null
  hasPod: boolean
  hasBol: boolean
  invoiceDocId: number | null
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
const OPEN: PayGroup[] = ['problems', 'toSubmit', 'awaitingFunding', 'atRisk']
const BATCH: PayGroup[] = ['toSubmit', 'awaitingFunding', 'funded', 'atRisk']

const input =
  'w-full rounded-lg border border-white/10 bg-ink-900/80 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500 max-md:min-h-11'
const btn =
  'inline-flex min-h-9 items-center rounded-lg border border-white/15 px-3 text-[12px] font-semibold text-white/85 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50 max-md:min-h-11'
const primary =
  'inline-flex min-h-9 items-center rounded-lg bg-haul-500 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-haul-400 disabled:opacity-50 max-md:min-h-11'

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s)

export function PaymentsBoard({
  rows,
  settings,
  today,
  initialQuery = '',
}: {
  rows: PayRow[]
  settings: FactoringSettings
  today: string
  /** Пришли по ссылке с груза (lib/payments.ts financesHref) — сразу найден и раскрыт. */
  initialQuery?: string
}) {
  const locale = useLocale()
  const [pending, start] = useTransition()
  const [query, setQuery] = useState(initialQuery)
  const [broker, setBroker] = useState('')
  const [truck, setTruck] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [form, setForm] = useState<Form | null>(null)
  const [editSettings, setEditSettings] = useState(false)
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

  return (
    <div className="flex flex-col gap-3">
      {/* Факторинг и его условия — одна строка, правится на месте. */}
      <div className="panel flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5 text-[12.5px] text-white/70">
        {!editSettings ? (
          <>
            <span>
              <b className="text-white/90">{factor}</b> ·{' '}
              {settings.recourse
                ? fill(t(locale, 'payments.settings.recourseOn'), { n: settings.recourseDays })
                : t(locale, 'payments.settings.recourseOff')}{' '}
              · {t(locale, 'payments.settings.fee')}
            </span>
            <button type="button" onClick={() => setEditSettings(true)} className="text-haul-400 hover:underline max-md:min-h-9">
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

      {/* Поиск и фильтры — для всех групп сразу; CSV выгружает то, что видно. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(locale, 'payments.filter.search')}
          className={`${input} min-w-0 flex-1 sm:max-w-xs`}
        />
        <select value={broker} onChange={(e) => setBroker(e.target.value)} className={`${input} w-auto`}>
          <option value="">{t(locale, 'payments.filter.allBrokers')}</option>
          {brokers.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select value={truck} onChange={(e) => setTruck(e.target.value)} className={`${input} w-auto`}>
          <option value="">{t(locale, 'payments.filter.allTrucks')}</option>
          {trucks.map((tr) => (
            <option key={tr} value={tr}>
              {tr}
            </option>
          ))}
        </select>
        <button type="button" onClick={exportCsv} className={`${btn} ml-auto gap-1.5`}>
          <Download size={13} strokeWidth={2.5} />
          CSV
        </button>
      </div>

      {/* Выбранные грузы — одним действием: брокер или факторинг проводит их пакетом. */}
      {selRows.length > 0 && (
        <div className="sticky top-2 z-10 rounded-xl border border-haul-500/40 bg-ink-900/95 px-3.5 py-2.5 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
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
            <button type="button" className="text-white/55 hover:text-white max-md:min-h-9" onClick={() => setSelected(new Set())}>
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
        <p className="panel p-4 text-center text-[13px] text-white/55">
          {rows.length ? t(locale, 'payments.nothingFound') : t(locale, 'payments.empty')}
        </p>
      )}

      {PAY_GROUPS.map((g) => {
        const list = byGroup.get(g) ?? []
        if (!list.length) return null
        return (
          <Collapse
            key={g}
            title={fill(t(locale, GROUP_KEY[g]), { factor })}
            count={list.length}
            amount={usd.format(list.reduce((s, r) => s + r.rate, 0))}
            tone={GROUP_TONE[g]}
            defaultOpen={OPEN.includes(g) || !!initialQuery}
          >
            <div className="flex flex-col gap-2">
              {list.map((r) => (
                <div key={r.id} id={`pay-${r.id}`} className="panel scroll-mt-20 p-3.5">
                  <div className="flex items-start gap-3">
                    {BATCH.includes(g) && (
                      <input
                        type="checkbox"
                        aria-label={r.route}
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        className="mt-1 size-4 shrink-0 accent-haul-500 max-md:size-5"
                      />
                    )}
                    <Link href={`/loads/${r.id}`} className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium">{r.route}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-white/60">
                        {r.ref && <span className="nums">#{r.ref}</span>}
                        <span>{r.truck}</span>
                        {r.broker && <span>· {r.broker}</span>}
                      </div>
                      <StageLine row={r} group={g} settings={settings} today={today} locale={locale} />
                    </Link>
                    <span className="nums shrink-0 text-[15px] font-bold">{usd.format(r.rate)}</span>
                    {r.rcId && <RateConButton docId={r.rcId} compact />}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-2.5">
                    <RowActions row={r} group={g} factor={factor} locale={locale} pending={pending} setForm={setForm} run={run} />
                  </div>
                  {form && (('id' in form && form.id === r.id) || ('ids' in form && form.ids.length === 1 && form.ids[0] === r.id)) && (
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
              ))}
            </div>
          </Collapse>
        )
      })}
    </div>
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
    const missing = [!r.rcId ? 'RC' : null, !r.hasBol ? 'BOL' : null, !r.hasPod ? 'POD' : null].filter(Boolean)
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
    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[12px] text-white/65">
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
      className="text-[12px] text-white/45 transition-colors hover:text-bad-400 max-md:min-h-9"
      onClick={() => {
        if (window.confirm(fill(t(locale, 'payments.act.undoConfirm'), { route: r.route }))) run(() => undoPaymentStep(r.id))
      }}
    >
      {t(locale, 'payments.act.undo')}
    </button>
  )
  const note = r.payment && (
    <button type="button" className="text-[12px] text-white/45 hover:text-white/80 max-md:min-h-9" onClick={() => setForm({ kind: 'note', id: r.id })}>
      {t(locale, 'payments.act.note')}
    </button>
  )
  const packet = r.invoiceDocId ? (
    <DocLink docId={r.invoiceDocId} className={btn}>
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
          {!r.payment && <span className="text-[12px] text-white/40">{t(locale, 'payments.legacyHint')}</span>}
        </>
      )
    default:
      return <span className="text-[12px] text-white/40">{t(locale, 'payments.inWorkHint')}</span>
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
    <label className="flex flex-col gap-1 text-[11.5px] text-white/60">
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
          <label className="flex flex-col gap-1 text-[11.5px] text-white/60">
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
                  <span className="truncate pb-1.5 text-[12px] text-white/70 max-sm:col-span-2">
                    {r.route} · {usd.format(r.rate)}
                  </span>
                  <label className="flex flex-col gap-1 text-[11.5px] text-white/60">
                    {t(locale, 'payments.form.advance')}
                    <input inputMode="decimal" value={m.advance} onChange={(e) => setMoney({ ...money, [id]: { ...m, advance: e.target.value } })} className={input} />
                  </label>
                  <label className="flex flex-col gap-1 text-[11.5px] text-white/60">
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
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11.5px] text-white/60">
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
          <label className="flex flex-col gap-1 text-[11.5px] text-white/60">
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
          <label className="flex flex-col gap-1 text-[11.5px] text-white/60">
            {t(locale, 'payments.form.via')}
            <select value={via} onChange={(e) => setVia(e.target.value as PayVia)} className={input}>
              {PAY_VIA.map((v) => (
                <option key={v} value={v}>
                  {t(locale, `payments.via.${v}` as MsgKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11.5px] text-white/60">
            {t(locale, 'payments.form.amount')}
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-[11.5px] text-white/60">
            {t(locale, 'payments.form.paidRef')}
            <input value={ref} onChange={(e) => setRef(e.target.value)} className={input} />
          </label>
        </>
      )
      submit = () => run(() => markPaidDirect(form.id, { via, on, amount, ref }))
      break
    case 'note':
      body = (
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11.5px] text-white/60">
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
      <label className="flex flex-col gap-1 text-[11.5px] text-white/60">
        {t(locale, 'payments.settings.name')}
        <input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} className={input} />
      </label>
      <label className="flex items-center gap-2 pb-2 text-[12.5px] text-white/75">
        <input type="checkbox" checked={s.recourse} onChange={(e) => setS({ ...s, recourse: e.target.checked })} className="size-4 accent-haul-500" />
        {t(locale, 'payments.settings.recourse')}
      </label>
      {s.recourse && (
        <label className="flex flex-col gap-1 text-[11.5px] text-white/60">
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
