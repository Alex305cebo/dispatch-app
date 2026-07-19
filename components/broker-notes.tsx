'use client'

// "Важное от брокера" — special instructions off the rate con that the dispatcher
// MUST read. Until acknowledged (notes_read_at is null) it's highlighted amber with
// a "Прочитано" button; after, it goes quiet. Editable so notes can be fixed/added.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markNotesRead, parseRcForNotes, setBrokerNotes } from '@/app/actions'
import { notify } from '@/lib/notify'

export function BrokerNotes({
  loadId,
  notes,
  readAt,
  hasRc,
}: {
  loadId: number
  notes: string | null
  readAt: string | null
  /** Is a rate con attached? Enables the "разобрать рейткон" AI button. */
  hasRc: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(notes ?? '')
  const [pending, start] = useTransition()

  function parse() {
    start(async () => {
      const res = await parseRcForNotes(loadId)
      if ('error' in res) notify('error', res.error)
      else {
        notify(
          res.found ? 'ok' : 'warn',
          res.found ? 'Рейткон разобран — проверь важное' : 'В рейтконе не нашлось особых заметок',
        )
        router.refresh()
      }
    })
  }

  function saveText() {
    start(async () => {
      const res = await setBrokerNotes(loadId, text)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', 'Заметка сохранена')
        setEditing(false)
        router.refresh()
      }
    })
  }

  function acknowledge() {
    start(async () => {
      await markNotesRead(loadId)
      router.refresh()
    })
  }

  const textarea =
    'w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-[13px] leading-relaxed text-white outline-none focus:border-haul-500'

  if (editing) {
    return (
      <section className="panel p-4">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          Заметка от брокера
        </h2>
        <textarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Особые условия брокера: детеншн, аппойнтмент, требования к POD, лампер и т.д."
          className={textarea}
        />
        <div className="mt-2 flex gap-2">
          <button
            disabled={pending}
            onClick={saveText}
            className="rounded-lg bg-haul-500 px-4 py-1.5 text-[12px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
          >
            {pending ? 'Сохраняю…' : 'Сохранить'}
          </button>
          <button
            onClick={() => {
              setText(notes ?? '')
              setEditing(false)
            }}
            className="rounded-lg px-4 py-1.5 text-[12px] text-white/70 transition-colors hover:text-white"
          >
            Отмена
          </button>
        </div>
      </section>
    )
  }

  // No notes yet — offer to parse the RC (if attached) or add them by hand.
  if (!notes) {
    return (
      <div className="panel flex flex-wrap items-center gap-3 p-4">
        {hasRc && (
          <button
            disabled={pending}
            onClick={parse}
            className="rounded-lg bg-haul-500 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
          >
            {pending ? 'Читаю рейткон…' : '✨ Разобрать рейткон (ИИ)'}
          </button>
        )}
        <button
          onClick={() => setEditing(true)}
          className="text-[13px] text-white/55 transition-colors hover:text-white/85"
        >
          {hasRc ? 'или вписать вручную' : '＋ Добавить важную заметку от брокера'}
        </button>
      </div>
    )
  }

  const unread = !readAt
  // One-line taste of the note while collapsed — the full text is a wall.
  const preview = notes.replace(/\s+/g, ' ').trim()

  return (
    <details
      className={`group overflow-hidden rounded-2xl border ${
        unread
          ? 'border-warn-400/40 bg-warn-400/10 ring-1 ring-warn-400/25'
          : 'border-white/8 bg-ink-900/50'
      }`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3.5">
        {unread && (
          <span className="shrink-0 text-warn-300" aria-hidden>
            ⚠
          </span>
        )}
        <span
          className={`shrink-0 text-[11px] font-semibold uppercase tracking-wider ${
            unread ? 'text-warn-300' : 'text-white/62'
          }`}
        >
          Важное от брокера
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-white/45 group-open:hidden">
          {preview}
        </span>
        <span className="shrink-0 text-[11px] text-white/45">
          {unread ? 'нажми, чтобы прочитать' : `прочитано ${readAt!.slice(0, 10)}`}
        </span>
        <span className="shrink-0 text-white/40 transition-transform group-open:rotate-90">▸</span>
      </summary>

      <div className="px-3.5 pb-3.5">
        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-white/85">{notes}</p>

        <div className="mt-3 flex items-center gap-2">
        {unread && (
          <button
            disabled={pending}
            onClick={acknowledge}
            className="rounded-lg bg-warn-400 px-4 py-1.5 text-[12px] font-semibold text-ink-950 transition-colors hover:bg-warn-300 disabled:opacity-40"
          >
            {pending ? '…' : 'Прочитано'}
          </button>
        )}
        <button
          onClick={() => setEditing(true)}
          className="text-[12px] text-white/55 transition-colors hover:text-white/85"
        >
          Изменить
        </button>
        {hasRc && (
          <button
            disabled={pending}
            onClick={parse}
            className="text-[12px] text-white/45 transition-colors hover:text-white/75 disabled:opacity-40"
          >
            {pending ? '…' : 'обновить из рейткона'}
          </button>
        )}
        </div>
      </div>
    </details>
  )
}
