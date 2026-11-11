'use client'

// Документы водителя и трака в шапке карточки трака (11/10/26): права, медкарта,
// регистрация трака (cab card) и трейлера, страховка, инспекция, пермиты, договор,
// инструкции. Владелец: «кнопку и механизм, чтобы хранить документы водителя».
//
// Три части на одном состоянии (контекст):
//  • TruckPapersButton — кнопка в ряду «Copy Driver Info / Изменить / ＋ Груз», с числом
//    файлов и точкой цвета самого близкого срока;
//  • TruckPapersStrip — полосы сроков в шапке вместо строк «CDL до —»: цвет говорит
//    статус, нажатие открывает окно на нужном документе;
//  • окно — места по типам: файлы (открыть, скачать, заменить, сменить тип, удалить с
//    подтверждением), срок, «Прочитать срок» с картинки (Gemini, по желанию).
//
// Файлы — в общей таблице documents (truck_id, paper) через sendDocument: те же правила
// загрузки, что у всех бумаг (имя по сети file.<ext>, настоящее — hex). Сроки пяти типов —
// колонки truck_meta, по ним горят «Траки», «Гараж» и проверка при назначении груза.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Download, Eye, FileText, IdCard, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { deleteDocument, readPaperExpiry, setPaperDate, setPaperType } from '@/app/actions'
import { sendDocument } from '@/lib/send-document'
import { notify } from '@/lib/notify'
import { usDate } from '@/lib/fmt'
import { DELETE_WORD } from '@/lib/delete-word'
import { DocModal } from '@/components/doc-modal'
import { HEAD_BTN } from '@/components/driver-card'
import { t, type Locale, type MsgKey } from '@/lib/i18n'
import {
  PAPER_CORE,
  PAPER_GROUP,
  PAPER_META_COLUMN,
  PAPER_NO_EXPIRY,
  PAPER_TYPES,
  daysUntil,
  expiryFill,
  expiryTone,
  slotExpiry,
  type ExpiryTone,
  type MetaDateKey,
  type PaperType,
} from '@/lib/truck-papers-core'
import type { TruckPaper } from '@/lib/truck-papers'

export type PapersData = {
  truckId: number
  /** Сегодня по ET, ISO-день: считать «осталось дней» на сервере и в браузере одинаково. */
  today: string
  readOnly: boolean
  driverName: string | null
  truckNumber: string | null
  metaDates: Partial<Record<MetaDateKey, string | null>>
  docs: TruckPaper[]
}

type Ctx = { data: PapersData; locale: Locale; open: (focus?: PaperType) => void }
const PapersCtx = createContext<Ctx | null>(null)

const typeLabel = (locale: Locale, p: PaperType) => t(locale, `papers.type.${p}` as MsgKey)
const shortLabel = (locale: Locale, p: PaperType) => t(locale, `papers.short.${p}` as MsgKey)

const TONE_TEXT: Record<ExpiryTone, string> = { good: 'text-good-400', warn: 'text-warn-400', bad: 'text-bad-400' }
const TONE_BAR: Record<ExpiryTone, string> = { good: 'bg-good-400', warn: 'bg-warn-400', bad: 'bg-bad-500' }
const TONE_PILL: Record<ExpiryTone, string> = { good: 'bg-good-500/15', warn: 'bg-warn-500/15', bad: 'bg-bad-500/15' }
const TONE_DOT: Record<ExpiryTone, string> = { good: 'bg-good-400', warn: 'bg-warn-400', bad: 'bg-bad-500' }

type Slot = { paper: PaperType; date: string | null; days: number | null; tone: ExpiryTone | null; files: TruckPaper[] }

function slotsOf(data: PapersData): Slot[] {
  return PAPER_TYPES.map((paper) => {
    const date = PAPER_NO_EXPIRY.has(paper) ? null : slotExpiry(paper, data.metaDates, data.docs)
    const days = date ? daysUntil(date, data.today) : null
    return {
      paper,
      date,
      days,
      tone: days == null ? null : expiryTone(days),
      files: data.docs.filter((d) => d.paper === paper),
    }
  })
}

// День загрузки — по ET, как все даты приложения (не по поясу браузера).
const etDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: '2-digit' })
const etDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : etDay.format(d)
}

