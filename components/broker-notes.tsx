'use client'

import { Button } from '@/components/button'
// "Важное от брокера" — special instructions off the rate con that the dispatcher
// MUST read. Until acknowledged (notes_read_at is null) it's highlighted amber with
// a "Прочитано" button; after, it goes quiet. Editable so notes can be fixed/added.

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  Banknote,
  Bookmark,
  ChevronDown,
  Clock,
  FileText,
  HardHat,
  Package,
  Phone,
  Shield,
  Signpost,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { markNotesRead, parseRcForNotes, setBrokerNotes, translateBrokerNotes } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale } from '@/lib/i18n'
import { usDate } from '@/lib/fmt'
import { todayEt } from '@/lib/payments'

// The AI prompt (lib/ratecon-ai-contract.ts) tags each fact line with one of these —
// lets the wall of prose from the RC render as a scannable list instead of one blob.
// Untagged lines (older notes, or anything typed by hand) just render as plain text.
function tagsFor(locale: Locale): Record<string, { label: string; icon: LucideIcon; warn?: boolean }> {
  return {
    SAFETY: { label: t(locale, 'brokerNotes.tagSafety'), icon: HardHat },
    LOAD: { label: t(locale, 'brokerNotes.tagLoad'), icon: Package },
    SCHEDULE: { label: t(locale, 'brokerNotes.tagSchedule'), icon: Clock },
    CONTACT: { label: t(locale, 'brokerNotes.tagContact'), icon: Phone },
    REF: { label: t(locale, 'brokerNotes.tagRef'), icon: Bookmark },
    DOCS: { label: t(locale, 'brokerNotes.tagDocs'), icon: FileText },
    INSURANCE: { label: t(locale, 'brokerNotes.tagInsurance'), icon: Shield },
    PENALTY: { label: t(locale, 'brokerNotes.tagPenalty'), icon: Banknote, warn: true },
    WARNING: { label: t(locale, 'brokerNotes.tagWarning'), icon: TriangleAlert, warn: true },
    ROUTE: { label: t(locale, 'brokerNotes.tagRoute'), icon: Signpost, warn: true },
  }
}

type NoteLine = { tag: string | null; text: string }

