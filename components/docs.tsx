'use client'

import { DocLink } from '@/components/doc-link'
import { DELETE_WORD } from '@/lib/delete-word'

import { FileX2, FolderOpen, Trash2 } from 'lucide-react'
import { Button } from '@/components/button'
import { Empty } from '@/components/empty'
// Upload + list + library for documents. Server pages fetch the metadata and pass
// it in; the file itself travels through the uploadDocument server action (≤8MB).
// Deleting is guarded (type DELETE) and audited — see DeleteDialog / deleteDocument.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createLoadFromExistingRc,
  deleteDocument,
  purgeDocument,
  restoreDocument,
  setDocumentKind,
  uploadDocument,
} from '@/app/actions'
import { DeleteButton } from '@/components/delete-button'
import { DOC_KINDS, docKindLabel, fmtSize, type DocKind, type DocLibRow, type DocMeta } from '@/lib/docs'
import { notify } from '@/lib/notify'
import { staleBuildMessage } from '@/components/build-watch'
import { Info } from '@/components/info'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale } from '@/lib/i18n'
import { ShowMore } from '@/components/collapse'

export function DocUpload({
  truckId,
  loadId,
  trucks,
  defaultKind = 'other',
}: {
  truckId?: number
  loadId?: number
  /** Global /docs page passes the fleet so a file can be filed under a truck. */
  trucks?: { id: number; label: string }[]
  /** Pre-select a kind when the surrounding context already implies one (e.g. a
   * repair receipt uploaded right from the maintenance log). */
  defaultKind?: DocKind
}) {
  const locale = useLocale()
  const [pending, start] = useTransition()
  const [kind, setKind] = useState<DocKind>(defaultKind)
  const [pickTruck, setPickTruck] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Несколько файлов за раз: многостраничный BOL/POD снимают по странице, фото
  // груза — серией. Тип один на всю пачку — тот, что выбран рядом; никакого
  // угадывания: что это за файл, называет человек.
  function send(list: FileList | null) {
    const files = Array.from(list ?? [])
    if (files.length === 0) return
    start(async () => {
      let saved = 0
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('kind', kind)
        if (truckId) fd.append('truckId', String(truckId))
        if (loadId) fd.append('loadId', String(loadId))
        if (!truckId && pickTruck) fd.append('truckId', pickTruck)
        try {
          const res = await uploadDocument(fd)
          if ('error' in res) notify('error', `${file.name}: ${res.error}`)
          else saved++
        } catch (e) {
          // Экшен отверг вкладку после деплоя — сказать по-человечески, а не молчать.
          notify('error', staleBuildMessage(e instanceof Error ? e.message : String(e), locale))
          break
        }
      }
      if (saved > 0) {
        notify('ok', t(locale, 'docs.upload.saved'), saved === 1 ? files[0]!.name : `${saved} × ${docKindLabel(kind, locale)}`)
        if (fileRef.current) fileRef.current.value = ''
      }
    })
  }

  const select =
    'rounded-xl border border-white/8 bg-ink-900/80 px-2.5 py-2 text-[13px] text-white outline-none'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={kind} onChange={(e) => setKind(e.target.value as DocKind)} className={select}>
        {(Object.keys(DOC_KINDS) as DocKind[]).map((k) => (
          <option key={k} value={k}>
            {docKindLabel(k, locale)}
          </option>
        ))}
      </select>
      {trucks && !truckId && (
        <select value={pickTruck} onChange={(e) => setPickTruck(e.target.value)} className={select}>
          <option value="">{t(locale, 'docs.upload.noTruck')}</option>
          {trucks.map((tr) => (
            <option key={tr.id} value={tr.id}>
              {tr.label}
            </option>
          ))}
        </select>
      )}
      <label
        className={`cursor-pointer rounded-xl bg-haul-500 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400 ${
          pending ? 'opacity-50' : ''
        }`}
      >
        {pending ? t(locale, 'docs.upload.uploading') : t(locale, 'docs.upload.file')}
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/*"
          multiple
          className="hidden"
          disabled={pending}
          onChange={(e) => send(e.target.files)}
        />
      </label>
      <span className="text-[11px] text-white/45">{t(locale, 'docs.upload.hint')}</span>
      <Info text={t(locale, 'docs.upload.info')} />
    </div>
  )
}

const KIND_TONE: Record<DocKind, string> = {
  ratecon: 'bg-haul-500/15 text-haul-400',
  driverinfo: 'bg-haul-500/10 text-haul-300',
  bol: 'bg-good-500/15 text-good-400',
  pod: 'bg-good-500/15 text-good-400',
  invoice: 'bg-haul-500/15 text-haul-400',
  insurance: 'bg-warn-400/15 text-warn-400',
  registration: 'bg-warn-400/15 text-warn-400',
  photo: 'bg-good-500/10 text-good-300',
  repair: 'bg-amber-400/15 text-amber-300',
  other: 'bg-white/8 text-white/60',
}

/** Подтверждение удаления словом DELETE. Один диалог на список. */
function DeleteDialog({ doc, onClose }: { doc: DocMeta; onClose: () => void }) {
  const router = useRouter()
  const locale = useLocale()
  const [word, setWord] = useState('')
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    setErr('')
    start(async () => {
      const res = await deleteDocument(doc.id, word)
      if (res?.error) setErr(res.error)
      else {
        notify('ok', t(locale, 'docs.delete.done'), doc.title)
        onClose()
      }
    })
  }

  const field =
    'w-full rounded-xl border border-white/10 bg-ink-950/70 px-3 py-2 text-[14px] text-white outline-none focus:border-haul-500'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[15px] font-semibold">{t(locale, 'docs.delete.title')}</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-white/60">
          {t(locale, 'docs.delete.body').replace('{t}', doc.title)}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <input
            autoFocus
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            value={word}
            onChange={(e) => setWord(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && word === DELETE_WORD && submit()}
            placeholder={DELETE_WORD}
            className={`${field} nums tracking-[0.2em]`}
          />
        </div>
        {err && <p className="mt-2 text-[12.5px] text-bad-400">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t(locale, 'docs.delete.cancel')}
          </Button>
          <Button variant="danger" disabled={pending || word !== DELETE_WORD}
            onClick={submit}>
            {pending ? t(locale, 'docs.delete.deleting') : t(locale, 'docs.delete.confirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Actions for a doc that isn't tied to a load yet — the gap this fills: a file that
 * arrived via Telegram sits under the truck with no load, and there was no way to act
 * on it from the list. "Recognise" runs the AI on it as a rate con and spins up a load
 * (works even if the file was auto-classified 'other'); the picker links it to an
 * existing load. Only shown on the truck page, where `attachTargets` is passed. */
function UnattachedActions({
  docId,
  kind,
  truckId,
  loads,
  locale,
}: {
  docId: number
  kind: DocKind
  truckId: number
  loads: { id: number; label: string }[]
  locale: Locale
}) {
  // "Recognise" only for kinds that could actually BE a rate con: an explicit ratecon,
  // or an 'other' that a Telegram classifier may have misread. Offering it on a clearly
  // typed insurance/registration/POD would just be noise — those only get "attach".
  // Лист водителя тоже: у TQL в нём всё, кроме ставки, — груз из него нужен.
  const canRecognize = kind === 'ratecon' || kind === 'other' || kind === 'driverinfo'
  const router = useRouter()
  const [pending, start] = useTransition()

  function recognize() {
    start(async () => {
      try {
        const res = await createLoadFromExistingRc(docId, truckId)
        if ('error' in res) notify('error', res.error)
        else {
          notify('ok', t(locale, 'docs.unattached.recognizedToast'))
        }
      } catch (e) {
        notify('error', staleBuildMessage(e instanceof Error ? e.message : String(e), locale))
      }
    })
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {canRecognize && (
        <button
          type="button"
          onClick={recognize}
          disabled={pending}
          className="rounded-md bg-haul-500/15 px-2 py-1 text-2xs font-semibold text-haul-300 transition-colors hover:bg-haul-500/25 disabled:opacity-50"
        >
          {pending ? t(locale, 'docs.unattached.working') : t(locale, 'docs.unattached.recognize')}
        </button>
      )}
    </div>
  )
}

/** Подпись типа — выпадающий список прямо на месте бейджа: «BOL» оказался фото
 * груза, страница POD легла как «Прочее» — меняется на месте, файл не трогаем. */
function KindPicker({ doc, small }: { doc: DocMeta; small?: boolean }) {
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <select
      value={doc.kind}
      disabled={pending}
      title={t(locale, 'docs.kind.changeTitle')}
      onChange={(e) => {
        const kind = e.target.value as DocKind
        start(async () => {
          const res = await setDocumentKind(doc.id, kind)
          if (res && 'error' in res) notify('error', res.error)
          else {
            notify('ok', t(locale, 'docs.kind.changed'), docKindLabel(kind, locale))
            router.refresh()
          }
        })
      }}
      className={`shrink-0 cursor-pointer rounded-md border border-white/15 font-medium outline-none hover:border-white/35 disabled:opacity-50 ${KIND_TONE[doc.kind]} ${
        small ? 'px-1 py-0.5 text-[10px]' : 'mt-0.5 px-1.5 py-1 text-2xs'
      }`}
    >
      {(Object.keys(DOC_KINDS) as DocKind[]).map((k) => (
        <option key={k} value={k} className="bg-ink-900 text-white">
          {docKindLabel(k, locale)}
        </option>
      ))}
    </select>
  )
}

/** One document line. Reused by the flat list and the grouped library. */
function DocRow({
  doc,
  showLinks,
  from,
  to,
  onDelete,
  attachTargets,
  dense,
}: {
  doc: DocMeta
  showLinks?: boolean
  from?: string | null
  to?: string | null
  onDelete: (d: DocMeta) => void
  /** The truck's loads, passed only on the truck page — enables the recognise/attach
   * row for a doc that isn't linked to a load yet. */
  attachTargets?: { id: number; label: string }[]
  /** Библиотека /docs: строка в одну линию вместо трёх. Там ширина полная, а
   * документов у трака бывает по два десятка — карточка в три строки превращала
   * список в бесконечную ленту, где не видно и десяти файлов подряд. */
  dense?: boolean
}) {
  const locale = useLocale()
  // items-start, and the size/date moved UNDER the filename rather than beside it. In
  // the truck page's half-width column the old single row gave the filename whatever
  // was left after a type pill, a size, a date and a delete button — measured at
  // "Certificate of Insurance.pdf" losing 89px to the ellipsis, which is the whole
  // point of a filename.
  if (dense) {
    // Одна строка: тип, имя файла, а маршрут, размер и дата — приглушённым хвостом
    // справа от имени. Всё то же самое, но высота строки вместо высоты карточки.
    return (
      <li className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/[0.04]">
        <KindPicker doc={doc} small />
        <DocLink
          docId={doc.id}
          className="min-w-0 shrink truncate text-left text-[13px] text-white/85 hover:text-haul-400 hover:underline"
          title={doc.title}
        >
          {doc.title}
        </DocLink>
        {(from || to) && (
          <span className="hidden min-w-0 shrink truncate text-[11.5px] text-white/40 sm:block">
            {from ?? '—'} → {to ?? '—'}
          </span>
        )}
        <span className="nums ml-auto shrink-0 text-[11.5px] text-white/35">{doc.uploadedAt.slice(0, 10)}</span>
        {showLinks && doc.truckId && (
          <a href={`/trucks/${doc.truckId}`} className="shrink-0 text-[11px] text-white/45 hover:text-white/85">
            {t(locale, 'docs.row.truck')}
          </a>
        )}
        {showLinks && doc.loadId && (
          <a href={`/loads/${doc.loadId}`} className="shrink-0 text-[11px] text-white/45 hover:text-white/85">
            {t(locale, 'docs.row.load')}
          </a>
        )}
        <button
          onClick={() => onDelete(doc)}
          title={t(locale, 'docs.delete.rowTitle')}
          className="shrink-0 px-1 text-[13px] text-white/35 transition-colors hover:text-bad-400"
        >
          ✕
        </button>
      </li>
    )
  }

  return (
    <li className="flex items-start gap-2.5 rounded-lg border border-white/6 px-3 py-2">
      <KindPicker doc={doc} />
      <div className="min-w-0 flex-1">
        {/* Окном поверх страницы, а не отдельной страницей — см. doc-link.tsx. */}
        <DocLink
          docId={doc.id}
          className="block w-full truncate text-left text-md text-white/85 hover:text-haul-400 hover:underline"
          title={doc.title}
        >
          {doc.title}
        </DocLink>
        {(from || to) && (
          <div className="truncate text-xs text-white/45">
            {from ?? '—'} → {to ?? '—'}
          </div>
        )}
        <span className="nums block text-xs text-white/40">
          {fmtSize(doc.sizeBytes)} · {doc.uploadedAt.slice(0, 10)}
        </span>
        {doc.loadId === null && doc.truckId && attachTargets && (
          <UnattachedActions docId={doc.id} kind={doc.kind} truckId={doc.truckId} loads={attachTargets} locale={locale} />
        )}
      </div>
      {showLinks && doc.truckId && (
        <a
          href={`/trucks/${doc.truckId}`}
          className="shrink-0 text-[11px] text-white/55 hover:text-white/85"
        >
          {t(locale, 'docs.row.truck')}
        </a>
      )}
      {showLinks && doc.loadId && (
        <a
          href={`/loads/${doc.loadId}`}
          className="shrink-0 text-[11px] text-white/55 hover:text-white/85"
        >
          {t(locale, 'docs.row.load')}
        </a>
      )}
      <button
        title={t(locale, 'docs.delete.rowTitle')}
        onClick={() => onDelete(doc)}
        className="shrink-0 text-[13px] text-white/35 transition-colors hover:text-bad-400"
      >
        ✕
      </button>
    </li>
  )
}

/** Flat list — per-truck and per-load pages. */
export function DocList({
  docs,
  showLinks,
  attachTargets,
}: {
  docs: DocMeta[]
  showLinks?: boolean
  /** The truck's loads — passed on the truck page so an unattached doc can be
   * recognised into a load or linked to an existing one right from the list. */
  attachTargets?: { id: number; label: string }[]
}) {
  const locale = useLocale()
  const [del, setDel] = useState<DocMeta | null>(null)
  if (docs.length === 0)
    return <Empty compact icon={FileX2} title={t(locale, 'docs.list.empty')} />
  return (
    <>
      <ul className="mt-3 flex flex-col gap-1.5">
        {docs.map((d) => (
          <DocRow key={d.id} doc={d} showLinks={showLinks} onDelete={setDel} attachTargets={attachTargets} />
        ))}
      </ul>
      {del && <DeleteDialog doc={del} onClose={() => setDel(null)} />}
    </>
  )
}

type Group = { id: number | null; label: string; sub: string; rows: DocLibRow[] }

/** Library view: filter by kind, grouped by driver/truck, each group collapsible. */
export function DocLibrary({
  rows,
  trucks,
}: {
  rows: DocLibRow[]
  trucks: { id: number; label: string; driver: string }[]
}) {
  const locale = useLocale()
  const [del, setDel] = useState<DocMeta | null>(null)
  const [kind, setKind] = useState<DocKind | 'all'>('all')
  const [closed, setClosed] = useState<Set<string>>(new Set())

  const shown = kind === 'all' ? rows : rows.filter((r) => r.kind === kind)

  // Build groups in fleet order, then a "no truck" bucket. Empty groups drop out.
  const groups: Group[] = []
  for (const truck of trucks) {
    const rs = shown.filter((r) => r.groupTruckId === truck.id)
    if (rs.length) groups.push({ id: truck.id, label: truck.label, sub: truck.driver, rows: rs })
  }
  const orphan = shown.filter((r) => r.groupTruckId == null)
  if (orphan.length) groups.push({ id: null, label: t(locale, 'docs.upload.noTruck'), sub: '', rows: orphan })

  const kinds: (DocKind | 'all')[] = [
    'all',
    ...(Object.keys(DOC_KINDS) as DocKind[]).filter((k) => rows.some((r) => r.kind === k)),
  ]

  return (
    <>
      {/* Kind filter */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
              kind === k
                ? 'bg-haul-500 text-white'
                : 'bg-white/6 text-white/60 hover:bg-white/10 hover:text-white/85'
            }`}
          >
            {k === 'all' ? t(locale, 'docs.library.all') : docKindLabel(k, locale)}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <Empty compact icon={FolderOpen} title={t(locale, 'docs.library.empty')} />
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((g) => {
            const key = String(g.id)
            const open = !closed.has(key)
            return (
              <div key={key} className="overflow-hidden rounded-xl border border-white/8">
                <button
                  onClick={() =>
                    setClosed((prev) => {
                      const n = new Set(prev)
                      n.has(key) ? n.delete(key) : n.add(key)
                      return n
                    })
                  }
                  className="flex w-full items-center gap-3 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]"
                >
                  <span className="text-white/40">{open ? '▾' : '▸'}</span>
                  <span className="text-[14px] font-semibold">{g.label}</span>
                  {g.sub && <span className="truncate text-[12px] text-white/55">{g.sub}</span>}
                  <span className="ml-auto shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-white/60">
                    {g.rows.length}
                  </span>
                </button>
                {open && (
                  <ul className="flex flex-col gap-0.5 p-1.5">
                    {/* Первые восемь — остальное за одной строкой «ещё N». У трака
                        бывает по два десятка бумаг, и разворачивать их все сразу
                        значит хоронить следующий трак под ними. */}
                    <ShowMore
                      limit={8}
                      label={t(locale, 'docs.library.more')}
                      items={g.rows.map((r) => (
                        <DocRow
                          key={r.id}
                          doc={r}
                          dense
                          showLinks
                          from={r.origin}
                          to={r.destination}
                          onDelete={setDel}
                        />
                      ))}
                    />
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
      {del && <DeleteDialog doc={del} onClose={() => setDel(null)} />}
    </>
  )
}

/** The trash: documents "deleted" elsewhere land here first — restore needs no
 * PIN (the safe direction), purging for real needs the same guard as any delete. */
export function DocTrash({ rows }: { rows: DocLibRow[] }) {
  const router = useRouter()
  const locale = useLocale()
  const [pending, start] = useTransition()

  function restore(id: number, title: string) {
    start(async () => {
      await restoreDocument(id)
      notify('ok', t(locale, 'docs.trash.restored'), title)
    })
  }

  if (rows.length === 0) return <Empty compact icon={Trash2} title={t(locale, 'docs.trash.empty')} />

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((d) => (
        <li key={d.id} className="flex items-center gap-3 rounded-lg border border-white/6 px-3 py-2">
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${KIND_TONE[d.kind]}`}>
            {docKindLabel(d.kind, locale)}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[14px] text-white/70">{d.title}</span>
            <span className="text-[11px] text-white/45">
              {t(locale, 'docs.trash.deletedOn').replace('{d}', d.deletedAt?.slice(0, 10) ?? '')} ·{' '}
              {fmtSize(d.sizeBytes)}
            </span>
          </div>
          <button
            disabled={pending}
            onClick={() => restore(d.id, d.title)}
            className="shrink-0 rounded-lg bg-white/8 px-2.5 py-1 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/16 disabled:opacity-40"
          >
            {t(locale, 'docs.trash.restore')}
          </button>
          <DeleteButton
            action={purgeDocument}
            id={d.id}
            title={d.title}
            note={t(locale, 'docs.trash.purgeNote')}
          />
        </li>
      ))}
    </ul>
  )
}
