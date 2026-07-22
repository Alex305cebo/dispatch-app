'use client'

// Upload + list + library for documents. Server pages fetch the metadata and pass
// it in; the file itself travels through the uploadDocument server action (≤8MB).
// Deleting is guarded (name + PIN) and audited — see DeleteDialog / deleteDocument.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteDocument, purgeDocument, restoreDocument, uploadDocument } from '@/app/actions'
import { DeleteButton } from '@/components/delete-button'
import { DOC_KINDS, fmtSize, type DocKind, type DocLibRow, type DocMeta } from '@/lib/docs'
import { notify } from '@/lib/notify'
import { Info } from '@/components/info'

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
  const router = useRouter()
  const [pending, start] = useTransition()
  const [kind, setKind] = useState<DocKind>(defaultKind)
  const [pickTruck, setPickTruck] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  function send(file: File | undefined) {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', kind)
    if (truckId) fd.append('truckId', String(truckId))
    if (loadId) fd.append('loadId', String(loadId))
    if (!truckId && pickTruck) fd.append('truckId', pickTruck)
    start(async () => {
      const res = await uploadDocument(fd)
      if ('error' in res) notify('error', res.error)
      else {
        notify('ok', 'Документ сохранён', file.name)
        if (fileRef.current) fileRef.current.value = ''
        router.refresh()
      }
    })
  }

  const select =
    'rounded-xl border border-white/8 bg-ink-900/80 px-2.5 py-2 text-[13px] text-white outline-none'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={kind} onChange={(e) => setKind(e.target.value as DocKind)} className={select}>
        {Object.entries(DOC_KINDS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      {trucks && !truckId && (
        <select value={pickTruck} onChange={(e) => setPickTruck(e.target.value)} className={select}>
          <option value="">Без трака</option>
          {trucks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      )}
      <label
        className={`cursor-pointer rounded-xl bg-haul-500 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400 ${
          pending ? 'opacity-50' : ''
        }`}
      >
        {pending ? 'Загружаю…' : '+ Файл'}
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          disabled={pending}
          onChange={(e) => send(e.target.files?.[0])}
        />
      </label>
      <span className="text-[11px] text-white/45">PDF или фото, до 8 МБ</span>
      <Info text="Выбери тип документа (Rate con / BOL / POD / инвойс / страховка / регистрация), при загрузке в общий раздел — трак, и добавь файл. Хранится в базе, привязан к грузу или траку, скачивается по клику." />
    </div>
  )
}

const KIND_TONE: Record<DocKind, string> = {
  ratecon: 'bg-haul-500/15 text-haul-400',
  bol: 'bg-good-500/15 text-good-400',
  pod: 'bg-good-500/15 text-good-400',
  invoice: 'bg-haul-500/15 text-haul-400',
  insurance: 'bg-warn-400/15 text-warn-400',
  registration: 'bg-warn-400/15 text-warn-400',
  repair: 'bg-amber-400/15 text-amber-300',
  other: 'bg-white/8 text-white/60',
}

/** Confirm a deletion with the signed-in user's own password. One dialog per list. */
function DeleteDialog({ doc, onClose }: { doc: DocMeta; onClose: () => void }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    setErr('')
    start(async () => {
      const res = await deleteDocument(doc.id, password)
      if (res?.error) setErr(res.error)
      else {
        notify('ok', 'Документ удалён', doc.title)
        onClose()
        router.refresh()
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
        <h3 className="text-[15px] font-semibold">Удалить документ</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-white/60">
          «{doc.title}» переместится в корзину — насовсем удаляется только оттуда.
          Введи свой пароль — запись, кто удалил, останется в Журнале.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && password && submit()}
            placeholder="Твой пароль"
            className={field}
          />
        </div>
        {err && <p className="mt-2 text-[12.5px] text-bad-400">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-[13px] text-white/70 transition-colors hover:text-white"
          >
            Отмена
          </button>
          <button
            disabled={pending || !password}
            onClick={submit}
            className="rounded-xl bg-bad-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-bad-400 disabled:opacity-40"
          >
            {pending ? 'Удаляю…' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** One document line. Reused by the flat list and the grouped library. */
function DocRow({
  doc,
  showLinks,
  from,
  to,
  onDelete,
}: {
  doc: DocMeta
  showLinks?: boolean
  from?: string | null
  to?: string | null
  onDelete: (d: DocMeta) => void
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-white/6 px-3 py-2">
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${KIND_TONE[doc.kind]}`}
      >
        {DOC_KINDS[doc.kind]}
      </span>
      <div className="min-w-0 flex-1">
        {/* Viewer, not the raw file — see components/ratecon-button.tsx. */}
        <a
          href={`/view/${doc.id}`}
          className="block truncate text-[14px] text-white/85 hover:text-haul-400 hover:underline"
        >
          {doc.title}
        </a>
        {(from || to) && (
          <div className="truncate text-[11px] text-white/45">
            {from ?? '—'} → {to ?? '—'}
          </div>
        )}
      </div>
      <span className="nums shrink-0 text-[11px] text-white/45">
        {fmtSize(doc.sizeBytes)} · {doc.uploadedAt.slice(0, 10)}
      </span>
      {showLinks && doc.truckId && (
        <a
          href={`/trucks/${doc.truckId}`}
          className="shrink-0 text-[11px] text-white/55 hover:text-white/85"
        >
          трак
        </a>
      )}
      {showLinks && doc.loadId && (
        <a
          href={`/loads/${doc.loadId}`}
          className="shrink-0 text-[11px] text-white/55 hover:text-white/85"
        >
          груз
        </a>
      )}
      <button
        title="Удалить"
        onClick={() => onDelete(doc)}
        className="shrink-0 text-[13px] text-white/35 transition-colors hover:text-bad-400"
      >
        ✕
      </button>
    </li>
  )
}

/** Flat list — per-truck and per-load pages. */
export function DocList({ docs, showLinks }: { docs: DocMeta[]; showLinks?: boolean }) {
  const [del, setDel] = useState<DocMeta | null>(null)
  if (docs.length === 0)
    return <p className="mt-3 text-[13px] text-white/55">Документов пока нет.</p>
  return (
    <>
      <ul className="mt-3 flex flex-col gap-1.5">
        {docs.map((d) => (
          <DocRow key={d.id} doc={d} showLinks={showLinks} onDelete={setDel} />
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
  const [del, setDel] = useState<DocMeta | null>(null)
  const [kind, setKind] = useState<DocKind | 'all'>('all')
  const [closed, setClosed] = useState<Set<string>>(new Set())

  const shown = kind === 'all' ? rows : rows.filter((r) => r.kind === kind)

  // Build groups in fleet order, then a "Без трака" bucket. Empty groups drop out.
  const groups: Group[] = []
  for (const t of trucks) {
    const rs = shown.filter((r) => r.groupTruckId === t.id)
    if (rs.length) groups.push({ id: t.id, label: t.label, sub: t.driver, rows: rs })
  }
  const orphan = shown.filter((r) => r.groupTruckId == null)
  if (orphan.length) groups.push({ id: null, label: 'Без трака', sub: '', rows: orphan })

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
            {k === 'all' ? 'Все' : DOC_KINDS[k]}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="text-[13px] text-white/55">Ничего не найдено.</p>
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
                  <ul className="flex flex-col gap-1.5 p-2">
                    {g.rows.map((r) => (
                      <DocRow
                        key={r.id}
                        doc={r}
                        showLinks
                        from={r.origin}
                        to={r.destination}
                        onDelete={setDel}
                      />
                    ))}
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
  const [pending, start] = useTransition()

  function restore(id: number, title: string) {
    start(async () => {
      await restoreDocument(id)
      notify('ok', 'Восстановлено', title)
      router.refresh()
    })
  }

  if (rows.length === 0) return <p className="text-[13px] text-white/55">Корзина пуста.</p>

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((d) => (
        <li key={d.id} className="flex items-center gap-3 rounded-lg border border-white/6 px-3 py-2">
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${KIND_TONE[d.kind]}`}>
            {DOC_KINDS[d.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[14px] text-white/70">{d.title}</span>
            <span className="text-[11px] text-white/45">
              удалено {d.deletedAt?.slice(0, 10)} · {fmtSize(d.sizeBytes)}
            </span>
          </div>
          <button
            disabled={pending}
            onClick={() => restore(d.id, d.title)}
            className="shrink-0 rounded-lg bg-white/8 px-2.5 py-1 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/16 disabled:opacity-40"
          >
            Восстановить
          </button>
          <DeleteButton
            action={purgeDocument}
            id={d.id}
            title={d.title}
            note="удалится навсегда — без возможности восстановить."
          />
        </li>
      ))}
    </ul>
  )
}
