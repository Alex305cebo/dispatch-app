'use client'

// «Документы» у пункта «Нужно починить»: чек, счёт или фото — подтверждение, что поломка
// была и что её чинили. Прикрепить можно к любому пункту, решённому или нет (владелец,
// 11/03/26: «документ должен быть подтверждением везде»). Бумага ложится и в документы
// трака (truck_id), так что из поломки она никуда не пропадает и в «Документах» тоже видна.

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Paperclip, Plus } from 'lucide-react'
import { linkDocToTodo } from '@/app/actions'
import type { TruckTodo } from '@/lib/maintenance-core'
import { sendDocument } from '@/lib/send-document'
import { DocLink } from '@/components/doc-link'
import { notify } from '@/lib/notify'
import { t, type Locale } from '@/lib/i18n'

/** Бумага трака, которую можно привязать к пункту (не грузовая). */
export type TodoDocCandidate = { id: number; title: string; kind: string }

/** Кнопка в строке пункта: сколько бумаг уже есть — видно сразу, нажатие открывает окно. */
export function TodoDocsButton({
  truckId,
  todo,
  candidates,
  locale,
}: {
  truckId: number
  todo: TruckTodo
  candidates: TodoDocCandidate[]
  locale: Locale
}) {
  const [open, setOpen] = useState(false)
  const n = todo.docs.length
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t(locale, 'trucks.care.todoDocsHint')}
        className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold transition-colors max-md:min-h-9 ${
          n > 0
            ? 'bg-haul-500/15 text-haul-300 hover:bg-haul-500/25'
            : 'bg-white/[0.06] text-t3 hover:bg-white/12 hover:text-t1'
        }`}
      >
        {n > 0 ? <FileText size={14} /> : <Paperclip size={14} />}
        <span className="max-sm:hidden">{t(locale, 'trucks.care.todoDocs')}</span>
        {n > 0 && <span className="tabular-nums">{n}</span>}
      </button>
      {open && <TodoDocsModal truckId={truckId} todo={todo} candidates={candidates} locale={locale} onClose={() => setOpen(false)} />}
    </>
  )
}

function TodoDocsModal({
  truckId,
  todo,
  candidates,
  locale,
  onClose,
}: {
  truckId: number
  todo: TruckTodo
  candidates: TodoDocCandidate[]
  locale: Locale
  onClose: () => void
}) {
  const [pending, start] = useTransition()
  const [drag, setDrag] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Несколько файлов — по одному: у каждого своя ошибка, остальные всё равно уходят.
  const upload = (files: File[]) => {
    if (!files.length) return
    start(async () => {
      let ok = 0
      for (const file of files) {
        const res = await sendDocument(
          file,
          { kind: 'repair', truckId, todoId: todo.id, title: `${todo.title} · ${t(locale, 'service.receipt')}` },
          locale,
        )
        if ('error' in res) notify('error', res.error)
        else ok++
      }
      if (ok) notify('ok', t(locale, 'trucks.care.docAdded'))
    })
  }

  const link = (docId: number, to: number | null) =>
    start(async () => {
      const res = await linkDocToTodo(docId, to)
      if (res?.error) notify('error', res.error)
      else notify('ok', t(locale, to == null ? 'trucks.care.todoDocsUnlinked' : 'trucks.care.todoDocsLinked'))
    })

  const free = candidates.filter((c) => !todo.docs.some((d) => d.id === c.id))

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(locale, 'trucks.care.todoDocs')}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="panel flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-auto p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-6 text-t1">
              {t(locale, 'trucks.care.todoDocs')}
              {todo.docs.length > 0 && <span className="ml-1.5 tabular-nums text-t3">· {todo.docs.length}</span>}
            </h2>
            <p className={`mt-0.5 break-words text-base ${todo.doneAt ? 'text-t3 line-through' : 'text-t2'}`}>🔧 {todo.title}</p>
          </div>
          <span
            className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-sm font-semibold ${
              todo.doneAt ? 'bg-good-500/15 text-good-400' : 'bg-warn-500/15 text-warn-400'
            }`}
          >
            {t(locale, todo.doneAt ? 'trucks.care.todoDone' : 'trucks.care.todoOpen')}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'userPanel.close')}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-lg text-t3 transition-colors hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {todo.docs.length > 0 ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {todo.docs.map((d) => (
              <li key={d.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                <DocLink docId={d.id} title={d.title} className="block w-full text-left">
                  <DocThumb id={d.id} mime={d.mime} />
                  <span className="block truncate px-2 py-1.5 text-sm font-medium text-t1">{d.title}</span>
                </DocLink>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => link(d.id, null)}
                  title={t(locale, 'trucks.care.todoDocsUnlink')}
                  aria-label={t(locale, 'trucks.care.todoDocsUnlink')}
                  className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-sm text-white transition-colors hover:bg-bad-500"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-warn-400/40 bg-warn-500/[0.06] px-3 py-2.5 text-base text-warn-300">
            {t(locale, 'trucks.care.todoDocsEmpty')}
          </p>
        )}

        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            upload([...e.dataTransfer.files])
          }}
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-4 text-base font-semibold transition-colors ${
            drag ? 'border-haul-400 bg-haul-500/15 text-haul-200' : 'border-haul-400/40 text-haul-300 hover:bg-haul-500/10'
          } ${pending ? 'pointer-events-none opacity-50' : ''}`}
        >
          <Plus size={16} strokeWidth={2.6} />
          {pending ? t(locale, 'common.loading') : t(locale, 'trucks.care.todoDocsAttach')}
          <input
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            disabled={pending}
            onChange={(e) => {
              upload([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
        </label>

        {free.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-semibold text-t2">{t(locale, 'trucks.care.todoDocsFromTruck')}</p>
            <ul className="flex max-h-48 flex-col gap-1 overflow-auto">
              {free.map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-lg border border-white/6 px-2.5 py-1.5">
                  <DocLink docId={c.id} title={c.title} className="min-w-0 flex-1 truncate text-left text-base text-t1 hover:text-haul-300">
                    📄 {c.title}
                  </DocLink>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => link(c.id, todo.id)}
                    className="shrink-0 rounded-md bg-haul-500/15 px-2.5 py-1 text-sm font-semibold text-haul-300 transition-colors hover:bg-haul-500/25 max-md:min-h-9"
                  >
                    + {t(locale, 'trucks.care.todoDocsAdd')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Картинка — миниатюрой, PDF и прочее — значком: что за бумага, видно без открытия. */
function DocThumb({ id, mime }: { id: number; mime: string }) {
  const [broken, setBroken] = useState(false)
  const img = mime?.startsWith('image/') && !broken
  return (
    <span className="flex h-24 w-full items-center justify-center bg-white/[0.04]">
      {img ? (
        <img src={`/api/docs/${id}?thumb=1`} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <span className="flex flex-col items-center gap-1 text-t3">
          <FileText size={28} />
          <span className="text-2xs font-semibold uppercase">{mime === 'application/pdf' ? 'PDF' : mime?.split('/')[1] ?? ''}</span>
        </span>
      )}
    </span>
  )
}