/** Коротко для полосы в шапке: просрочка — минусом, чтобы влезло рядом с подписью. */
function daysShort(locale: Locale, days: number): string {
  if (days < 0) return t(locale, 'papers.daysLeft').replace('{n}', `−${-days}`)
  return daysText(locale, days)
}

function daysText(locale: Locale, days: number): string {
  if (days < 0) return t(locale, 'papers.expired')
  if (days === 0) return t(locale, 'papers.today')
  return t(locale, 'papers.daysLeft').replace('{n}', String(days))
}

export function TruckPapersProvider({
  data,
  locale,
  children,
}: {
  data: PapersData
  locale: Locale
  children: React.ReactNode
}) {
  const [focus, setFocus] = useState<PaperType | 'all' | null>(null)
  const open = useCallback((p?: PaperType) => setFocus(p ?? 'all'), [])
  const value = useMemo(() => ({ data, locale, open }), [data, locale, open])
  return (
    <PapersCtx.Provider value={value}>
      {children}
      {focus && <PapersModal data={data} locale={locale} focus={focus} onClose={() => setFocus(null)} />}
    </PapersCtx.Provider>
  )
}

/** Кнопка шапки: число файлов и точка цвета самого близкого срока. */
export function TruckPapersButton() {
  const ctx = useContext(PapersCtx)
  if (!ctx) return null
  const { data, locale, open } = ctx
  const slots = slotsOf(data)
  const worst = slots.reduce<ExpiryTone | null>((w, s) => {
    if (s.tone === 'bad' || w === 'bad') return s.tone === 'bad' ? 'bad' : w
    if (s.tone === 'warn' || w === 'warn') return 'warn'
    return w
  }, null)
  return (
    <button type="button" onClick={() => open()} className={`${HEAD_BTN} relative`}>
      <IdCard size={15} strokeWidth={2.2} className="text-haul-300" />
      {t(locale, 'papers.button')}
      {data.docs.length > 0 && (
        <span className="nums rounded-md bg-white/[0.08] px-1.5 text-sm font-semibold leading-5 text-t2">{data.docs.length}</span>
      )}
      {worst && worst !== 'good' && (
        <span aria-hidden className={`absolute -right-1 -top-1 size-2.5 rounded-full ring-2 ring-[var(--color-ink-900)] ${TONE_DOT[worst]}`} />
      )}
    </button>
  )
}

