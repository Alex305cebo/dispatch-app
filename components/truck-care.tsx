'use client'

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

const KIND_LABEL = { repair: 'Ремонт', service: 'Обслуживание', inspection: 'Инспекция' } as const
const PRIO_LABEL = { low: 'не срочно', normal: 'обычный', urgent: 'СРОЧНО' } as const

export function TruckCare({
  truckId,
  meta,
  records,
  todos,
  currentOdometer,
  oil,
}: {
  truckId: number
  meta: TruckMeta | null
  records: MaintenanceRecord[]
  todos: TruckTodo[]
  currentOdometer: number | null
  oil: { milesLeft: number; tone: 'good' | 'warn' | 'bad' } | null
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
  const exp = expiries(meta)

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
   * generic uploader above, just titled after the record so it's identifiable in
   * the truck's Документы section and the general /docs library. */
  function attachReceipt(file: File | undefined, recordTitle: string) {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', 'repair')
    fd.append('truckId', String(truckId))
    fd.append('title', `${recordTitle} — чек`)
    start(async () => {
      const res = await uploadDocument(fd)
      if ('error' in res) notify('error', res.error)
      else {
        notify('ok', 'Документ добавлен')
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
            Замена масла
            <Info text="Счётчик пробега до следующей замены масла: интервал (по умолчанию 25 000 миль) плюс одометр последней замены, минус текущий одометр из ELD. Зелёный → жёлтый → красный по мере приближения. Запись «масло» в журнале с одометром сама сбрасывает счётчик." />
          </h2>
          <button
            onClick={() => setEditMeta((v) => !v)}
            className="text-[12px] text-haul-400 hover:underline"
          >
            {editMeta ? 'скрыть' : 'паспорт трака'}
          </button>
        </div>

        <div className="mt-2 text-[13px] leading-relaxed text-white/72">
          {oil ? (
            <>
              До замены —{' '}
              <span className={`nums text-[16px] font-bold ${oilTone[oil.tone]}`}>
                {oil.milesLeft.toLocaleString('en-US')} mi
              </span>
              {oil.tone === 'bad' && ' — пора менять!'}
            </>
          ) : meta?.oilLastOdometer ? (
            'Последняя замена записана. Остаток посчитается, когда придёт одометр с ELD.'
          ) : (
            'Укажи одометр последней замены в паспорте — и счётчик заработает.'
          )}
          {currentOdometer !== null && (
            <span className="text-white/45">
              {' '}
              · одометр сейчас: {Math.round(currentOdometer).toLocaleString('en-US')} mi
            </span>
          )}
        </div>

        {editMeta && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <TextField label="VIN" value={m.vin} onChange={(v) => setM({ ...m, vin: v })} />
            <TextField label="Номер (plate)" value={m.plate} onChange={(v) => setM({ ...m, plate: v })} />
            <TextField
              label="Номер трейлера"
              value={m.trailerNumber}
              onChange={(v) => setM({ ...m, trailerNumber: v })}
            />
            <Field
              label="Год"
              value={m.year ?? NaN}
              onChange={(n) => setM({ ...m, year: Number.isNaN(n) ? null : n })}
            />
            <TextField label="Марка" value={m.make} onChange={(v) => setM({ ...m, make: v })} placeholder="Freightliner" />
            <TextField label="Модель" value={m.model} onChange={(v) => setM({ ...m, model: v })} placeholder="Cascadia" />
            <TextField
              label="Телефон водителя"
              value={m.driverPhone}
              onChange={(v) => setM({ ...m, driverPhone: v })}
              placeholder="+1 ..."
            />
            <Field
              label="Интервал масла"
              value={m.oilIntervalMi}
              onChange={(n) => setM({ ...m, oilIntervalMi: n })}
              suffix="mi"
            />
            <Field
              label="Одометр последней замены"
              value={m.oilLastOdometer ?? NaN}
              onChange={(n) => setM({ ...m, oilLastOdometer: Number.isNaN(n) ? null : n })}
              suffix="mi"
            />
            <TextField label="Заметки" value={m.notes} onChange={(v) => setM({ ...m, notes: v })} />

            <DateInput label="Регистрация до" value={m.registrationExpiry} onChange={(v) => setM({ ...m, registrationExpiry: v })} />
            <DateInput label="Инспекция до" value={m.inspectionExpiry} onChange={(v) => setM({ ...m, inspectionExpiry: v })} />
            <DateInput label="Страховка до" value={m.insuranceExpiry} onChange={(v) => setM({ ...m, insuranceExpiry: v })} />
            <DateInput label="CDL водителя до" value={m.cdlExpiry} onChange={(v) => setM({ ...m, cdlExpiry: v })} />
            <DateInput label="Медкарта до" value={m.medcardExpiry} onChange={(v) => setM({ ...m, medcardExpiry: v })} />
            <div />

            <div className="sm:col-span-3">
              <button
                disabled={pending}
                onClick={() =>
                  run(() => saveTruckMeta(truckId, m), 'Паспорт трака сохранён', () => setEditMeta(false))
                }
                className="rounded-xl bg-haul-500 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-50"
              >
                Сохранить паспорт
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Compliance expiry dates */}
      {exp.length > 0 && (
        <section className="panel p-4">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            Сроки документов
            <Info text="Даты окончания регистрации, инспекции, страховки трака и CDL/медкарты водителя (вносятся в «паспорт трака»). Подсветка: красный ≤30 дней или просрочено, жёлтый ≤60. Самые срочные по всему парку дублируются на Обзоре." />
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
                    {e.daysLeft < 0 ? 'просрочено' : `${e.daysLeft} дн.`}
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
          Нужно починить
          <Info text="Список того, что на траке надо починить или заменить. Впиши, выбери срочность (срочное — красным) и жми +. Отмечай галочкой сделанное, ✕ — удалить. Количество открытых задач показано в шапке трака." />
        </h2>

        <div className="mt-3 flex gap-2">
          <input
            value={todoTitle}
            onChange={(e) => setTodoTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && todoTitle.trim())
                run(() => addTodo(truckId, todoTitle, todoPrio), 'Добавлено', () => setTodoTitle(''))
            }}
            placeholder="Что сломалось / что заменить…"
            className={input}
          />
          <select
            value={todoPrio}
            onChange={(e) => setTodoPrio(e.target.value as typeof todoPrio)}
            className="shrink-0 rounded-xl border border-white/8 bg-ink-900/80 px-2 text-[13px] text-white outline-none"
          >
            <option value="low">не срочно</option>
            <option value="normal">обычный</option>
            <option value="urgent">срочно</option>
          </select>
          <button
            disabled={pending || !todoTitle.trim()}
            onClick={() => run(() => addTodo(truckId, todoTitle, todoPrio), 'Добавлено', () => setTodoTitle(''))}
            className="shrink-0 rounded-xl bg-haul-500 px-4 text-[13px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
          >
            +
          </button>
        </div>

        {todos.length === 0 ? (
          <p className="mt-3 text-[13px] text-white/55">Список пуст — всё на ходу.</p>
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
                  action={(id, who, pin) => deleteTodo(id, truckId, who, pin)}
                  id={t.id}
                  title={t.title}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Maintenance log — same card as "Нужно починить": one ongoing story of
            what's broken and what's already been fixed on this truck. */}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/8 pt-4">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            Журнал ремонтов и обслуживания
            <Info text="История: что чинилось и обслуживалось, когда, за сколько и при каком пробеге. Тип «Обслуживание» + слово «масло» + одометр автоматически обновляет счётчик замены масла выше." />
          </h2>
          <button
            onClick={() => setShowMaint((v) => !v)}
            className="rounded-lg bg-haul-500 px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-haul-400"
          >
            {showMaint ? 'скрыть' : '+ Запись'}
          </button>
        </div>

        {/* Receipt/paperwork for a repair — lands in the truck's own Документы
            section AND the общий /docs library, same as any other document. */}
        <div className="mt-3">
          <DocUpload truckId={truckId} defaultKind="repair" />
        </div>

        {showMaint && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/65">
                Тип
              </span>
              <select
                value={mt.kind}
                onChange={(e) => setMt({ ...mt, kind: e.target.value as MaintenanceInput['kind'] })}
                className={input}
              >
                <option value="repair">Ремонт</option>
                <option value="service">Обслуживание (масло, фильтры…)</option>
                <option value="inspection">Инспекция</option>
              </select>
            </label>
            <TextField
              label="Что делали"
              value={mt.title}
              onChange={(v) => setMt({ ...mt, title: v })}
              placeholder="Замена масла / тормозные колодки…"
            />
            <Field
              label="Стоимость"
              value={mt.cost ?? NaN}
              onChange={(n) => setMt({ ...mt, cost: Number.isNaN(n) ? null : n })}
              prefix="$"
            />
            <Field
              label="Одометр"
              value={mt.odometer ?? NaN}
              onChange={(n) => setMt({ ...mt, odometer: Number.isNaN(n) ? null : n })}
              suffix="mi"
            />
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/65">
                Дата
              </span>
              <input
                type="date"
                value={mt.doneAt}
                onChange={(e) => setMt({ ...mt, doneAt: e.target.value })}
                className={input}
              />
            </label>
            <TextField label="Заметки" value={mt.notes} onChange={(v) => setMt({ ...mt, notes: v })} />
            <div className="sm:col-span-2">
              <button
                disabled={pending || !mt.title.trim()}
                onClick={() =>
                  run(() => addMaintenance(truckId, mt), 'Запись добавлена', () => {
                    setShowMaint(false)
                    setMt({ ...mt, title: '', notes: '', cost: null })
                  })
                }
                className="rounded-xl bg-haul-500 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
              >
                Сохранить запись
              </button>
              <span className="ml-3 text-[12px] text-white/45">
                Запись «масло» с одометром сама сбросит счётчик замены.
              </span>
            </div>
          </div>
        )}

        {records.length === 0 ? (
          <p className="mt-3 text-[13px] text-white/55">Записей пока нет.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {records.map((r) => (
              <li key={r.id} className="rounded-lg border border-white/6 px-3 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] text-white/85">{r.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="nums text-[13px] text-white/70">
                      {r.cost !== null ? usd.format(r.cost) : ''}
                    </span>
                    <label
                      title="Прикрепить документ"
                      className={`flex size-6 cursor-pointer items-center justify-center rounded-md bg-white/8 text-[13px] text-white/70 transition-colors hover:bg-white/16 hover:text-haul-400 ${pending ? 'opacity-40' : ''}`}
                    >
                      📎
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        className="hidden"
                        disabled={pending}
                        onChange={(e) => {
                          attachReceipt(e.target.files?.[0], r.title)
                          e.target.value = ''
                        }}
                      />
                    </label>
                    <DeleteButton
                      action={(id, who, pin) => deleteMaintenance(id, truckId, who, pin)}
                      id={r.id}
                      title={r.title}
                    />
                  </span>
                </div>
                <div className="mt-0.5 text-[12px] text-white/50">
                  {KIND_LABEL[r.kind]} · {r.doneAt}
                  {r.odometer !== null && ` · ${Math.round(r.odometer).toLocaleString('en-US')} mi`}
                  {r.notes && ` · ${r.notes}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
