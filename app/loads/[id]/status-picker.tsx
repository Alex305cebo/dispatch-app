'use client'

import { DocLink } from '@/components/doc-link'

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react'
import { Ban, Check } from 'lucide-react'
import { addLoadEventManual, setStatus, unmarkStop, uploadDocument } from '@/app/actions'
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

const STEP_W = 'flex w-[54px] shrink-0 flex-col items-center gap-1 sm:w-[72px]'
const RING = 'ring-2 ring-white/25 ring-offset-2 ring-offset-ink-950'
const HOLLOW = 'bg-white/[0.07] text-white/40 hover:bg-white/15 hover:text-white/70'

/**
 * The load's progress AND the control that moves it — one thing, not two.
 *
 * Steps behind the current one are filled and ticked, the current one is lit, the
 * rest are hollow. Every circle is a button at any time — forward and back.
 *
 * Мультистоп. Промежуточная точка (Omaha) живёт между «Загрузкой» и «Доставлен»:
 *  - нажал точку → трак НА выгрузке в Omaha: точка текущая, первый «В пути» уходит,
 *    а пустой «В пути» появляется ПОСЛЕ точки;
 *  - нажал этот «В пути» → трак выехал: точка с галочкой, «В пути» текущий.
 * Ничего не активируется само — каждый шаг нажимает диспетчер.
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

/** POD промежуточной выгрузки: есть — зелёная ссылка, нет — кнопка загрузки (янтарная,
 * когда трак уже на точке или проехал её и бумага должна быть на руках). */
function StopPod({ loadId, seq, docId, due }: { loadId: number; seq: number; docId: number | null; due: boolean }) {
  const locale = useLocale()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  if (docId) return <DocChip label="POD" docId={docId} due={false} />
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!list.length) return
    start(async () => {
      let saved = 0
      let firstError: string | null = null
      for (const file of list) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('kind', 'pod')
        fd.append('loadId', String(loadId))
        fd.append('stopSeq', String(seq))
        const res = await uploadDocument(fd)
        if (res && 'error' in res) firstError ??= res.error
        else saved++
      }
      if (saved) notify('ok', t(locale, 'loadDetail.docUploaded').replace('{label}', 'POD'))
      if (firstError) notify('error', firstError)
    })
  }
  return (
    <>
      <input ref={inputRef} type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={onFile} />
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        title={t(locale, 'loadDetail.uploadDoc').replace('{label}', 'POD')}
        className={`mt-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors ${
          due
            ? 'animate-pulse bg-warn-400/20 text-warn-400 ring-1 ring-warn-400/60 hover:bg-warn-400/30'
            : 'bg-white/[0.05] text-white/25 hover:bg-white/10 hover:text-white/60'
        }`}
      >
        {pending ? '…' : '+ POD'}
      </button>
    </>
  )
}

/** Иконка шага той же формы, что у статусов. */
function StepIcon({ icon: Icon }: { icon: (typeof STATUS_ICON)[LoadStatus] }) {
  return <Icon size={13} strokeWidth={2.5} />
}

/** Промежуточная остановка на полосе статусов. */
export type RailStop = {
  key: string
  seq: number
  role: 'pickup' | 'delivery'
  label: string
  sub: string | null
  /** Пройдена: есть «загрузился/выгрузился» на неё (или груз уже доставлен). */
  done: boolean
  /** Трак стоит на ней: есть «приехал», но ещё не уехал. */
  arrived: boolean
  /** POD этой выгрузки (documents.stop_seq = seq), если уже загружен. */
  podId?: number | null
}

