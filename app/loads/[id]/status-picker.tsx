'use client'

import { DocLink } from '@/components/doc-link'

import { useOptimistic, useState, useTransition } from 'react'
import { Ban, Check } from 'lucide-react'
import { addLoadEventManual, setStatus } from '@/app/actions'
import { type LoadStatus } from '@/lib/map'
import { notify } from '@/lib/notify'
import { statusLabel, STATUS_ICON } from '@/components/status'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

// The pipeline a load actually walks, in order. `cancelled` is deliberately NOT in it:
// it isn't a later stage of the same journey, it's the journey being abandoned, and
// putting it sixth in a row of equal buttons implied a load progresses into it.
const PIPELINE: LoadStatus[] = ['quoted', 'booked', 'in_transit', 'delivered', 'paid']

// Each step's colour once reached. Matches components/status.tsx's badge hues so the
// rail and the badge on the same page can never disagree about what "booked" looks like.
const STEP_TONE: Record<LoadStatus, { dot: string; text: string; line: string }> = {
  quoted: { dot: 'bg-white/25 text-white', text: 'text-white/80', line: 'bg-white/25' },
  booked: { dot: 'bg-cyan-400 text-ink-950', text: 'text-cyan-300', line: 'bg-cyan-400/70' },
  in_transit: { dot: 'bg-amber-400 text-ink-950', text: 'text-amber-300', line: 'bg-amber-400/70' },
  delivered: { dot: 'bg-fuchsia-400 text-ink-950', text: 'text-fuchsia-300', line: 'bg-fuchsia-400/70' },
  paid: { dot: 'bg-good-400 text-ink-950', text: 'text-good-400', line: 'bg-good-400/70' },
  cancelled: { dot: 'bg-bad-500 text-white', text: 'text-bad-400', line: 'bg-bad-500/50' },
}

/**
 * The load's progress AND the control that moves it — one thing, not two.
 *
 * This used to be six identical pills in a row. That shape answered "what can I set
 * this to" but never "where is this load now, and what has it already been through" —
 * the question anyone opening a load asks first. A rail answers both: steps behind the
 * current one are filled and ticked, the current one is lit, the rest are hollow.
 */
// BOL rides at the loading step, POD at delivery — the paperwork each stage produces, filed
// right where it belongs on the rail. Present → a clickable green chip to view it. Missing
// AND already due at the load's current stage → glows amber (delivery is gated on it, so a
// missing one is an action item). Missing but not due yet → a quiet placeholder, so a POD
// doesn't scream on a load that hasn't even loaded.
function DocChip({ label, docId, due }: { label: string; docId: number | null; due: boolean }) {
  if (docId)
    return (
      <DocLink
        docId={docId}
        className="mt-1 rounded bg-good-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-good-400 ring-1 ring-good-400/30 transition-colors hover:bg-good-400/25"
      >
        {label}
      </DocLink>
    )
  if (due)
    return (
      <span className="mt-1 animate-pulse rounded bg-warn-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warn-400 ring-1 ring-warn-400/60">
        {label}
      </span>
    )
  return (
    <span className="mt-1 rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/25">
      {label}
    </span>
  )
}

/** Иконка шага той же формы, что у статусов. */
function StepIcon({ icon: Icon }: { icon: (typeof STATUS_ICON)[LoadStatus] }) {
  return <Icon size={13} strokeWidth={2.5} />
}

/** Промежуточная остановка на рейке: точка рейса. Пока груз «В пути» — кнопка:
 * нажатие ставит отметку «выгрузился/загрузился» на эту остановку, и следом на
 * рейке появляется новый «В пути» — к следующей точке. */
export type RailStop = {
  key: string
  seq: number
  role: 'pickup' | 'delivery'
  label: string
  sub: string | null
  done: boolean
  current: boolean
}