/** Полосы сроков в шапке: обязательные места всегда, пустое — пунктиром «＋». */
export function TruckPapersStrip() {
  const ctx = useContext(PapersCtx)
  if (!ctx) return null
  const { data, locale, open } = ctx
  // Регистрацию трейлера и прочее — только когда есть что показать: шесть пустых
  // полос новой машины сказали бы меньше, чем пять.
  const slots = slotsOf(data).filter(
    (s) => (PAPER_CORE.includes(s.paper) && s.paper !== 'trailer_reg') || s.date || (s.files.length && !PAPER_NO_EXPIRY.has(s.paper)),
  )
  return (
    <ul className="grid grid-cols-2 gap-2 @lg:grid-cols-3">
      {slots.map((s) => {
        const empty = !s.date && !s.files.length
        return (
          <li key={s.paper} className="min-w-0">
            <button
              type="button"
              onClick={() => open(s.paper)}
              title={typeLabel(locale, s.paper)}
              className={`flex w-full min-w-0 flex-col gap-1.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                empty
                  ? 'border-dashed border-white/15 hover:border-haul-400/60 hover:bg-haul-500/[0.06]'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
              }`}
            >
              <span className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1 truncate text-sm font-medium text-t2">
                  {s.files.length > 0 && <FileText size={12} className="shrink-0 text-haul-300" aria-hidden />}
                  {shortLabel(locale, s.paper)}
                </span>
                {s.days != null ? (
                  <span className={`nums shrink-0 text-sm font-semibold ${TONE_TEXT[s.tone!]}`}>{daysShort(locale, s.days)}</span>
                ) : (
                  <Plus size={14} className="shrink-0 text-t3" aria-hidden />
                )}
              </span>
              <span className="block h-1 overflow-hidden rounded-full bg-white/[0.08]">
                {s.days != null && (
                  <span
                    className={`block h-full rounded-full ${TONE_BAR[s.tone!]}`}
                    style={{ width: `${Math.max(4, Math.round(expiryFill(s.days) * 100))}%` }}
                  />
                )}
              </span>
              <span className={`nums truncate text-sm ${s.date ? 'text-t1' : 'text-t3'}`}>
                {s.date ? usDate(s.date) : s.files.length ? t(locale, 'papers.noDate') : t(locale, 'papers.noFile')}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------ окно ------------------------------ */

function PapersModal({
  data,
  locale,
  focus,
  onClose,
}: {
  data: PapersData
  locale: Locale
  focus: PaperType | 'all'
  onClose: () => void
}) {
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<PaperType | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<TruckPaper | null>(null)
  const [addType, setAddType] = useState<PaperType>(focus === 'all' ? 'cdl' : focus)
  // Вложенные окна (просмотр, удаление) закрываются своим Escape — это окно в тот
  // момент остаётся открытым.
  const nested = useRef(false)
  nested.current = viewing != null || deleting != null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || nested.current) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  // Открыли с полосы — сразу к нужному месту.
  useEffect(() => {
    if (focus === 'all') return
    document.getElementById(`paper-slot-${focus}`)?.scrollIntoView({ block: 'center' })
  }, [focus])

  const slots = slotsOf(data)
  const bySlot = new Map(slots.map((s) => [s.paper, s]))

  const upload = (paper: PaperType, files: File[], replaceOf?: number) => {
    if (!files.length || data.readOnly) return
    const hadDate = !!bySlot.get(paper)?.date
    setBusy(paper)
    start(async () => {
      let lastId: number | null = null
      for (const file of files) {
        const res = await sendDocument(
          file,
          { truckId: data.truckId, paper, replaceOf: replaceOf ?? null, kind: 'other' },
          locale,
        )
        if ('error' in res) notify('error', res.error)
        else lastId = res.id
      }
      if (lastId != null) {
        notify('ok', t(locale, replaceOf ? 'papers.replaced' : 'papers.uploaded'))
        // Срок с бумаги — без лишнего шага, только если его ещё нет. Не нашёлся — молчим:
        // поле даты на месте.
        const img = files[files.length - 1]!
        if (!hadDate && !PAPER_NO_EXPIRY.has(paper) && (img.type === 'application/pdf' || img.type.startsWith('image/'))) {
          const r = await readPaperExpiry(lastId)
          if ('date' in r) notify('ok', t(locale, 'papers.readOk').replace('{d}', usDate(r.date)))
        }
      }
      setBusy(null)
    })
  }

  const saveDate = (paper: PaperType, date: string, docId: number | null) =>
    start(async () => {
      const res = await setPaperDate(data.truckId, paper, date, docId)
      if (res?.error) notify('error', res.error)
      else notify('ok', t(locale, 'papers.dateSaved'))
    })

  const readDate = (paper: PaperType, docId: number) => {
    setBusy(paper)
    start(async () => {
      const r = await readPaperExpiry(docId)
      if ('date' in r) notify('ok', t(locale, 'papers.readOk').replace('{d}', usDate(r.date)))
      else notify('warn', r.error)
      setBusy(null)
    })
  }

  const changeType = (docId: number, paper: PaperType) =>
    start(async () => {
      const res = await setPaperType(docId, paper)
      if (res?.error) notify('error', res.error)
      else notify('ok', t(locale, 'papers.typeSaved'))
    })

  // Места: обязательные всегда, остальные — когда в них есть файл.
  const visible = slots.filter((s) => PAPER_CORE.includes(s.paper) || s.files.length > 0 || focus === s.paper)
  const groups = (['driver', 'equipment', 'other'] as const)
    .map((g) => ({ g, items: visible.filter((s) => PAPER_GROUP[s.paper] === g) }))
    .filter((x) => x.items.length)
  const GROUP_KEY = { driver: 'papers.groupDriver', equipment: 'papers.groupEquipment', other: 'papers.groupOther' } as const

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(locale, 'papers.title')}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="panel flex max-h-full w-full max-w-4xl flex-col overflow-hidden">
        {/* Шапка окна не уезжает при прокрутке: ✕ всегда под рукой. */}
        <div className="flex items-start gap-3 border-b border-white/8 px-4 py-3 sm:px-5">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-haul-500/15 text-haul-300">
            <IdCard size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-6 text-t1">{t(locale, 'papers.title')}</h2>
            <p className="truncate text-sm text-t3">
              {[data.driverName, data.truckNumber ? `#${data.truckNumber}` : null].filter(Boolean).join(' · ')}
              {data.readOnly && <span className="ml-2 text-warn-400">{t(locale, 'papers.readonly')}</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'papers.close')}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg text-t3 transition-colors hover:bg-white/10 hover:text-t1"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5">
          {/* Добавить любой документ: тип из списка + файл. */}
          {!data.readOnly && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value as PaperType)}
                aria-label={t(locale, 'papers.changeType')}
                className="h-11 min-w-0 rounded-xl border border-white/12 bg-ink-950/70 px-3 text-base font-medium text-t1 outline-none focus:border-haul-500 sm:w-64"
              >
                {PAPER_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {typeLabel(locale, p)}
                  </option>
                ))}
              </select>
              <DropZone
                disabled={pending}
                label={busy === addType ? t(locale, 'papers.uploading') : t(locale, 'papers.drop')}
                onFiles={(f) => upload(addType, f)}
                className="min-h-11 flex-1"
              />
            </div>
          )}

          {groups.map(({ g, items }) => (
            <section key={g}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-t3">{t(locale, GROUP_KEY[g])}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((s) => (
                  <SlotCard
                    key={s.paper}
                    slot={s}
                    locale={locale}
                    readOnly={data.readOnly}
                    focused={focus === s.paper}
                    busy={busy === s.paper}
                    pending={pending}
                    onUpload={(files, replaceOf) => upload(s.paper, files, replaceOf)}
                    onDate={(d) => saveDate(s.paper, d, null)}
                    onRead={(id) => readDate(s.paper, id)}
                    onView={setViewing}
                    onDelete={setDeleting}
                    onType={changeType}
                  />
                ))}
              </div>
            </section>
          ))}

          <p className="text-sm text-t3">{t(locale, 'papers.hint')}</p>
        </div>
      </div>

      {viewing != null && <DocModal docId={viewing} onClose={() => setViewing(null)} />}
      {deleting && <DeletePaper doc={deleting} locale={locale} onClose={() => setDeleting(null)} />}
    </div>,
    document.body,
  )
}

