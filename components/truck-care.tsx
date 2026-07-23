'use client'

import { Button } from '@/components/button'
// The care tab of a truck: oil countdown + passport, the to-fix list, and the
// maintenance log. All writes go through server actions; lists arrive from the
// server page and refresh via revalidatePath.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addMaintenance,
  addTodo,
  deleteMaintenance,
  deleteTodo,
  saveTruckMeta,
  toggleTodo,
  uploadDocument,
  type MaintenanceInput,
  type TruckMetaInput,
} from '@/app/actions'
import { expiries, type MaintenanceRecord, type TruckMeta, type TruckTodo } from '@/lib/maintenance-core'
import { Field, TextField } from '@/components/ui'
import { DocUpload } from '@/components/docs'
import { DeleteButton } from '@/components/delete-button'
import { Info } from '@/components/info'
import { notify } from '@/lib/notify'
import { usd } from '@/lib/fmt'
import { t, type Locale } from '@/lib/i18n'

const input =
  'w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-[15px] text-white outline-none transition-all placeholder:text-white/45 hover:border-white/15 focus:border-haul-500 focus:ring-4 focus:ring-haul-500/15'

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/65">
        {label}
      </span>
      <input
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className={input}
      />
    </label>
  )
}

const kindLabel = (locale: Locale) => ({
  repair: t(locale, 'trucks.care.kindRepair'),
  service: t(locale, 'trucks.care.kindService'),
  inspection: t(locale, 'trucks.care.kindInspection'),
})
const prioLabel = (locale: Locale) => ({
  low: t(locale, 'trucks.care.prioLow'),
  normal: t(locale, 'trucks.care.prioNormal'),
  urgent: t(locale, 'trucks.care.prioUrgent'),
})