export function StatusPicker({
  id,
  current,
  bolId = null,
  podId = null,
  stops = [],
}: {
  id: number
  current: LoadStatus
  bolId?: number | null
  podId?: number | null
  /** Остановки между первой погрузкой и последней выгрузкой (lib/stops.ts) —
   * встают на рейку между «В пути» и «Доставлен», чтобы дроп 1 не пропадал. */
  stops?: RailStop[]
}) {
  const [pending, start] = useTransition()
  const locale = useLocale()
  // The rail redraws the instant a step is clicked, then the server action confirms it.
  // Before this the whole control greyed out for the round trip and only moved once the
  // server answered — on a mobile connection that reads as "my tap didn't register",
  // which is exactly when a dispatcher taps again. React reverts `shown` by itself if
  // the action throws, so a failed write can't leave the rail showing a lie.
  const [shown, setShown] = useOptimistic(current)
  const cancelled = shown === 'cancelled'
  // -1 while cancelled, which correctly leaves every step unreached below.
  const currentIdx = PIPELINE.indexOf(shown)

  // Остановки, отмеченные с рейки прямо сейчас — до того, как сервер перерисует
  // страницу с новой отметкой водителя.
  const [localDone, setLocalDone] = useState<Set<string>>(new Set())
  const stopDone = (st: RailStop) => st.done || localDone.has(st.key)
  // Мультистоп: как только первая промежуточная точка пройдена, первый «В пути»
  // закрыт галочкой, а текущий «В пути» рисуется после последней пройденной точки.
  const legDone = shown === 'in_transit' && stops.some(stopDone)
  const markStop = (st: RailStop) =>
    start(async () => {
      setLocalDone((prev) => new Set(prev).add(st.key))
      const res = await addLoadEventManual(id, st.role === 'pickup' ? 'loaded' : 'delivered', new Date().toISOString(), undefined, st.seq)
      if (res?.error) {
        setLocalDone((prev) => {
          const n = new Set(prev)
          n.delete(st.key)
          return n
        })
        notify('error', res.error)
      } else notify('ok', `${st.label}${st.sub ? ` · ${st.sub}` : ''}: ✓`)
    })

  const go = (s: LoadStatus) =>
    start(async () => {
      setShown(s) // optimistic; reverts to `current` after the action if the server rejects
      const res = await setStatus(id, s)
      if (res?.error) notify('error', res.error)
      else notify('ok', `${t(locale, 'loads.loadHash')}${id}: ${statusLabel(locale, s)}`)
    })

  return (
    <div aria-busy={pending}>
      {/* Classic stepper geometry: each step is a fixed-width column, and the
          connectors between them are the flexible part. Doing it the other way round
          (flexible steps, fixed connectors) makes the dots drift apart at different
          widths and the labels collide. */}
      <ol className={`flex items-start overflow-x-auto ${cancelled ? 'opacity-40' : ''}`}>
        {PIPELINE.map((s, i) => {
          const done = currentIdx > i || (s === 'in_transit' && legDone)
          const isCurrent = currentIdx === i && !(s === 'in_transit' && legDone)
          const tone = STEP_TONE[s]
          const Icon = STATUS_ICON[s]
          return (
            <li key={s} className="contents">
              {/* Промежуточные остановки — между «В пути» и «Доставлен». */}
              {s === 'delivered' &&
                stops.map((st, k) => {
                  const sd = stopDone(st)
                  // Текущая точка: первая непройденная, пока груз в пути.
                  const cur = shown === 'in_transit' && !sd && stops.slice(0, k).every(stopDone)
                  const tone = STEP_TONE[st.role === 'pickup' ? 'booked' : 'delivered']
                  const clickable = shown === 'in_transit' && !sd
                  // После последней пройденной точки — «В пути» к следующей.
                  const transitAfter = shown === 'in_transit' && sd && !(stops[k + 1] && stopDone(stops[k + 1]!))
                  return (
                    <span key={st.key} className="contents">
                      <span
                        aria-hidden
                        className={`mt-3.5 h-0.5 min-w-2 flex-1 rounded-full ${sd || cur ? tone.line : 'bg-white/10'}`}
                      />
                      <div
                        className="flex w-[54px] shrink-0 flex-col items-center gap-1 sm:w-[72px]"
                        title={`${st.label}${st.sub ? ` · ${st.sub}` : ''}`}
                      >
                        <button
                          type="button"
                          disabled={!clickable}
                          onClick={() => markStop(st)}
                          aria-current={cur ? 'step' : undefined}
                          className={`flex size-7 shrink-0 items-center justify-center rounded-full transition-all duration-150 disabled:cursor-default ${
                            sd || cur ? tone.dot : 'bg-white/[0.07] text-white/40 hover:bg-white/15 hover:text-white/70'
                          } ${cur ? 'ring-2 ring-white/25 ring-offset-2 ring-offset-ink-950' : ''} ${clickable ? 'hover:scale-110' : ''}`}
                        >
                          {sd ? (
                            <Check size={14} strokeWidth={3} />
                          ) : st.role === 'pickup' ? (
                            <StepIcon icon={STATUS_ICON.booked} />
                          ) : (
                            <StepIcon icon={STATUS_ICON.delivered} />
                          )}
                        </button>
                        <span
                          className={`w-full truncate text-center text-2xs font-medium ${cur ? tone.text : sd ? 'text-white/55' : 'text-white/30'}`}
                        >
                          {st.label}
                        </span>
                        {st.sub && <span className="w-full truncate text-center text-[9px] text-white/40">{st.sub}</span>}
                      </div>
                      {transitAfter && (
                        <>
                          <span aria-hidden className={`mt-3.5 h-0.5 min-w-2 flex-1 rounded-full ${STEP_TONE.in_transit.line}`} />
                          <div className="flex w-[54px] shrink-0 flex-col items-center gap-1 sm:w-[72px]">
                            <span
                              className={`flex size-7 shrink-0 items-center justify-center rounded-full ring-2 ring-white/25 ring-offset-2 ring-offset-ink-950 ${STEP_TONE.in_transit.dot}`}
                            >
                              <StepIcon icon={STATUS_ICON.in_transit} />
                            </span>
                            <span className={`w-full truncate text-center text-2xs font-medium ${STEP_TONE.in_transit.text}`}>
                              {statusLabel(locale, 'in_transit')}
                            </span>
                          </div>
                        </>
                      )}
                    </span>
                  )
                })}
              {i > 0 && (
                <span
                  aria-hidden
                  className={`mt-3.5 h-0.5 min-w-2 flex-1 rounded-full ${
                    done || isCurrent ? tone.line : 'bg-white/10'
                  }`}
                />
              )}
              {/* 72px × 5 steps + 4 connectors is 392px of hard minimum — wider than
                  the ~326px a phone actually leaves inside the panel, so the last step
                  used to be clipped off the right edge (html has overflow-x:hidden, so
                  it vanished rather than scrolled). Narrower columns below `sm` fit all
                  five; the labels were already truncating. */}
              <div className="flex w-[54px] shrink-0 flex-col items-center gap-1 sm:w-[72px]">
                <button
                  type="button"
                  disabled={s === shown}
                  onClick={() => go(s)}
                  aria-current={isCurrent ? 'step' : undefined}
                  title={statusLabel(locale, s)}
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full transition-all duration-150 disabled:cursor-default ${
                    done || isCurrent ? tone.dot : 'bg-white/[0.07] text-white/40 hover:bg-white/15 hover:text-white/70'
                  } ${isCurrent ? 'ring-2 ring-white/25 ring-offset-2 ring-offset-ink-950' : ''} ${
                    !done && !isCurrent ? 'hover:scale-110' : ''
                  }`}
                >
                  {done ? <Check size={14} strokeWidth={3} /> : <Icon size={13} strokeWidth={2.5} />}
                </button>
                <span
                  className={`w-full truncate text-center text-2xs font-medium ${
                    isCurrent ? tone.text : done ? 'text-white/55' : 'text-white/30'
                  }`}
                >
                  {statusLabel(locale, s)}
                </span>
                {s === 'booked' && <DocChip label="BOL" docId={bolId} due={currentIdx >= 1} />}
                {s === 'delivered' && <DocChip label="POD" docId={podId} due={currentIdx >= 2} />}
              </div>
            </li>
          )
        })}
      </ol>

      {/* Off to the side and quiet: cancelling is rare, irreversible in spirit, and
          must not sit in the row of ordinary next steps. */}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={cancelled}
          onClick={() => go('cancelled')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-2xs font-medium transition-colors ${
            cancelled
              ? 'bg-bad-500/15 text-bad-400 ring-1 ring-bad-400/25'
              : 'text-white/35 hover:bg-bad-500/10 hover:text-bad-400'
          }`}
        >
          <Ban size={12} strokeWidth={2.5} />
          {statusLabel(locale, 'cancelled')}
        </button>
      </div>
    </div>
  )
}