function SlotCard({
  slot,
  locale,
  readOnly,
  focused,
  busy,
  pending,
  onUpload,
  onDate,
  onRead,
  onView,
  onDelete,
  onType,
}: {
  slot: Slot
  locale: Locale
  readOnly: boolean
  focused: boolean
  busy: boolean
  pending: boolean
  onUpload: (files: File[], replaceOf?: number) => void
  onDate: (date: string) => void
  onRead: (docId: number) => void
  onView: (id: number) => void
  onDelete: (doc: TruckPaper) => void
  onType: (docId: number, paper: PaperType) => void
}) {
  const [drag, setDrag] = useState(false)
  const [date, setDate] = useState(slot.date ?? '')
  // Срок поменялся на сервере (прочитан с картинки, сохранён) — поле догоняет.
  useEffect(() => setDate(slot.date ?? ''), [slot.date])
  const noExpiry = PAPER_NO_EXPIRY.has(slot.paper)
  // Срок без файла можно ставить только тем, у кого он живёт в карточке трака
  // (CDL до, медкарта до…). Остальным срок — свойство файла.
  const canDate = !noExpiry && (!!PAPER_META_COLUMN[slot.paper] || slot.files.length > 0)

  return (
    <div
      id={`paper-slot-${slot.paper}`}
      onDragOver={(e) => {
        if (readOnly) return
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        onUpload([...e.dataTransfer.files])
      }}
      className={`flex min-w-0 flex-col gap-2.5 rounded-xl border p-3 transition-colors ${
        drag
          ? 'border-haul-400 bg-haul-500/10'
          : focused
            ? 'border-haul-400/70 bg-white/[0.04]'
            : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h4 className="min-w-0 truncate text-base font-semibold text-t1">{typeLabel(locale, slot.paper)}</h4>
        {slot.days != null ? (
          <span className={`nums shrink-0 rounded-full px-2 py-0.5 text-sm font-semibold ${TONE_TEXT[slot.tone!]} ${TONE_PILL[slot.tone!]}`}>
            {daysText(locale, slot.days)}
          </span>
        ) : (
          !slot.files.length && <span className="shrink-0 text-sm text-t3">{t(locale, 'papers.noFile')}</span>
        )}
      </div>

      {!noExpiry && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="block h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            {slot.days != null && (
              <span
                className={`block h-full rounded-full ${TONE_BAR[slot.tone!]}`}
                style={{ width: `${Math.max(4, Math.round(expiryFill(slot.days) * 100))}%` }}
              />
            )}
          </span>
          {canDate && (
            <label className="flex shrink-0 items-center gap-2 text-sm text-t2">
              {t(locale, 'papers.expires')}
              <input
                type="date"
                value={date}
                disabled={readOnly || pending}
                onChange={(e) => setDate(e.target.value)}
                onBlur={() => date !== (slot.date ?? '') && onDate(date)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="nums h-9 rounded-lg border border-white/12 bg-ink-950/70 px-2 text-base text-t1 outline-none focus:border-haul-500"
              />
            </label>
          )}
        </div>
      )}

      {slot.files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {slot.files.map((d) => (
            <FileRow
              key={d.id}
              doc={d}
              locale={locale}
              readOnly={readOnly}
              pending={pending}
              onView={() => onView(d.id)}
              onReplace={(f) => onUpload([f], d.id)}
              onDelete={() => onDelete(d)}
              onType={(p) => onType(d.id, p)}
            />
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <label
            className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-haul-400/50 px-3 text-sm font-semibold text-haul-300 transition-colors hover:bg-haul-500/10 ${
              pending ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            <Plus size={14} strokeWidth={2.6} />
            {busy ? t(locale, 'papers.uploading') : t(locale, 'papers.add')}
            <input
              type="file"
              multiple
              accept="application/pdf,image/*"
              className="hidden"
              disabled={pending}
              onChange={(e) => {
                onUpload([...(e.target.files ?? [])])
                e.target.value = ''
              }}
            />
          </label>
          {!noExpiry && !slot.date && slot.files.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onRead(slot.files[0]!.id)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-t2 transition-colors hover:bg-white/[0.06] hover:text-t1 disabled:opacity-50"
            >
              <Sparkles size={14} className="text-haul-300" />
              {busy ? t(locale, 'papers.reading') : t(locale, 'papers.read')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function FileRow({
  doc,
  locale,
  readOnly,
  pending,
  onView,
  onReplace,
  onDelete,
  onType,
}: {
  doc: TruckPaper
  locale: Locale
  readOnly: boolean
  pending: boolean
  onView: () => void
  onReplace: (f: File) => void
  onDelete: () => void
  onType: (p: PaperType) => void
}) {
  const icon =
    'flex size-9 shrink-0 items-center justify-center rounded-lg text-t3 transition-colors hover:bg-white/[0.08] hover:text-t1 disabled:opacity-40'
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] p-1.5">
      <button type="button" onClick={onView} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" title={doc.title}>
        <Thumb id={doc.id} mime={doc.mime} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-t1">{doc.title}</span>
          <span className="nums block truncate text-xs text-t3">
            {etDate(doc.uploadedAt)} · {Math.max(1, Math.round(doc.sizeBytes / 1024))} KB
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center">
        <button type="button" onClick={onView} title={t(locale, 'papers.open')} aria-label={t(locale, 'papers.open')} className={`${icon} max-sm:hidden`}>
          <Eye size={16} />
        </button>
        <a href={`/api/docs/${doc.id}?download=1`} title={t(locale, 'papers.download')} aria-label={t(locale, 'papers.download')} className={icon}>
          <Download size={16} />
        </a>
        {!readOnly && (
          <>
            <label title={t(locale, 'papers.replace')} aria-label={t(locale, 'papers.replace')} className={`${icon} cursor-pointer ${pending ? 'pointer-events-none opacity-40' : ''}`}>
              <RefreshCw size={16} />
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                disabled={pending}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onReplace(f)
                  e.target.value = ''
                }}
              />
            </label>
            <TypeMenu current={doc.paper} locale={locale} disabled={pending} onPick={onType} />
            <button type="button" disabled={pending} onClick={onDelete} title={t(locale, 'papers.delete')} aria-label={t(locale, 'papers.delete')} className={`${icon} hover:!text-bad-400`}>
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    </li>
  )
}

/** Сменить тип: невидимый select поверх значка — родное меню и на телефоне. */
function TypeMenu({
  current,
  locale,
  disabled,
  onPick,
}: {
  current: PaperType
  locale: Locale
  disabled: boolean
  onPick: (p: PaperType) => void
}) {
  return (
    <span
      title={t(locale, 'papers.changeType')}
      className="relative flex size-9 shrink-0 items-center justify-center rounded-lg text-t3 transition-colors hover:bg-white/[0.08] hover:text-t1"
    >
      <span aria-hidden className="text-xs font-bold tracking-tight">Aa</span>
      <select
        value={current}
        disabled={disabled}
        aria-label={t(locale, 'papers.changeType')}
        onChange={(e) => e.target.value !== current && onPick(e.target.value as PaperType)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {PAPER_TYPES.map((p) => (
          <option key={p} value={p}>
            {typeLabel(locale, p)}
          </option>
        ))}
      </select>
    </span>
  )
}

function Thumb({ id, mime }: { id: number; mime: string }) {
  const [broken, setBroken] = useState(false)
  const img = mime?.startsWith('image/') && !broken
  return (
    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/[0.05]">
      {img ? (
        <img src={`/api/docs/${id}?thumb=1`} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" />
      ) : (
        <span className="flex flex-col items-center text-t3">
          <FileText size={16} />
          <span className="text-[9px] font-bold uppercase leading-3">{mime === 'application/pdf' ? 'PDF' : (mime?.split('/')[1] ?? '').slice(0, 4)}</span>
        </span>
      )}
    </span>
  )
}

function DropZone({
  label,
  disabled,
  onFiles,
  className = '',
}: {
  label: string
  disabled: boolean
  onFiles: (f: File[]) => void
  className?: string
}) {
  const [drag, setDrag] = useState(false)
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        onFiles([...e.dataTransfer.files])
      }}
      className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-2 text-center text-sm font-semibold transition-colors ${
        drag ? 'border-haul-400 bg-haul-500/15 text-haul-200' : 'border-haul-400/40 text-haul-300 hover:bg-haul-500/10'
      } ${disabled ? 'pointer-events-none opacity-50' : ''} ${className}`}
    >
      <Plus size={16} strokeWidth={2.6} className="shrink-0" />
      <span className="min-w-0">{label}</span>
      <input
        type="file"
        multiple
        accept="application/pdf,image/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </label>
  )
}