export function TruckCare({
  truckId,
  meta,
  records,
  todos,
  currentOdometer,
  oil,
  docs,
  locale = 'en',
}: {
  truckId: number
  meta: TruckMeta | null
  records: MaintenanceRecord[]
  todos: TruckTodo[]
  currentOdometer: number | null
  oil: { milesLeft: number; tone: 'good' | 'warn' | 'bad' } | null
  /** This truck's documents (already fetched for the Documents section) — reused
   * here to find each repair's own attached receipt, keyed by maintenance_id. */
  docs: { id: number; maintenanceId: number | null }[]
  locale?: Locale
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  /* ---- oil + passport ---- */
  const [editMeta, setEditMeta] = useState(false)
  const [m, setM] = useState<TruckMetaInput>({
    vin: meta?.vin ?? '',
    plate: meta?.plate ?? '',
    trailerNumber: meta?.trailerNumber ?? '',
    year: meta?.year ?? null,
    make: meta?.make ?? '',
    model: meta?.model ?? '',
    oilIntervalMi: meta?.oilIntervalMi ?? 25000,
    oilLastOdometer: meta?.oilLastOdometer ?? null,
    driverPhone: meta?.driverPhone ?? '',
    notes: meta?.notes ?? '',
    registrationExpiry: meta?.registrationExpiry ?? null,
    inspectionExpiry: meta?.inspectionExpiry ?? null,
    insuranceExpiry: meta?.insuranceExpiry ?? null,
    cdlExpiry: meta?.cdlExpiry ?? null,
    medcardExpiry: meta?.medcardExpiry ?? null,
  })
  const exp = expiries(meta, locale)
  const KIND_LABEL = kindLabel(locale)
  const PRIO_LABEL = prioLabel(locale)

  /* ---- quick todo ---- */
  const [todoTitle, setTodoTitle] = useState('')
  const [todoPrio, setTodoPrio] = useState<'low' | 'normal' | 'urgent'>('normal')

  /* ---- maintenance form ---- */
  const [showMaint, setShowMaint] = useState(false)
  const [mt, setMt] = useState<MaintenanceInput>({
    kind: 'repair',
    title: '',
    notes: '',
    cost: null,
    odometer: currentOdometer ? Math.round(currentOdometer) : null,
    doneAt: new Date().toISOString().slice(0, 10),
  })

  const run = (fn: () => Promise<{ error: string } | void>, ok: string, after?: () => void) =>
    start(async () => {
      const res = await fn()
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', ok)
        after?.()
        router.refresh()
      }
    })

  /** Attach a document to one specific repair row — same documents pipeline as the
   * generic uploader above, linked back to this exact record (maintenanceId) so the
   * row can open its own receipt instead of just filing it under the truck. */
  function attachReceipt(file: File | undefined, recordTitle: string, maintenanceId: number) {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', 'repair')
    fd.append('truckId', String(truckId))
    fd.append('maintenanceId', String(maintenanceId))
    fd.append('title', `${recordTitle}${t(locale, 'trucks.care.receiptSuffix')}`)
    start(async () => {
      const res = await uploadDocument(fd)
      if ('error' in res) notify('error', res.error)
      else {
        notify('ok', t(locale, 'trucks.care.docAdded'))
        router.refresh()
      }
    })
  }

  const oilTone = { good: 'text-good-400', warn: 'text-warn-400', bad: 'text-bad-400' }

  return (
    <div className="flex flex-col gap-4">
      {/* Oil + passport */}
      <section className="panel p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            {t(locale, 'trucks.care.oilHeading')}
            <Info text={t(locale, 'trucks.care.oilInfo')} />
          </h2>
          <button
            onClick={() => setEditMeta((v) => !v)}
            className="text-[12px] text-haul-400 hover:underline"
          >
            {editMeta ? t(locale, 'trucks.care.hide') : t(locale, 'trucks.care.passport')}
          </button>
        </div>

        <div className="mt-2 text-[13px] leading-relaxed text-white/72">
          {oil ? (
            <>
              {t(locale, 'trucks.care.untilChange')}{' '}
              <span className={`nums text-[16px] font-bold ${oilTone[oil.tone]}`}>
                {oil.milesLeft.toLocaleString('en-US')} mi
              </span>
              {oil.tone === 'bad' && t(locale, 'trucks.care.timeToChange')}
            </>
          ) : meta?.oilLastOdometer ? (
            t(locale, 'trucks.care.lastChangeRecorded')
          ) : (
            t(locale, 'trucks.care.needOdometer')
          )}
          {currentOdometer !== null && (
            <span className="text-white/45">
              {t(locale, 'trucks.care.odometerNow')}{Math.round(currentOdometer).toLocaleString('en-US')} mi
            </span>
          )}
        </div>

        {editMeta && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <TextField label="VIN" value={m.vin} onChange={(v) => setM({ ...m, vin: v })} />
            <TextField label={t(locale, 'trucks.care.plateLabel')} value={m.plate} onChange={(v) => setM({ ...m, plate: v })} />
            <TextField
              label={t(locale, 'trucks.care.trailerNumberLabel')}
              value={m.trailerNumber}
              onChange={(v) => setM({ ...m, trailerNumber: v })}
            />
            <Field
              label={t(locale, 'trucks.care.yearLabel')}
              value={m.year ?? NaN}
              onChange={(n) => setM({ ...m, year: Number.isNaN(n) ? null : n })}
            />
            <TextField label={t(locale, 'trucks.care.makeLabel')} value={m.make} onChange={(v) => setM({ ...m, make: v })} placeholder="Freightliner" />
            <TextField label={t(locale, 'trucks.care.modelLabel')} value={m.model} onChange={(v) => setM({ ...m, model: v })} placeholder="Cascadia" />
            <TextField
              label={t(locale, 'trucks.care.driverPhoneLabel')}
              value={m.driverPhone}
              onChange={(v) => setM({ ...m, driverPhone: v })}
              placeholder="+1 ..."
            />
            <Field
              label={t(locale, 'trucks.care.oilIntervalLabel')}
              value={m.oilIntervalMi}
              onChange={(n) => setM({ ...m, oilIntervalMi: n })}
              suffix="mi"
            />
            <Field
              label={t(locale, 'trucks.care.oilLastOdometerLabel')}
              value={m.oilLastOdometer ?? NaN}
              onChange={(n) => setM({ ...m, oilLastOdometer: Number.isNaN(n) ? null : n })}
              suffix="mi"
            />
            <TextField label={t(locale, 'trucks.care.notesLabel')} value={m.notes} onChange={(v) => setM({ ...m, notes: v })} />

            <DateInput label={t(locale, 'trucks.care.registrationLabel')} value={m.registrationExpiry} onChange={(v) => setM({ ...m, registrationExpiry: v })} />
            <DateInput label={t(locale, 'trucks.care.inspectionLabel')} value={m.inspectionExpiry} onChange={(v) => setM({ ...m, inspectionExpiry: v })} />
            <DateInput label={t(locale, 'trucks.care.insuranceLabel')} value={m.insuranceExpiry} onChange={(v) => setM({ ...m, insuranceExpiry: v })} />
            <DateInput label={t(locale, 'trucks.care.cdlLabel')} value={m.cdlExpiry} onChange={(v) => setM({ ...m, cdlExpiry: v })} />
            <DateInput label={t(locale, 'trucks.care.medcardLabel')} value={m.medcardExpiry} onChange={(v) => setM({ ...m, medcardExpiry: v })} />
            <div />

            <div className="sm:col-span-3">
              <Button variant="primary" disabled={pending}
                onClick={() =>
                  run(() => saveTruckMeta(truckId, m), t(locale, 'trucks.care.passportSaved'), () => setEditMeta(false))
                }>
                {t(locale, 'trucks.care.savePassport')}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Compliance expiry dates */}
      {exp.length > 0 && (
        <section className="panel p-4">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            {t(locale, 'trucks.care.expiryHeading')}
            <Info text={t(locale, 'trucks.care.expiryInfo')} />
          </h2>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {exp.map((e) => (
              <li
                key={e.label}
                className="flex items-center justify-between rounded-lg border border-white/6 px-3 py-2"
              >
                <span className="text-[13px] text-white/80">{e.label}</span>
                <span className="flex items-center gap-2">
                  <span className="nums text-[12px] text-white/50">{e.date}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      e.tone === 'bad'
                        ? 'bg-bad-500/15 text-bad-400'
                        : e.tone === 'warn'
                          ? 'bg-warn-400/15 text-warn-400'
                          : 'bg-good-500/15 text-good-400'
                    }`}
                  >
                    {e.daysLeft < 0 ? t(locale, 'trucks.common.overdue') : `${e.daysLeft} ${t(locale, 'trucks.common.daysSuffix')}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* To-fix list + maintenance log — one card: what's still broken, and what's
          already been fixed, are the same ongoing story for this truck. */}
      <section className="panel p-4">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'trucks.care.todoHeading')}
          <Info text={t(locale, 'trucks.care.todoInfo')} />
        </h2>

        <div className="mt-3 flex gap-2">
          <input
            value={todoTitle}
            onChange={(e) => setTodoTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && todoTitle.trim())
                run(() => addTodo(truckId, todoTitle, todoPrio), t(locale, 'trucks.care.addedTodo'), () => setTodoTitle(''))
            }}
            placeholder={t(locale, 'trucks.care.todoPlaceholder')}
            className={input}
          />
          <select
            value={todoPrio}
            onChange={(e) => setTodoPrio(e.target.value as typeof todoPrio)}
            className="shrink-0 rounded-xl border border-white/8 bg-ink-900/80 px-2 text-[13px] text-white outline-none"
          >
            <option value="low">{t(locale, 'trucks.care.prioLow')}</option>
            <option value="normal">{t(locale, 'trucks.care.prioNormal')}</option>
            <option value="urgent">{t(locale, 'trucks.care.prioUrgentOption')}</option>
          </select>
          <Button variant="primary" className="shrink-0" disabled={pending || !todoTitle.trim()}
            onClick={() => run(() => addTodo(truckId, todoTitle, todoPrio), t(locale, 'trucks.care.addedTodo'), () => setTodoTitle(''))}>
            +
          </Button>
        </div>

        {todos.length === 0 ? (
          <p className="mt-3 text-[13px] text-white/55">{t(locale, 'trucks.care.todoEmpty')}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {todos.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-lg border border-white/6 px-3 py-2">
                <input
                  type="checkbox"
                  checked={!!t.doneAt}
                  onChange={() => start(async () => { await toggleTodo(t.id, truckId); router.refresh() })}
                  className="size-4 shrink-0 accent-good-500"
                />
                <span
                  className={`flex-1 text-[14px] ${t.doneAt ? 'text-white/40 line-through' : 'text-white/85'}`}
                >
                  {t.title}
                </span>
                {!t.doneAt && t.priority !== 'normal' && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      t.priority === 'urgent' ? 'bg-bad-500/15 text-bad-400' : 'bg-white/8 text-white/55'
                    }`}
                  >
                    {PRIO_LABEL[t.priority]}
                  </span>
                )}
                <DeleteButton
                  action={(id, password) => deleteTodo(id, truckId, password)}
                  id={t.id}
                  title={t.title}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Maintenance log — same card as "Needs fixing": one ongoing story of
            what's broken and what's already been fixed on this truck. */}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/8 pt-4">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            {t(locale, 'trucks.care.logHeading')}
            <Info text={t(locale, 'trucks.care.logInfo')} />
          </h2>
          <Button variant="primary" size="sm" onClick={() => setShowMaint((v) => !v)}>
            {showMaint ? t(locale, 'trucks.care.hide') : t(locale, 'trucks.care.addRecord')}
          </Button>
        </div>

        {/* Receipt/paperwork for a repair — lands in the truck's own Documents
            section AND the shared /docs library, same as any other document. */}
        <div className="mt-3">
          <DocUpload truckId={truckId} defaultKind="repair" />
        </div>

        {showMaint && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/65">
                {t(locale, 'trucks.care.typeLabel')}
              </span>
              <select
                value={mt.kind}
                onChange={(e) => setMt({ ...mt, kind: e.target.value as MaintenanceInput['kind'] })}
                className={input}
              >
                <option value="repair">{t(locale, 'trucks.care.kindRepair')}</option>
                <option value="service">{t(locale, 'trucks.care.kindServiceOption')}</option>
                <option value="inspection">{t(locale, 'trucks.care.kindInspection')}</option>
              </select>
            </label>
            <TextField
              label={t(locale, 'trucks.care.whatDoneLabel')}
              value={mt.title}
              onChange={(v) => setMt({ ...mt, title: v })}
              placeholder={t(locale, 'trucks.care.whatDonePlaceholder')}
            />
            <Field
              label={t(locale, 'trucks.care.costLabel')}
              value={mt.cost ?? NaN}
              onChange={(n) => setMt({ ...mt, cost: Number.isNaN(n) ? null : n })}
              prefix="$"
            />
            <Field
              label={t(locale, 'trucks.care.odometerLabel')}
              value={mt.odometer ?? NaN}
              onChange={(n) => setMt({ ...mt, odometer: Number.isNaN(n) ? null : n })}
              suffix="mi"
            />
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/65">
                {t(locale, 'trucks.care.dateLabel')}
              </span>
              <input
                type="date"
                value={mt.doneAt}
                onChange={(e) => setMt({ ...mt, doneAt: e.target.value })}
                className={input}
              />
            </label>
            <TextField label={t(locale, 'trucks.care.notesLabel')} value={mt.notes} onChange={(v) => setMt({ ...mt, notes: v })} />
            <div className="sm:col-span-2">
              <Button variant="primary" disabled={pending || !mt.title.trim()}
                onClick={() =>
                  run(() => addMaintenance(truckId, mt), t(locale, 'trucks.care.recordAdded'), () => {
                    setShowMaint(false)
                    setMt({ ...mt, title: '', notes: '', cost: null })
                  })
                }>
                {t(locale, 'trucks.care.saveRecord')}
              </Button>
              <span className="ml-3 text-[12px] text-white/45">
                {t(locale, 'trucks.care.oilResetHint')}
              </span>
            </div>
          </div>
        )}

        {records.length === 0 ? (
          <p className="mt-3 text-[13px] text-white/55">{t(locale, 'trucks.care.recordsEmpty')}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {records.map((r) => {
              // Most recently attached receipt for THIS record, if any — real link
              // via maintenance_id, not a fuzzy title match.
              const receipt = docs.filter((d) => d.maintenanceId === r.id).at(-1)
              return (
                <li key={r.id} className="rounded-lg border border-white/6 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    {receipt ? (
                      <a
                        href={`/view/${receipt.id}`}
                        target="_blank"
                        rel="noreferrer"
                        title={t(locale, 'trucks.care.openReceipt')}
                        className="text-[14px] text-white/85 hover:text-haul-400 hover:underline"
                      >
                        {r.title}
                      </a>
                    ) : (
                      <span className="text-[14px] text-white/85">{r.title}</span>
                    )}
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="nums text-[13px] text-white/70">
                        {r.cost !== null ? usd.format(r.cost) : ''}
                      </span>
                      <label
                        title={t(locale, 'trucks.care.attachDoc')}
                        className={`flex size-6 cursor-pointer items-center justify-center rounded-md bg-white/8 text-[13px] text-white/70 transition-colors hover:bg-white/16 hover:text-haul-400 ${pending ? 'opacity-40' : ''}`}
                      >
                        📎
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          className="hidden"
                          disabled={pending}
                          onChange={(e) => {
                            attachReceipt(e.target.files?.[0], r.title, r.id)
                            e.target.value = ''
                          }}
                        />
                      </label>
                      <DeleteButton
                        action={(id, password) => deleteMaintenance(id, truckId, password)}
                        id={r.id}
                        title={r.title}
                      />
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-white/50">
                    {KIND_LABEL[r.kind]} · {r.doneAt}
                    {r.odometer !== null && ` · ${Math.round(r.odometer).toLocaleString('en-US')} mi`}
                    {r.notes && ` · ${r.notes}`}
                    {receipt && (
                      <>
                        {' · '}
                        <a href={`/view/${receipt.id}`} target="_blank" rel="noreferrer" className="text-haul-400 hover:underline">
                          📄 {t(locale, 'trucks.care.receiptLink')}
                        </a>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
