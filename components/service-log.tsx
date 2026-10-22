'use client'

// Журнал обслуживания — одна таблица на раздел «Гараж» (весь парк) и на вкладку
// «Обслуживание» трака (один трак). Каждая работа — строка: дата и время, трак, тип,
// что сделано, где, пробег при работе, сумма, чеки. Запись заводится и правится одним
// окном, в нём же сразу прикрепляются чеки (раньше — только после сохранения, мелкой
// скрепкой у строки, и время с местом записать было негде).

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Paperclip, Pencil, Plus, ScanText, Sparkles } from 'lucide-react'
import { addMaintenance, deleteMaintenance, linkDocToMaintenance, updateMaintenance, type MaintenanceInput } from '@/app/actions'
import { byNewest, serviceKind, SERVICE_KINDS, type MaintenanceRecord, type ServiceKind } from '@/lib/maintenance-core'
import { sendDocument } from '@/lib/send-document'
import { autoRecordFromDoc, readServiceDoc, scanStoredDoc } from '@/app/garage/actions'
import { bytesToBase64, readUploadFile } from '@/lib/upload-name'
import { titleHints } from '@/lib/service-scan-core'
import { Button } from '@/components/button'
import { DocLink } from '@/components/doc-link'
import { DeleteButton } from '@/components/delete-button'
import { Info } from '@/components/info'
import { Field, TextField } from '@/components/ui'
import { notify } from '@/lib/notify'
import { usd, usDate } from '@/lib/fmt'
import { t, type Locale } from '@/lib/i18n'

export type LogDoc = { id: number; maintenanceId: number; title: string }
export type LooseDoc = { id: number; truckId: number; kind: string; title: string; uploadedAt: string }
export type LogTruck = { id: number; label: string; odometer: number | null }

/** Событие «открыть окно новой записи» — кнопка в шапке раздела стоит отдельно от журнала.
 * detail: тип по умолчанию и файлы, которые надо сразу распознать. */
export const ADD_EVENT = 'garage:add'
type AddDetail = { preset?: ServiceKind; scan?: File[] }

export const KIND_CHIP: Record<ServiceKind, string> = {
  oil: 'bg-haul-500/15 text-haul-300',
  repair: 'bg-bad-500/12 text-bad-400',
  service: 'bg-white/8 text-t2',
  inspection: 'bg-good-500/12 text-good-400',
}

const input =
  'w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-lg text-white outline-none transition-all placeholder:text-t3 hover:border-white/15 focus:border-haul-500 focus:ring-4 focus:ring-haul-500/15'

const etParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
/** Сейчас по ET: { day: 'yyyy-mm-dd', time: 'ЧЧ:ММ' } — значения по умолчанию в окне. */
function nowEt() {
  const p = Object.fromEntries(etParts.formatToParts(new Date()).map((x) => [x.type, x.value]))
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

const mi = (n: number) => `${Math.round(n).toLocaleString('en-US')} mi`

/** Окно записи журнала: новая или правка старой. ✕ и Escape закрывают. */
export function ServiceEntryModal({
  trucks,
  truckId,
  record,
  preset,
  scan,
  scanDocId,
  onClose,
  locale,
}: {
  trucks: LogTruck[]
  truckId: number | null
  record?: MaintenanceRecord | null
  preset?: ServiceKind
  /** Файлы чека: окно открывается сразу, ИИ читает их и заполняет поля; файлы
   * прикрепятся к записи при сохранении. */
  scan?: File[]
  /** Бумага уже в базе («Бумаги без записи»): ИИ читает её, при сохранении она встаёт к записи. */
  scanDocId?: number
  onClose: () => void
  locale: Locale
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const now = useMemo(nowEt, [])
  const [truck, setTruck] = useState<number | null>(record?.truckId ?? truckId ?? trucks[0]?.id ?? null)
  const odoOf = (id: number | null) => trucks.find((x) => x.id === id)?.odometer ?? null
  const startKind: ServiceKind = record ? serviceKind(record) : (preset ?? 'repair')
  const [m, setM] = useState<MaintenanceInput>(() => ({
    kind: startKind,
    title: record?.title ?? (startKind === 'oil' ? t(locale, 'trucks.care.oilChangeTitle') : ''),
    notes: record?.notes ?? '',
    cost: record?.cost ?? null,
    odometer: record ? record.odometer : (() => { const o = odoOf(truck); return o == null ? null : Math.round(o) })(),
    doneAt: record?.doneAt ?? now.day,
    doneTime: record ? record.doneTime : now.time,
    shop: record?.shop ?? '',
  }))
  const [files, setFiles] = useState<File[]>(scan ?? [])
  const [reading, setReading] = useState(!!scan?.length || scanDocId != null)

  // Распознавание — один раз при открытии. Заполняет только то, что нашлось на бумаге:
  // пустое не затирает подставленное (дата сегодня, пробег с ELD).
  useEffect(() => {
    if (!scan?.length && scanDocId == null) return
    let alive = true
    void (async () => {
      const fail = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })
      let res: Awaited<ReturnType<typeof readServiceDoc>>
      if (scanDocId != null) {
        const stored = await scanStoredDoc(scanDocId).catch(fail)
        // Без ИИ — подсказки из имени бумаги всё равно подставляются, ошибку показываем.
        if (!('error' in stored) && stored.aiError) notify('error', stored.aiError)
        res = stored
      } else {
        const ready = (await Promise.all(scan!.map(readUploadFile))).filter((f): f is File => !!f)
        const payload = await Promise.all(ready.map(async (f) => ({ b64: bytesToBase64(await f.arrayBuffer()), mime: f.type || 'application/octet-stream' })))
        res = await readServiceDoc(payload).catch(fail)
      }
      if (!alive) return
      setReading(false)
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      const f = res.input
      if (res.truckId != null && trucks.some((x) => x.id === res.truckId)) setTruck(res.truckId)
      setM((cur) => ({
        ...cur,
        kind: f.kind,
        title: f.title || (f.kind === 'oil' ? t(locale, 'trucks.care.oilChangeTitle') : cur.title),
        notes: f.notes || cur.notes,
        cost: f.cost ?? cur.cost,
        odometer: f.odometer ?? cur.odometer,
        doneAt: f.doneAt ?? cur.doneAt,
        doneTime: f.doneTime ?? (f.doneAt ? null : cur.doneTime),
        shop: f.shop || cur.shop,
      }))
      notify('ok', t(locale, 'service.scanDone'))
    })()
    return () => {
      alive = false
    }
    // Только при открытии окна.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const pickKind = (k: ServiceKind) => {
    const oilTitle = t(locale, 'trucks.care.oilChangeTitle')
    // Название «Замена масла» подставляется и убирается вместе с типом — своё не трогаем.
    const title = k === 'oil' && !m.title.trim() ? oilTitle : k !== 'oil' && m.title === oilTitle ? '' : m.title
    setM({ ...m, kind: k, title })
  }

  const save = () =>
    start(async () => {
      if (truck == null) return
      const res = record ? await updateMaintenance(record.id, truck, m) : await addMaintenance(truck, m)
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      for (const f of files) {
        const up = await sendDocument(
          f,
          { kind: 'repair', truckId: truck, maintenanceId: res.id, title: `${m.title.trim()} · ${t(locale, 'service.receipt')}` },
          locale,
        )
        if ('error' in up) notify('error', `${f.name}: ${up.error}`)
      }
      if (scanDocId != null) {
        const linked = await linkDocToMaintenance(scanDocId, res.id)
        if (linked?.error) notify('error', linked.error)
      }
      notify('ok', t(locale, 'service.saved'))
      router.refresh()
      onClose()
    })

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(locale, record ? 'service.editTitle' : 'service.newTitle')}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="panel flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-auto p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold leading-6 text-t1">
            {t(locale, record ? 'service.editTitle' : 'service.newTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'common.close')}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-lg text-t3 transition-colors hover:bg-white/10 hover:text-t1"
          >
            ✕
          </button>
        </div>

        {reading && (
          <div className="flex items-center gap-2 rounded-xl bg-haul-500/10 px-3 py-2.5 text-base font-medium text-haul-300">
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {t(locale, 'service.scanReading')}
          </div>
        )}

        {/* Тип — кнопками, не списком: четыре варианта видны сразу. */}
        <div className="flex flex-wrap gap-1.5">
          {SERVICE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => pickKind(k)}
              className={`rounded-xl border px-3 py-2 text-base font-semibold transition-colors max-md:min-h-11 ${
                m.kind === k ? `border-transparent ${KIND_CHIP[k]} ring-2 ring-haul-400/50` : 'border-white/10 text-t2 hover:text-t1'
              }`}
            >
              {t(locale, `service.kind.${k}`)}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {trucks.length > 1 && !record && (
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-t2">{t(locale, 'service.colTruck')}</span>
              <select
                value={truck ?? ''}
                onChange={(e) => {
                  const id = Number(e.target.value)
                  setTruck(id)
                  const o = odoOf(id)
                  setM({ ...m, odometer: o == null ? null : Math.round(o) })
                }}
                className={input}
              >
                {trucks.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="sm:col-span-2">
            <TextField
              label={t(locale, 'service.colWhat')}
              value={m.title}
              onChange={(v) => setM({ ...m, title: v })}
              placeholder={t(locale, 'trucks.care.whatDonePlaceholder')}
            />
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-t2">{t(locale, 'service.colDate')}</span>
            <input type="date" value={m.doneAt} onChange={(e) => setM({ ...m, doneAt: e.target.value })} className={input} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-t2">{t(locale, 'service.fTime')}</span>
            <input
              type="time"
              value={m.doneTime ?? ''}
              onChange={(e) => setM({ ...m, doneTime: e.target.value || null })}
              className={input}
            />
          </label>
          <div className="sm:col-span-2">
            <TextField
              label={t(locale, 'service.fShop')}
              value={m.shop ?? ''}
              onChange={(v) => setM({ ...m, shop: v })}
              placeholder="Love's Truck Care, Dallas TX"
            />
          </div>
          <Field
            label={t(locale, 'service.fOdo')}
            value={m.odometer ?? NaN}
            onChange={(n) => setM({ ...m, odometer: Number.isNaN(n) ? null : n })}
            suffix="mi"
          />
          <Field
            label={t(locale, 'service.colCost')}
            value={m.cost ?? NaN}
            onChange={(n) => setM({ ...m, cost: Number.isNaN(n) ? null : n })}
            prefix="$"
          />
          <div className="sm:col-span-2">
            <TextField label={t(locale, 'trucks.care.notesLabel')} value={m.notes} onChange={(v) => setM({ ...m, notes: v })} />
          </div>
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-t2">{t(locale, 'service.fFiles')}</span>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-3 text-base font-semibold text-t2 transition-colors hover:border-haul-400 hover:text-t1">
              <Paperclip size={16} className="text-haul-300" />
              {t(locale, 'service.pickFiles')}
              <input
                type="file"
                multiple
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? [])
                  setFiles((f) => [...f, ...picked])
                  e.target.value = ''
                }}
              />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-1 text-sm text-t2">
                    📄 <span className="max-w-48 truncate">{f.name}</span>
                    <button
                      type="button"
                      aria-label={t(locale, 'common.close')}
                      onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}
                      className="text-t3 hover:text-bad-400"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={pending || reading || truck == null || !m.title.trim()} onClick={save}>
            {t(locale, 'service.save')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t(locale, 'trucks.care.oilCancel')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Расходы по месяцам столбиками: видно, в какой месяц трак «съел» деньги. */
export function CostBars({ months, locale }: { months: { month: string; total: number }[]; locale: Locale }) {
  const max = Math.max(1, ...months.map((x) => x.total))
  const sum = months.reduce((a, x) => a + x.total, 0)
  return (
    <section className="panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-t1">{t(locale, 'service.costChart')}</h2>
        <span className="nums text-base font-semibold text-t1">{usd.format(sum)}</span>
      </div>
      <div className="mt-3 flex h-28 items-end gap-1">
        {months.map((x) => (
          <div key={x.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${x.month}: ${usd.format(x.total)}`}>
            <div
              className={`garage-bar w-full rounded-t-md ${x.total ? 'bg-haul-400/80' : 'bg-white/[0.06]'}`}
              style={{ height: `${x.total ? Math.max(6, Math.round((x.total / max) * 100)) : 4}%` }}
            />
            <span className="nums text-2xs text-t3">{x.month.slice(5)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function ServiceLog({
  records,
  docs,
  trucks,
  fixedTruckId = null,
  initialTruck = null,
  looseDocs = [],
  locale,
}: {
  records: MaintenanceRecord[]
  docs: LogDoc[]
  /** Бумаги трака без записи журнала — показываются над журналом, привязываются выбором. */
  looseDocs?: LooseDoc[]
  trucks: LogTruck[]
  /** Журнал одного трака (вкладка трака): без колонки «Трак» и выбора трака. */
  fixedTruckId?: number | null
  initialTruck?: number | null
  locale: Locale
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [kind, setKind] = useState<ServiceKind | 'all'>('all')
  const [truck, setTruck] = useState<number | null>(fixedTruckId ?? initialTruck)
  const [modal, setModal] = useState<{ record?: MaintenanceRecord; preset?: ServiceKind; scan?: File[]; scanDocId?: number } | null>(null)
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => setTruck(fixedTruckId ?? initialTruck), [fixedTruckId, initialTruck])
  useEffect(() => {
    const open = (e: Event) => setModal({ ...((e as CustomEvent<AddDetail | undefined>).detail ?? {}) })
    window.addEventListener(ADD_EVENT, open)
    return () => window.removeEventListener(ADD_EVENT, open)
  }, [])

  const label = new Map(trucks.map((x) => [x.id, x.label]))
  const docsOf = new Map<number, LogDoc[]>()
  for (const d of docs) docsOf.set(d.maintenanceId, [...(docsOf.get(d.maintenanceId) ?? []), d])
  const rows = records
    .filter((r) => (truck == null || r.truckId === truck) && (kind === 'all' || serviceKind(r) === kind))
    .sort(byNewest)
  const total = rows.reduce((a, r) => a + (r.cost ?? 0), 0)
  const fleet = fixedTruckId == null

  const loose = looseDocs.filter((d) => truck == null || d.truckId === truck)
  const link = (docId: number, maintenanceId: number) =>
    start(async () => {
      const res = await linkDocToMaintenance(docId, maintenanceId)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', t(locale, 'service.linked'))
        router.refresh()
      }
    })

  // «Разобрать всё»: по одной бумаге за раз — у бесплатного ключа ИИ лимит в минуту,
  // и полоса показывает, сколько осталось.
  const parseAll = async () => {
    const list = loose.map((d) => d.id)
    setBulk({ done: 0, total: list.length })
    let ok = 0
    let aiErr: string | null = null
    for (const [i, id] of list.entries()) {
      const res = await autoRecordFromDoc(id).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }))
      if ('error' in res) notify('error', res.error)
      else {
        ok++
        aiErr ??= res.aiError
      }
      setBulk({ done: i + 1, total: list.length })
    }
    setBulk(null)
    if (aiErr) notify('error', aiErr)
    notify('ok', t(locale, 'service.parsedN').replace('{n}', String(ok)))
    router.refresh()
  }

  const attach = (file: File | undefined, r: MaintenanceRecord) => {
    if (!file) return
    start(async () => {
      const up = await sendDocument(file, { kind: 'repair', truckId: r.truckId, maintenanceId: r.id, title: `${r.title} · ${t(locale, 'service.receipt')}` }, locale)
      if ('error' in up) notify('error', up.error)
      else {
        notify('ok', t(locale, 'trucks.care.docAdded'))
        router.refresh()
      }
    })
  }

  const Receipts = ({ r }: { r: MaintenanceRecord }) => (
    <span className="flex flex-wrap items-center gap-1">
      {(docsOf.get(r.id) ?? []).map((d, i) => (
        <DocLink key={d.id} docId={d.id} title={d.title} className="rounded-md bg-haul-500/15 px-2 py-0.5 text-sm font-semibold text-haul-300 hover:bg-haul-500/25">
          📄 {t(locale, 'service.receipt')}{(docsOf.get(r.id)?.length ?? 0) > 1 ? ` ${i + 1}` : ''}
        </DocLink>
      ))}
      <label
        title={t(locale, 'service.attach')}
        className={`flex size-7 cursor-pointer items-center justify-center rounded-md bg-white/8 text-t2 transition-colors hover:bg-white/16 hover:text-haul-400 ${pending ? 'opacity-40' : ''}`}
      >
        <Paperclip size={14} />
        <input
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            attach(e.target.files?.[0], r)
            e.target.value = ''
          }}
        />
      </label>
    </span>
  )

  const Actions = ({ r }: { r: MaintenanceRecord }) => (
    <span className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setModal({ record: r })}
        title={t(locale, 'service.edit')}
        aria-label={t(locale, 'service.edit')}
        className="flex size-7 items-center justify-center rounded-md text-t3 transition-colors hover:bg-white/10 hover:text-t1"
      >
        <Pencil size={14} />
      </button>
      <DeleteButton action={(id, confirm) => deleteMaintenance(id, r.truckId, confirm)} id={r.id} title={r.title} />
    </span>
  )

  const Kind = ({ r }: { r: MaintenanceRecord }) => {
    const k = serviceKind(r)
    return <span className={`inline-block rounded-full px-2 py-0.5 text-sm font-semibold ${KIND_CHIP[k]}`}>{t(locale, `service.kind.${k}`)}</span>
  }

  return (
    <section id="log" className="panel scroll-mt-20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold text-t1">{t(locale, 'service.log')}</h2>
        {/* В «Гараже» кнопка записи — в шапке раздела (AddEntryButton), вторая не нужна. */}
        {!fleet && (
          <>
            <ScanButton locale={locale} size="sm" onFiles={(scan) => setModal({ scan })} />
            <Button variant="primary" size="sm" icon={<Plus size={14} strokeWidth={2.6} />} onClick={() => setModal({})}>
              {t(locale, 'service.add')}
            </Button>
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {fleet && trucks.length > 1 && (
          <select
            value={truck ?? ''}
            onChange={(e) => setTruck(e.target.value ? Number(e.target.value) : null)}
            className="rounded-xl border border-white/10 bg-ink-900/80 px-2.5 py-1.5 text-base text-t1 outline-none max-md:min-h-11"
          >
            <option value="">{t(locale, 'service.allTrucks')}</option>
            {trucks.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        )}
        {(['all', ...SERVICE_KINDS] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors max-md:min-h-9 ${
              kind === k ? 'bg-haul-500 text-white' : 'bg-white/[0.06] text-t2 hover:text-t1'
            }`}
          >
            {t(locale, k === 'all' ? 'service.all' : `service.kind.${k}`)}
          </button>
        ))}
      </div>

      {/* Ремонтные бумаги без записи: ИИ превращает каждую в запись журнала — по одной
          (окно с полями на проверку) или все сразу. Или руками — к готовой записи. */}
      {loose.length > 0 && (
        <div className="garage-pop mt-3 rounded-2xl border border-haul-400/30 bg-gradient-to-br from-haul-500/[0.08] to-transparent p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto flex items-center gap-1.5 text-base font-semibold text-t1">
              <Sparkles size={16} className="text-haul-300" />
              {t(locale, 'service.looseTitle')} · {loose.length}
              <Info text={t(locale, 'service.looseInfo')} />
            </p>
            <Button variant="primary" size="sm" disabled={pending || bulk != null} icon={<Sparkles size={14} />} onClick={parseAll}>
              {bulk ? `${bulk.done} / ${bulk.total}` : t(locale, 'service.parseAll')}
            </Button>
          </div>
          {bulk && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div className="h-full rounded-full bg-haul-400 transition-[width] duration-500" style={{ width: `${Math.round((bulk.done / bulk.total) * 100)}%` }} />
            </div>
          )}
          <ul className="stagger mt-2 flex flex-col gap-1.5">
            {loose.map((d) => {
              const recs = records.filter((r) => r.truckId === d.truckId).sort(byNewest)
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.03] px-2 py-1.5">
                  <DocLink docId={d.id} title={d.title} className="min-w-0 max-w-full truncate text-left text-sm font-semibold text-t1 hover:text-haul-300 hover:underline">
                    📄 {d.title.replace(/\.[a-z0-9]{2,4}$/i, '')}
                  </DocLink>
                  <span className="nums text-sm text-t3">
                    {usDate(titleHints(d.title).doneAt ?? d.uploadedAt)}
                    {fleet && ` · ${label.get(d.truckId) ?? '—'}`}
                  </span>
                  <span className="ml-auto flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={pending || bulk != null}
                      onClick={() => setModal({ scanDocId: d.id })}
                      className="inline-flex items-center gap-1 rounded-lg bg-haul-500/15 px-2.5 py-1 text-sm font-semibold text-haul-300 transition-colors hover:bg-haul-500/25 max-md:min-h-9"
                    >
                      <Sparkles size={13} /> {t(locale, 'service.parseOne')}
                    </button>
                    {recs.length > 0 && (
                      <select
                        value=""
                        disabled={pending || bulk != null}
                        onChange={(e) => link(d.id, Number(e.target.value))}
                        className="max-w-48 rounded-lg border border-white/10 bg-ink-900/80 px-2 py-1 text-sm text-t2 outline-none max-md:min-h-9"
                      >
                        <option value="">{t(locale, 'service.linkTo')}</option>
                        {recs.map((r) => (
                          <option key={r.id} value={r.id}>
                            {usDate(r.doneAt)} · {r.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="mt-4 text-base text-t3">{t(locale, 'service.empty')}</p>
      ) : (
        <>
          {/* Компьютер — таблица. */}
          <div className="mt-3 overflow-x-auto max-md:hidden">
            <table className="w-full text-left text-base">
              <thead className="text-xs font-medium tracking-wide text-t3 uppercase">
                <tr className="border-b border-white/8">
                  <th className="py-2 pr-3">{t(locale, 'service.colDate')}</th>
                  {fleet && <th className="py-2 pr-3">{t(locale, 'service.colTruck')}</th>}
                  <th className="py-2 pr-3">{t(locale, 'service.colKind')}</th>
                  <th className="py-2 pr-3">{t(locale, 'service.colWhat')}</th>
                  <th className="py-2 pr-3">{t(locale, 'service.colShop')}</th>
                  <th className="py-2 pr-3 text-right">{t(locale, 'service.colOdo')}</th>
                  <th className="py-2 pr-3 text-right">{t(locale, 'service.colCost')}</th>
                  <th className="py-2 pr-3">{t(locale, 'service.colDocs')}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.05] align-top">
                    <td className="nums py-2 pr-3 whitespace-nowrap text-t1">
                      {usDate(r.doneAt)}
                      {r.doneTime && <span className="block text-sm text-t3">{r.doneTime}</span>}
                    </td>
                    {fleet && <td className="py-2 pr-3 whitespace-nowrap text-t1">{label.get(r.truckId) ?? '—'}</td>}
                    <td className="py-2 pr-3"><Kind r={r} /></td>
                    <td className="py-2 pr-3 text-t1">
                      {r.title}
                      {r.notes && <span className="block text-sm text-t3">{r.notes}</span>}
                    </td>
                    <td className="py-2 pr-3 text-t2">{r.shop ?? '—'}</td>
                    <td className="nums py-2 pr-3 text-right whitespace-nowrap text-t2">{r.odometer != null ? mi(r.odometer) : '—'}</td>
                    <td className="nums py-2 pr-3 text-right whitespace-nowrap text-t1">{r.cost != null ? usd.format(r.cost) : '—'}</td>
                    <td className="py-2 pr-3"><Receipts r={r} /></td>
                    <td className="py-2"><Actions r={r} /></td>
                  </tr>
                ))}
              </tbody>
              {total > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={fleet ? 6 : 5} className="pt-2 pr-3 text-right text-sm text-t3">{t(locale, 'service.total')}</td>
                    <td className="nums pt-2 pr-3 text-right font-semibold text-t1">{usd.format(total)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Телефон — карточки. */}
          <ul className="mt-3 flex flex-col gap-2 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-white/8 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Kind r={r} />
                      <span className="nums text-sm text-t2">
                        {usDate(r.doneAt)}
                        {r.doneTime && ` · ${r.doneTime}`}
                      </span>
                      {fleet && <span className="text-sm text-t3">· {label.get(r.truckId) ?? '—'}</span>}
                    </div>
                    <p className="mt-1 text-base font-medium text-t1">{r.title}</p>
                  </div>
                  <span className="nums shrink-0 text-base font-semibold text-t1">{r.cost != null ? usd.format(r.cost) : ''}</span>
                </div>
                <p className="mt-1 text-sm text-t2">
                  {[r.shop, r.odometer != null ? mi(r.odometer) : null, r.notes].filter(Boolean).join(' · ')}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Receipts r={r} />
                  <Actions r={r} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {modal && (
        <ServiceEntryModal
          trucks={trucks}
          truckId={truck ?? fixedTruckId}
          record={modal.record}
          preset={modal.preset}
          scan={modal.scan}
          scanDocId={modal.scanDocId}
          onClose={() => setModal(null)}
          locale={locale}
        />
      )}
    </section>
  )
}

/** «Распознать чек»: выбрать (или бросить на кнопку) фото / PDF — откроется окно записи,
 * и ИИ заполнит его по бумаге. */
export function ScanButton({ locale, onFiles, size = 'md' }: { locale: Locale; onFiles: (files: File[]) => void; size?: 'sm' | 'md' }) {
  const [over, setOver] = useState(false)
  return (
    <label
      className={`rounded-xl ${over ? 'ring-2 ring-haul-300' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const files = Array.from(e.dataTransfer.files ?? [])
        if (files.length) onFiles(files)
      }}
    >
      <span
        className={`inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-haul-400/40 bg-haul-500/10 font-semibold text-haul-300 transition-colors hover:bg-haul-500/20 max-md:min-h-11 ${
          size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-base'
        }`}
      >
        <ScanText size={size === 'sm' ? 14 : 16} strokeWidth={2.4} />
        {t(locale, 'service.scan')}
      </span>
      <input
        type="file"
        multiple
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
    </label>
  )
}

/** Кнопки в шапке раздела: «Распознать чек» и «＋ Запись» открывают окно записи журнала. */
export function AddEntryButton({ locale, preset, label }: { locale: Locale; preset?: ServiceKind; label?: string }) {
  const fire = (detail: AddDetail) => window.dispatchEvent(new CustomEvent(ADD_EVENT, { detail }))
  return (
    <>
      <ScanButton locale={locale} onFiles={(scan) => fire({ scan })} />
      <Button variant="primary" icon={<Plus size={15} strokeWidth={2.6} />} onClick={() => fire({ preset })}>
        {label ?? t(locale, 'service.add')}
      </Button>
    </>
  )
}