// Locale-independent — only used to check whether a tag is one we recognize.
const KNOWN_TAGS = new Set(['SAFETY', 'LOAD', 'SCHEDULE', 'CONTACT', 'REF', 'DOCS', 'INSURANCE', 'PENALTY', 'WARNING', 'ROUTE'])

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
  embedded = false,
}: {
  loadId: number
  notes: string | null
  readAt: string | null
  /** Is a rate con attached? Enables the "разобрать рейткон" AI button. */
  hasRc: boolean
  /** Внутри шапки груза, а не своей плиткой (владелец 25.09.2026: шапка и «Важное от
   *  брокера» — одна плитка). Без своей панели: раздел под чертой, а жёлтая рамка —
   *  только пока не прочитано. */
  embedded?: boolean
}) {
  const locale = useLocale()
  const TAGS = tagsFor(locale)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(notes ?? '')
  const [pending, start] = useTransition()
  // Not persisted — re-translated on demand each time the page reloads, which is
  // cheap enough (short text, free-tier Gemini) that a DB column would be overkill.
  const [ru, setRu] = useState<string | null>(null)
  const [showRu, setShowRu] = useState(false)
  const [translating, setTranslating] = useState(false)

  const unread = !readAt
  // Непрочитанное открывается само, но долго не висит (владелец 25.09.2026): сворачивается
  // через 6 секунд ПОСЛЕ ТОГО, КАК ПОЯВИЛОСЬ НА ЭКРАНЕ (не с загрузки страницы — ниже
  // первого экрана его бы свернуло, пока до него не докрутили), и сразу, как только его
  // прокрутили выше экрана. Жёлтая рамка остаётся, пока не нажали «Прочитано».
  // Открытие меняем прямо в DOM, а не состоянием: <details> сам ведёт open/close по
  // нажатию на <summary>, и копия в React с ним бы спорила.
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const el = detailsRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let seen = false
    const fold = () => {
      if (!el.open) return
      const above = el.getBoundingClientRect().bottom <= 0
      const before = el.offsetHeight
      el.open = false
      // Блок выше экрана стал короче — страница под пальцем не должна прыгать вверх.
      // Chrome и Firefox держат место сами (overflow-anchor), Safari — нет.
      if (above && !CSS.supports('overflow-anchor', 'auto')) window.scrollBy(0, el.offsetHeight - before)
    }
    const io = new IntersectionObserver(([e]) => {
      if (!e) return
      if (e.isIntersecting) {
        if (!seen && unread && el.open) autoTimer.current = setTimeout(fold, 6_000)
        seen = true
      } else if (seen && e.boundingClientRect.bottom <= (e.rootBounds?.top ?? 0)) {
        fold()
      }
    })
    io.observe(el)
    return () => {
      io.disconnect()
      if (autoTimer.current) clearTimeout(autoTimer.current)
    }
  }, [unread])
  // Нажал сам — дальше решает он: таймер больше не свернёт у него из-под руки.
  const stopAuto = () => {
    if (autoTimer.current) clearTimeout(autoTimer.current)
    autoTimer.current = null
  }

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
      }
    })
  }

  function acknowledge() {
    start(async () => {
      await markNotesRead(loadId)
    })
  }

  const textarea =
    'w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-base leading-relaxed text-white outline-none focus:border-haul-500'

  // Своя рамка — только отдельной плиткой; в шапке груза раздел отделён чертой.
  const shell = embedded ? 'mt-4 border-t border-white/[0.07] pt-3' : 'panel p-4'

  if (editing) {
    return (
      <section className={shell}>
        <h2 className="mb-2 text-base leading-6 font-semibold text-t1">
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
          <Button variant="primary" size="sm" disabled={pending} onClick={saveText}>
            {pending ? t(locale, 'loadEdit.saving') : t(locale, 'loadEdit.save')}
          </Button>
          <button
            onClick={() => {
              setText(notes ?? '')
              setEditing(false)
            }}
            className="rounded-lg px-4 py-1.5 text-sm text-t2 transition-colors hover:text-white"
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
      <div className={`${shell} flex flex-wrap items-center gap-3`}>
        {hasRc && (
          <Button variant="primary" disabled={pending} onClick={parse}>
            {pending ? t(locale, 'brokerNotes.parsing') : t(locale, 'brokerNotes.parseRc')}
          </Button>
        )}
        <button
          onClick={() => setEditing(true)}
          className="text-base text-t3 transition-colors hover:text-t1"
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
  // Как заехать — ещё выше: не найдя въезд, водитель до номеров просто не доедет.
  const rank = (tag: string | null) => (tag === 'ROUTE' ? 0 : tag === 'REF' ? 1 : 2)
  const sortedLines = [...lines].sort((a, b) => rank(a.tag) - rank(b.tag))
  const structured = lines.some((l) => l.tag !== null)
  // One-line taste of the note while collapsed — the full text is a wall, and tags
  // are noise at a glance, so strip them here even for structured notes.
  const preview = shown
    .replace(/\[\w+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return (
    <details
      ref={detailsRef}
      open={unread}
      // Условия брокера — справочный текст, не тревога: панель нейтральная. Жёлтым
      // подсвечивается только непрочитанное, и только пока не нажали «Прочитано».
      className={`group overflow-hidden rounded-xl border transition-colors ${embedded ? 'mt-4' : ''} ${
        unread ? 'border-warn-400/45 bg-warn-400/[0.05]' : 'border-white/10 bg-white/[0.025]'
      }`}
    >
      {/* Шапка блока — полоса со своей заливкой и кнопкой справа: видно, что это
          заголовок и что по нему открывают и закрывают (владелец 25.09.2026). */}
      <summary
        onClick={stopAuto}
        className={`flex cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 transition-colors select-none group-open:border-b [&::-webkit-details-marker]:hidden ${
          unread
            ? 'bg-warn-400/[0.10] group-open:border-warn-400/25 hover:bg-warn-400/[0.16]'
            : 'bg-white/[0.04] group-open:border-white/[0.08] hover:bg-white/[0.08]'
        }`}
      >
        <span
          className={`relative flex size-8 shrink-0 items-center justify-center rounded-lg ${
            unread ? 'bg-warn-400/20 text-warn-300' : 'bg-white/[0.07] text-t2'
          }`}
          aria-hidden
        >
          {unread && <span className="absolute inset-0 rounded-lg bg-warn-400/30 motion-safe:animate-ping" />}
          <TriangleAlert size={16} strokeWidth={2.2} className="relative" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            {/* Заголовок не режется: сжимается строка текста под ним. */}
            <span className={`text-base font-semibold whitespace-nowrap ${unread ? 'text-warn-300' : 'text-t1'}`}>
              {t(locale, 'brokerNotes.heading')}
            </span>
            {unread && (
              <span className="shrink-0 rounded-full bg-warn-400 px-1.5 py-px text-2xs font-bold uppercase tracking-wide text-ink-950">
                {t(locale, 'brokerNotes.new')}
              </span>
            )}
          </span>
          {/* Свёрнуто — когда прочитано и первая строка текста, чтобы было видно, о чём там. */}
          <span className="truncate text-sm text-t3 group-open:hidden">
            {!unread && `${t(locale, 'brokerNotes.readOn').replace('{date}', usDate(todayEt(new Date(readAt))))} · `}
            {preview}
          </span>
        </span>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
            unread
              ? 'border-warn-400/45 text-warn-300 group-hover:bg-warn-400/15'
              : 'border-white/15 text-t2 group-hover:bg-white/[0.08]'
          }`}
        >
          {/* На телефоне — только стрелка: подпись отнимала место у заголовка. */}
          <span className="group-open:hidden max-sm:hidden">{t(locale, 'brokerNotes.expand')}</span>
          <span className="hidden sm:group-open:inline">{t(locale, 'brokerNotes.collapse')}</span>
          <ChevronDown size={14} strokeWidth={2.5} className="transition-transform duration-200 group-open:rotate-180" />
        </span>
      </summary>

      <div className="px-3.5 py-3">
        {structured ? (
          <ul className="flex flex-col gap-2">
            {sortedLines.map((l, i) => {
              const meta = l.tag ? TAGS[l.tag] : null
              return (
                <li key={i} className="flex items-baseline gap-2 text-base leading-relaxed">
                  {meta ? (
                    <>
                      <meta.icon size={14} strokeWidth={2} className="relative top-0.5 shrink-0 text-t3" aria-hidden />
                      <span>
                        <span className={`mr-1.5 font-semibold ${meta.warn ? 'text-warn-300' : 'text-t3'}`}>
                          {meta.label}:
                        </span>
                        <span className="text-t1">{l.text}</span>
                      </span>
                    </>
                  ) : (
                    <span className="text-t1">{l.text}</span>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="whitespace-pre-wrap text-base leading-relaxed text-t1">{shown}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            disabled={translating}
            onClick={toggleTranslate}
            className="text-sm text-t3 transition-colors hover:text-t1 disabled:opacity-40"
          >
            {translating ? 'Перевожу…' : showRu && ru ? 'Оригинал (EN)' : '🌐 На русский'}
          </button>
          {unread && (
            <button
              disabled={pending}
              onClick={acknowledge}
              className="rounded-lg bg-warn-400 px-4 py-1.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-warn-300 disabled:opacity-40"
            >
              {pending ? '…' : t(locale, 'brokerNotes.acknowledge')}
            </button>
          )}
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-t3 transition-colors hover:text-t1"
          >
            {t(locale, 'loadEdit.edit')}
          </button>
          {hasRc && (
            <button
              disabled={pending}
              onClick={parse}
              className="text-sm text-t3 transition-colors hover:text-t2 disabled:opacity-40"
            >
              {pending ? '…' : t(locale, 'brokerNotes.updateFromRc')}
            </button>
          )}
        </div>
      </div>
    </details>
  )
}