type StopState = 'none' | 'arrived' | 'done'

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
  /** Остановки между первой погрузкой и последней выгрузкой (lib/stops.ts). */
  stops?: RailStop[]
}) {
  const [pending, start] = useTransition()
  const locale = useLocale()
  // The rail redraws the instant a step is clicked, then the server action confirms it.
  // React reverts `shown` by itself if the action throws, so a failed write can't leave
  // the rail showing a lie.
  const [shown, setShown] = useOptimistic(current)
  const cancelled = shown === 'cancelled'
  // -1 while cancelled, which correctly leaves every step unreached below.
  const currentIdx = PIPELINE.indexOf(shown)
  const TRANSIT_IDX = PIPELINE.indexOf('in_transit')

  // Состояние точек, переключённых с полосы прямо сейчас — до того, как сервер
  // перерисует страницу с новыми отметками.
  const [override, setOverride] = useState<Map<string, StopState>>(new Map())
  const stateOf = (st: RailStop): StopState =>
    override.get(st.key) ?? (st.done ? 'done' : st.arrived ? 'arrived' : 'none')
  // Последняя тронутая точка: после неё стоит «В пути». Пока ни одна не тронута,
  // «В пути» стоит на своём обычном месте — перед точками.
  const inTransit = shown === 'in_transit'
  let lastTouched = -1
  if (inTransit) stops.forEach((st, k) => stateOf(st) !== 'none' && (lastTouched = k))
  const firstLegHidden = inTransit && lastTouched >= 0

  const same = (s: LoadStatus) => notify('ok', `${t(locale, 'loads.loadHash')}${id}: ${statusLabel(locale, s)}`)

  // Телефон: полоса шире экрана и едет вбок. Текущий кружок сам подъезжает к центру —
  // при открытии и после каждого нажатия, иначе он уезжает за край.
  const railRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const ol = railRef.current
    if (!ol || ol.scrollWidth <= ol.clientWidth + 1) return
    const el = ol.querySelector<HTMLElement>('[aria-current="step"]')
    if (!el) return
    const r = el.getBoundingClientRect()
    const o = ol.getBoundingClientRect()
    ol.scrollTo({ left: ol.scrollLeft + (r.left + r.width / 2) - (o.left + o.width / 2), behavior: 'smooth' })
  }, [shown, override])

  const go = (s: LoadStatus) =>
    start(async () => {
      setShown(s) // optimistic; reverts to `current` after the action if the server rejects
      const res = await setStatus(id, s)
      if (res?.error) return notify('error', res.error)
      notify('ok', `${t(locale, 'loads.loadHash')}${id}: ${statusLabel(locale, s)}`)
      // Назад до «В пути» — точки тоже сбрасываются: в «Загрузке» трак ни на одной
      // из них ещё не был.
      if (PIPELINE.indexOf(s) < TRANSIT_IDX) {
        const touched = stops.filter((st) => stateOf(st) !== 'none')
        if (touched.length) {
          setOverride((prev) => {
            const n = new Map(prev)
            for (const st of stops) n.set(st.key, 'none')
            return n
          })
          for (const st of touched) await unmarkStop(id, st.seq, st.role)
        }
      }
    })

  /** Груз должен быть «В пути», чтобы точки имели смысл. */
  async function ensureTransit(): Promise<boolean> {
    if (shown === 'in_transit') return true
    setShown('in_transit')
    const r = await setStatus(id, 'in_transit')
    if (r?.error) {
      notify('error', r.error)
      return false
    }
    return true
  }
  const setState = (st: RailStop, v: StopState) => setOverride((prev) => new Map(prev).set(st.key, v))
  const stopText = (st: RailStop) => `${st.label}${st.sub ? ` · ${st.sub}` : ''}`

  /** Клик по точке: пусто → «приехал» (точка текущая); текущая → подсказка;
   * пройдена → сброс до пустой. */
  const clickStop = (st: RailStop) => {
    const was = stateOf(st)
    start(async () => {
      if (was === 'arrived' && inTransit) return notify('ok', stopText(st))
      if (!(await ensureTransit())) return
      if (was === 'none' || was === 'arrived') {
        setState(st, 'arrived')
        if (was === 'arrived') return
        const res = await addLoadEventManual(
          id,
          st.role === 'pickup' ? 'arrived_pickup' : 'arrived_delivery',
          new Date().toISOString(),
          undefined,
          st.seq,
        )
        if (res?.error) {
          setState(st, 'none')
          notify('error', res.error)
        } else notify('ok', stopText(st))
      } else {
        setState(st, 'none')
        const res = await unmarkStop(id, st.seq, st.role)
        if (res?.error) {
          setState(st, 'done')
          notify('error', res.error)
        } else notify('ok', `${stopText(st)}: ↩`)
      }
    })
  }

  /** Клик по «В пути» после точки: трак выехал — точка пройдена, «В пути» текущий. */
  const leaveStop = (st: RailStop) => {
    const was = stateOf(st)
    start(async () => {
      if (was === 'done' && inTransit) return same('in_transit')
      if (!(await ensureTransit())) return
      if (was !== 'done') {
        setState(st, 'done')
        const res = await addLoadEventManual(
          id,
          st.role === 'pickup' ? 'loaded' : 'delivered',
          new Date().toISOString(),
          undefined,
          st.seq,
        )
        if (res?.error) {
          setState(st, was)
          notify('error', res.error)
        } else notify('ok', `${stopText(st)}: ✓`)
      }
    })
  }

  return (
    <div aria-busy={pending}>
      {/* Classic stepper geometry: each step is a fixed-width column, and the
          connectors between them are the flexible part. */}
      <ol ref={railRef} className={`flex items-start overflow-x-auto ${cancelled ? 'opacity-40' : ''}`}>
        {PIPELINE.map((s, i) => {
          // Первый «В пути» уходит с полосы, как только трак отметился на точке —
          // его место теперь после этой точки.
          if (s === 'in_transit' && firstLegHidden) return null
          const done = currentIdx > i
          const isCurrent = currentIdx === i
          const tone = STEP_TONE[s]
          const Icon = STATUS_ICON[s]
          return (
            <li key={s} className="contents">
              {/* Промежуточные остановки — перед «Доставлен». */}
              {s === 'delivered' &&
                stops.map((st, k) => {
                  const state = stateOf(st)
                  const sd = state === 'done'
                  const atStop = state === 'arrived'
                  const stTone = STEP_TONE[st.role === 'pickup' ? 'booked' : 'delivered']
                  const showTransitAfter = inTransit && k === lastTouched
                  return (
                    <span key={st.key} className="contents">
                      <span
                        aria-hidden
                        className={`mt-3.5 h-0.5 min-w-2 flex-1 rounded-full ${sd || atStop ? stTone.line : 'bg-white/10'}`}
                      />
                      <div className={STEP_W} title={stopText(st)}>
                        <button
                          type="button"
                          disabled={cancelled}
                          onClick={() => clickStop(st)}
                          aria-current={atStop ? 'step' : undefined}
                          className={`flex size-7 shrink-0 items-center justify-center rounded-full transition-all duration-150 disabled:cursor-default ${
                            sd || atStop ? stTone.dot : HOLLOW
                          } ${atStop ? RING : ''} ${state === 'none' ? 'hover:scale-110' : ''}`}
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
                          className={`w-full truncate text-center text-2xs font-medium ${atStop ? stTone.text : sd ? 'text-white/55' : 'text-white/30'}`}
                        >
                          {st.label}
                        </span>
                        {st.sub && <span className="w-full truncate text-center text-[9px] text-white/40">{st.sub}</span>}
                        {st.role === 'delivery' && (
                          <StopPod loadId={id} seq={st.seq} docId={st.podId ?? null} due={sd || atStop} />
                        )}
                      </div>
                      {/* «В пути» после точки: пустой, пока трак стоит на ней; текущий,
                          когда выехал. */}
                      {showTransitAfter && (
                        <>
                          <span
                            aria-hidden
                            className={`mt-3.5 h-0.5 min-w-2 flex-1 rounded-full ${sd ? STEP_TONE.in_transit.line : 'bg-white/10'}`}
                          />
                          <div className={STEP_W}>
                            <button
                              type="button"
                              disabled={cancelled}
                              onClick={() => leaveStop(st)}
                              aria-current={sd ? 'step' : undefined}
                              title={statusLabel(locale, 'in_transit')}
                              className={`flex size-7 shrink-0 items-center justify-center rounded-full transition-all duration-150 disabled:cursor-default ${
                                sd ? `${STEP_TONE.in_transit.dot} ${RING}` : `${HOLLOW} hover:scale-110`
                              }`}
                            >
                              <StepIcon icon={STATUS_ICON.in_transit} />
                            </button>
                            <span
                              className={`w-full truncate text-center text-2xs font-medium ${sd ? STEP_TONE.in_transit.text : 'text-white/30'}`}
                            >
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
                  className={`mt-3.5 h-0.5 min-w-2 flex-1 rounded-full ${done || isCurrent ? tone.line : 'bg-white/10'}`}
                />
              )}
              <div className={STEP_W}>
                <button
                  type="button"
                  disabled={cancelled}
                  onClick={() => (s === shown ? same(s) : go(s))}
                  aria-current={isCurrent ? 'step' : undefined}
                  title={statusLabel(locale, s)}
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full transition-all duration-150 disabled:cursor-default ${
                    done || isCurrent ? tone.dot : HOLLOW
                  } ${isCurrent ? RING : ''} ${!done && !isCurrent ? 'hover:scale-110' : ''}`}
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
