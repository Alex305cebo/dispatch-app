'use client'

// "Важное от брокера" — special instructions off the rate con that the dispatcher
// MUST read. Until acknowledged (notes_read_at is null) it's highlighted amber with
// a "Прочитано" button; after, it goes quiet. Editable so notes can be fixed/added.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markNotesRead, parseRcForNotes, setBrokerNotes, translateBrokerNotes } from '@/app/actions'
import { notify } from '@/lib/notify'

// The AI prompt (lib/ratecon-ai-contract.ts) tags each fact line with one of these —
// lets the wall of prose from the RC render as a scannable list instead of one blob.
// Untagged lines (older notes, or anything typed by hand) just render as plain text.
const TAGS: Record<string, { label: string; icon: string; warn?: boolean }> = {
  SAFETY: { label: 'Безопасность', icon: '🦺' },
  LOAD: { label: 'Погрузка', icon: '📦' },
  SCHEDULE: { label: 'График', icon: '🕐' },
  CONTACT: { label: 'Контакт', icon: '📞' },
  REF: { label: 'Номера', icon: '🔖' },
  DOCS: { label: 'Документы', icon: '📄' },
  INSURANCE: { label: 'Страховка', icon: '🛡' },
  PENALTY: { label: 'Штрафы', icon: '💸', warn: true },
  WARNING: { label: 'Важно', icon: '❗', warn: true },
}

type NoteLine = { tag: string | null; text: string }

function parseNotes(text: string): NoteLine[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^\[(\w+)\]\s*(.*)$/)
      return m && TAGS[m[1]!] ? { tag: m[1]!, text: m[2]!.trim() } : { tag: null, text: line }
    })
}

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
  // Not persisted — re-translated on demand each time the page reloads, which is
  // cheap enough (short text, free-tier Gemini) that a DB column would be overkill.
  const [ru, setRu] = useState<string | null>(null)
  const [showRu, setShowRu] = useState(false)
  const [translating, setTranslating] = useState(false)

  const unread = !readAt
  // Auto-open shows the full note once, then folds itself away after 10s so it
  // doesn't just sit there blocking the page — the amber glow (CSS, while folded)
  // keeps it impossible to miss until "Прочитано" is actually clicked. Direct DOM
  // mutation (not React state) because <details> already owns its own open/close
  // from the user clicking <summary> — mirroring that in state would fight it.
  const detailsRef = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (!unread) return
    const t = setTimeout(() => {
      if (detailsRef.current) detailsRef.current.open = false
    }, 10_000)
    return () => clearTimeout(t)
  }, [unread])

  function toggleTranslate() {
    if (ru) {
      setShowRu((v) => !v)
      return
    }
    setTranslating(true)
    start(async () => {
      const res = await translateBrokerNotes(notes ?? '', 'ru')
      setTranslating(false)
      if ('error' in res) notify('error', res.error)
      else {
        setRu(res.text)
        setShowRu(true)
      }
    })
  }

  function parse() {
    start(async () => {
      const res = await parseRcForNotes(loadId)
      if ('error' in res) notify('error', res.error)
      else {
        notify(
          res.found ? 'ok' : 'warn',
          res.found ? 'Рейткон разобран — проверь важное' : 'В рейтконе не нашлось особых заметок',
        )
        setRu(null)
        setShowRu(false)
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
        setRu(null)
        setShowRu(false)
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

  const shown = showRu && ru ? ru : notes
  const lines = parseNotes(shown)
  const structured = lines.some((l) => l.tag !== null)
  // One-line taste of the note while collapsed — the full text is a wall, and tags
  // are noise at a glance, so strip them here even for structured notes.
  const preview = shown.replace(/\[\w+\]/g, '').replace(/\s+/g, ' ').trim()

  return (
    <details
      ref={detailsRef}
      open={unread}
      // A slight amber tint always, so this doesn't blend into the page even once
      // read — stronger while unread, but no longer *blinking*: a whole-card opacity
      // pulse read as an alarm/glitch. Only the small ring behind ⚠ animates now.
      className={`group overflow-hidden rounded-2xl border transition-colors ${
        unread
          ? 'border-warn-400/40 bg-warn-400/10 ring-1 ring-warn-400/25'
          : 'border-warn-400/15 bg-warn-400/[0.03]'
      }`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3.5">
        {unread && (
          <span className="relative flex size-4 shrink-0 items-center justify-center" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-warn-400/50" />
            <span className="relative text-warn-300">⚠</span>
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
          {unread ? 'новое' : `прочитано ${readAt!.slice(0, 10)}`}
        </span>
        {/* Explicit fold/unfold hint — this being a <details> (click to toggle) isn't
            obvious on its own, especially now that unread notes open by default. */}
        <span className="hidden shrink-0 items-center gap-1 text-[11px] text-white/45 group-open:flex">
          Свернуть <span className="text-white/40 transition-transform rotate-90">▸</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-white/45 group-open:hidden">
          Развернуть <span className="text-white/40 transition-transform">▸</span>
        </span>
      </summary>

      <div className="px-3.5 pb-3.5">
        {structured ? (
          <ul className="flex flex-col gap-2">
            {lines.map((l, i) => {
              const meta = l.tag ? TAGS[l.tag] : null
              return (
                <li key={i} className="flex items-baseline gap-2 text-[13.5px] leading-relaxed">
                  {meta ? (
                    <>
                      <span className="shrink-0" aria-hidden>
                        {meta.icon}
                      </span>
                      <span>
                        <span
                          className={`mr-1.5 font-semibold ${meta.warn ? 'text-warn-300' : 'text-white/55'}`}
                        >
                          {meta.label}:
                        </span>
                        <span className="text-white/85">{l.text}</span>
                      </span>
                    </>
                  ) : (
                    <span className="text-white/85">{l.text}</span>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-white/85">{shown}</p>
        )}

        <div className="mt-3 flex items-center gap-2">
        <button
          disabled={translating}
          onClick={toggleTranslate}
          className="text-[12px] text-white/55 transition-colors hover:text-white/85 disabled:opacity-40"
        >
          {translating ? 'Перевожу…' : showRu && ru ? 'Оригинал (EN)' : '🌐 На русский'}
        </button>
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
