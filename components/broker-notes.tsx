'use client'

import { Button } from '@/components/button'
// "Важное от брокера" — special instructions off the rate con that the dispatcher
// MUST read. Until acknowledged (notes_read_at is null) it's highlighted amber with
// a "Прочитано" button; after, it goes quiet. Editable so notes can be fixed/added.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markNotesRead, parseRcForNotes, setBrokerNotes, translateBrokerNotes } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale } from '@/lib/i18n'

// The AI prompt (lib/ratecon-ai-contract.ts) tags each fact line with one of these —
// lets the wall of prose from the RC render as a scannable list instead of one blob.
// Untagged lines (older notes, or anything typed by hand) just render as plain text.
function tagsFor(locale: Locale): Record<string, { label: string; icon: string; warn?: boolean }> {
  return {
    SAFETY: { label: t(locale, 'brokerNotes.tagSafety'), icon: '🦺' },
    LOAD: { label: t(locale, 'brokerNotes.tagLoad'), icon: '📦' },
    SCHEDULE: { label: t(locale, 'brokerNotes.tagSchedule'), icon: '🕐' },
    CONTACT: { label: t(locale, 'brokerNotes.tagContact'), icon: '📞' },
    REF: { label: t(locale, 'brokerNotes.tagRef'), icon: '🔖' },
    DOCS: { label: t(locale, 'brokerNotes.tagDocs'), icon: '📄' },
    INSURANCE: { label: t(locale, 'brokerNotes.tagInsurance'), icon: '🛡' },
    PENALTY: { label: t(locale, 'brokerNotes.tagPenalty'), icon: '💸', warn: true },
    WARNING: { label: t(locale, 'brokerNotes.tagWarning'), icon: '❗', warn: true },
  }
}

type NoteLine = { tag: string | null; text: string }

// Locale-independent — only used to check whether a tag is one we recognize.
const KNOWN_TAGS = new Set(['SAFETY', 'LOAD', 'SCHEDULE', 'CONTACT', 'REF', 'DOCS', 'INSURANCE', 'PENALTY', 'WARNING'])

function parseNotes(text: string): NoteLine[] {
  // The AI sometimes returns every tagged fact on ONE run-on line ("...stop.[LOAD]
  // Trailer...[SCHEDULE] FCFS...") with no newlines, which rendered as a single
  // unbroken blob under the first tag. Put each [TAG] on its own line first — before
  // a tag that isn't at the very start — so both the newline-separated and the
  // run-on forms split into one item per fact.
  return text
    .replace(/(?!^)\s*(\[\w+\])/g, '\n$1')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^\[(\w+)\]\s*(.*)$/)
      return m && KNOWN_TAGS.has(m[1]!) ? { tag: m[1]!, text: m[2]!.trim() } : { tag: null, text: line }
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
  const locale = useLocale()
  const TAGS = tagsFor(locale)
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
          res.found ? t(locale, 'brokerNotes.parsedFound') : t(locale, 'brokerNotes.parsedNotFound'),
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
        notify('ok', t(locale, 'brokerNotes.savedToast'))
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
          {t(locale, 'brokerNotes.editHeading')}
        </h2>
        <textarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t(locale, 'brokerNotes.placeholder')}
          className={textarea}
        />
        <div className="mt-2 flex gap-2">
          <Button variant="primary" size="sm" disabled={pending}
            onClick={saveText}>
            {pending ? t(locale, 'loadEdit.saving') : t(locale, 'loadEdit.save')}
          </Button>
          <button
            onClick={() => {
              setText(notes ?? '')
              setEditing(false)
            }}
            className="rounded-lg px-4 py-1.5 text-[12px] text-white/70 transition-colors hover:text-white"
          >
            {t(locale, 'loadEdit.cancel')}
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
          <Button variant="primary" disabled={pending}
            onClick={parse}>
            {pending ? t(locale, 'brokerNotes.parsing') : t(locale, 'brokerNotes.parseRc')}
          </Button>
        )}
        <button
          onClick={() => setEditing(true)}
          className="text-[13px] text-white/55 transition-colors hover:text-white/85"
        >
          {hasRc ? t(locale, 'brokerNotes.orTypeManually') : t(locale, 'brokerNotes.addNote')}
        </button>
      </div>
    )
  }

  const shown = showRu && ru ? ru : notes
  const lines = parseNotes(shown)
  // Reference/appointment numbers first — without a PU/appointment confirmation #
  // the driver can't check in to load or unload at all, so it can't sit buried
  // under safety notes or paperwork reminders. Array.sort is stable, so everything
  // else keeps its original order.
  const sortedLines = [...lines].sort((a, b) => (a.tag === 'REF' ? -1 : 0) - (b.tag === 'REF' ? -1 : 0))
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
          {t(locale, 'brokerNotes.heading')}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-white/45 group-open:hidden">
          {preview}
        </span>
        <span className="shrink-0 text-[11px] text-white/45">
          {unread ? t(locale, 'brokerNotes.new') : t(locale, 'brokerNotes.readOn').replace('{date}', readAt!.slice(0, 10))}
        </span>
        {/* Explicit fold/unfold hint — this being a <details> (click to toggle) isn't
            obvious on its own, especially now that unread notes open by default. */}
        <span className="hidden shrink-0 items-center gap-1 text-[11px] text-white/45 group-open:flex">
          {t(locale, 'brokerNotes.collapse')} <span className="text-white/40 transition-transform rotate-90">▸</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-white/45 group-open:hidden">
          {t(locale, 'brokerNotes.expand')} <span className="text-white/40 transition-transform">▸</span>
        </span>
      </summary>

      <div className="px-3.5 pb-3.5">
        {structured ? (
          <ul className="flex flex-col gap-2">
            {sortedLines.map((l, i) => {
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
            {pending ? '…' : t(locale, 'brokerNotes.acknowledge')}
          </button>
        )}
        <button
          onClick={() => setEditing(true)}
          className="text-[12px] text-white/55 transition-colors hover:text-white/85"
        >
          {t(locale, 'loadEdit.edit')}
        </button>
        {hasRc && (
          <button
            disabled={pending}
            onClick={parse}
            className="text-[12px] text-white/45 transition-colors hover:text-white/75 disabled:opacity-40"
          >
            {pending ? '…' : t(locale, 'brokerNotes.updateFromRc')}
          </button>
        )}
        </div>
      </div>
    </details>
  )
}