/** Удаление — словом DELETE, как у всех документов: файл уходит в корзину «Документов». */
function DeletePaper({ doc, locale, onClose }: { doc: TruckPaper; locale: Locale; onClose: () => void }) {
  const [word, setWord] = useState('')
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = () =>
    start(async () => {
      setErr('')
      const res = await deleteDocument(doc.id, word)
      if (res?.error) setErr(res.error)
      else {
        notify('ok', t(locale, 'papers.deleted'), doc.title)
        onClose()
      }
    })

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="panel w-full max-w-sm p-5" role="alertdialog" aria-modal="true">
        <div className="flex items-start gap-3">
          <h3 className="min-w-0 flex-1 text-lg font-semibold text-t1">{t(locale, 'papers.deleteTitle')}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'papers.close')}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-lg text-t3 hover:bg-white/10 hover:text-t1"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 break-words text-sm leading-relaxed text-t2">{t(locale, 'papers.deleteBody').replace('{t}', doc.title)}</p>
        <input
          autoFocus
          type="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={word}
          onChange={(e) => setWord(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && word === DELETE_WORD && submit()}
          placeholder={DELETE_WORD}
          className="nums mt-4 h-11 w-full rounded-xl border border-white/10 bg-ink-950/70 px-3 text-base tracking-[0.2em] text-t1 outline-none focus:border-haul-500"
        />
        {err && <p className="mt-2 text-sm text-bad-400">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-lg px-4 text-base text-t2 hover:text-t1">
            {t(locale, 'papers.cancel')}
          </button>
          <button
            type="button"
            disabled={pending || word !== DELETE_WORD}
            onClick={submit}
            className="h-10 rounded-lg bg-bad-500 px-4 text-base font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {t(locale, 'papers.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
