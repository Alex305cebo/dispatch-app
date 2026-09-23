'use client'

import { safeUploadFile } from '@/lib/upload-name'
import { DocLink } from '@/components/doc-link'

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react'
import { Ban, Check, FileCheck2, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { addLoadEventManual, deleteLoad, setStatus, unmarkStop, uploadDocument } from '@/app/actions'
import { DeleteButton } from '@/components/delete-button'
import { type LoadStatus } from '@/lib/map'
import { notify } from '@/lib/notify'
import { statusLabel, STATUS_ICON } from '@/components/status'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

// The pipeline a load actually walks, in order. `cancelled` is deliberately NOT in it:
// it isn't a later stage of the same journey, it's the journey being abandoned, and
// putting it sixth in a row of equal buttons implied a load progresses into it.
// «Оплачен» здесь не шаг: деньги отмечает бухгалтер в «Финансах» (app/invoices).
const PIPELINE: LoadStatus[] = ['quoted', 'booked', 'in_transit', 'delivered']

// Each step's colour once reached. Matches components/status.tsx's badge hues so the
// rail and the badge on the same page can never disagree about what "booked" looks like.
// Классы написаны целиком (не собираются из кусков): Tailwind видит только готовые строки.
//  dot  — залитый кружок пройденного/текущего шага;
//  text — подпись текущего шага и крупное название в шапке;
//  chip — стеклянная плашка со значком в шапке;
//  halo / glow / ping — свечение и мягкая пульсация текущего кружка;
//  from / to — концы переливающейся линии между шагами (цвет прошлого шага → этого).
type Tone = { dot: string; text: string; chip: string; halo: string; glow: string; ping: string; from: string; to: string }
const STEP_TONE: Record<LoadStatus, Tone> = {
  quoted: {
    dot: 'bg-white/60 text-ink-950',
    text: 'text-t1',
    chip: 'bg-white/10 text-t1 ring-1 ring-white/15',
    halo: 'ring-white/15',
    glow: '',
    ping: 'bg-white/25',
    from: 'from-white/45',
    to: 'to-white/45',
  },
  booked: {
    dot: 'bg-cyan-400 text-ink-950',
    text: 'text-cyan-300',
    chip: 'bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/35 shadow-[0_0_26px_-8px_var(--color-cyan-400)]',
    halo: 'ring-cyan-400/25',
    glow: 'shadow-[0_0_22px_-4px_var(--color-cyan-400)]',
    ping: 'bg-cyan-400/35',
    from: 'from-cyan-400',
    to: 'to-cyan-400',
  },
  in_transit: {
    dot: 'bg-amber-400 text-ink-950',
    text: 'text-amber-300',
    chip: 'bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/35 shadow-[0_0_26px_-8px_var(--color-amber-400)]',
    halo: 'ring-amber-400/25',
    glow: 'shadow-[0_0_22px_-4px_var(--color-amber-400)]',
    ping: 'bg-amber-400/35',
    from: 'from-amber-400',
    to: 'to-amber-400',
  },
  delivered: {
    dot: 'bg-fuchsia-400 text-ink-950',
    text: 'text-fuchsia-300',
    chip: 'bg-fuchsia-400/15 text-fuchsia-300 ring-1 ring-fuchsia-400/35 shadow-[0_0_26px_-8px_var(--color-fuchsia-400)]',
    halo: 'ring-fuchsia-400/25',
    glow: 'shadow-[0_0_22px_-4px_var(--color-fuchsia-400)]',
    ping: 'bg-fuchsia-400/35',
    from: 'from-fuchsia-400',
    to: 'to-fuchsia-400',
  },
  paid: {
    dot: 'bg-good-400 text-ink-950',
    text: 'text-good-400',
    chip: 'bg-good-400/15 text-good-400 ring-1 ring-good-400/35 shadow-[0_0_26px_-8px_var(--color-good-400)]',
    halo: 'ring-good-400/25',
    glow: 'shadow-[0_0_22px_-4px_var(--color-good-400)]',
    ping: 'bg-good-400/35',
    from: 'from-good-400',
    to: 'to-good-400',
  },
  cancelled: {
    dot: 'bg-bad-500 text-white',
    text: 'text-bad-400',
    chip: 'bg-bad-500/15 text-bad-400 ring-1 ring-bad-400/35',
    halo: 'ring-bad-400/25',
    glow: '',
    ping: 'bg-bad-500/30',
    from: 'from-bad-500',
    to: 'to-bad-500',
  },
}

// Ширина шага считается от ширины САМОЙ плитки (@container), а не экрана: плитку можно
// сделать узкой, и тогда «sm:» на широком мониторе растягивал бы её за край.
const STEP_W = 'flex w-[64px] shrink-0 flex-col items-center gap-1.5 @2xl:w-[88px]'
// Линия между кружками: по центру кружка size-9 (18 px), толщиной 4 px.
const LINE = 'mt-4 h-1 min-w-3 flex-1 rounded-full'
const LINE_OFF = 'bg-white/[0.08] shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)]'
const NODE =
  'relative flex size-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 disabled:cursor-default'
const HOLLOW =
  'bg-white/[0.06] text-t3 ring-1 ring-white/[0.12] backdrop-blur-sm hover:scale-110 hover:bg-white/[0.12] hover:text-t2'
const LABEL = 'w-full truncate text-center text-xs'

/** Кружок шага: пройден — галочка, текущий — светится и мягко пульсирует, впереди — стекло. */
function Node({
  tone,
  state,
  icon: Icon,
  ...rest
}: {
  tone: Tone
  state: 'done' | 'current' | 'todo'
  icon: (typeof STATUS_ICON)[LoadStatus]
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const look =
    state === 'todo' ? HOLLOW : `${tone.dot} ${state === 'current' ? `ring-4 ${tone.halo} ${tone.glow}` : ''}`
  return (
    <button type="button" aria-current={state === 'current' ? 'step' : undefined} className={`${NODE} ${look}`} {...rest}>
      {state === 'current' && (
        <span aria-hidden className={`absolute inset-0 -z-10 rounded-full motion-safe:animate-ping ${tone.ping}`} />
      )}
      {state === 'done' ? <Check size={16} strokeWidth={3} /> : <Icon size={15} strokeWidth={2.25} />}
    </button>
  )
}

// BOL rides at the loading step, POD at delivery — the paperwork each stage produces, filed
// right where it belongs on the rail. Present → a green chip that opens it. Missing → a
// button that uploads it right here: amber and pulsing once it is due at the load's current
// stage (delivery is gated on it), quiet with a dashed edge while it isn't due yet.
function DocChip({
  label,
  kind,
  loadId,
  seq,
  docId,
  due,
}: {
  label: string
  kind: 'bol' | 'pod'
  loadId: number
  /** Выгрузка мультистопа: POD этой точки (documents.stop_seq). */
  seq?: number
  docId: number | null
  due: boolean
}) {
  const locale = useLocale()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const pill = 'mt-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-bold tracking-wide transition-colors'
  if (docId)
    return (
      <DocLink
        docId={docId}
        title={label}
        className={`${pill} border-good-400/35 bg-good-400/12 text-good-400 hover:bg-good-400/22`}
      >
        <FileCheck2 size={11} strokeWidth={2.5} />
        {label}
      </DocLink>
    )
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!list.length) return
    start(async () => {
      let saved = 0
      let firstError: string | null = null
      for (const file of list) {
        const fd = new FormData()
        fd.append('file', safeUploadFile(file))
        fd.append('kind', kind)
        fd.append('loadId', String(loadId))
        if (seq != null) fd.append('stopSeq', String(seq))
        const res = await uploadDocument(fd)
        if (res && 'error' in res) firstError ??= res.error
        else saved++
      }
      if (saved) {
        notify('ok', t(locale, 'loadDetail.docUploaded').replace('{label}', label))
        router.refresh()
      }
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
        title={t(locale, 'loadDetail.uploadDoc').replace('{label}', label)}
        className={`${pill} ${
          due
            ? 'border-warn-400/55 bg-warn-400/15 text-warn-400 hover:bg-warn-400/25 motion-safe:animate-pulse'
            : 'border-dashed border-white/20 text-t3 hover:border-white/35 hover:text-t2'
        }`}
      >
        {pending ? '…' : <Plus size={11} strokeWidth={3} />}
        {label}
      </button>
    </>
  )
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
  truckId = null,
  title = '',
}: {
  id: number
  current: LoadStatus
  /** Трак груза — куда вернуться после удаления ошибочного груза. */
  truckId?: number | null
  /** «Nampa → Union City» — в подтверждениях отмены и удаления. */
  title?: string
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
  const router = useRouter()
  const [shown, setShown] = useOptimistic(current)
  const cancelled = shown === 'cancelled'
  // -1 while cancelled, which correctly leaves every step unreached below; оплаченный
  // прошёл все шаги полосы.
  const currentIdx = shown === 'paid' ? PIPELINE.length : PIPELINE.indexOf(shown)
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

  const go = (s: LoadStatus) => {
    // «Отменён» — только осознанно: этой кнопкой по ошибке «отменяли» не тот груз, и
    // трак оставался без текущего. Заведённый по ошибке груз удаляется отдельно.
    if (s === 'cancelled' && !window.confirm(t(locale, 'loadStatus.cancelConfirm').replace('{route}', title || `#${id}`)))
      return
    applyStatus(s)
  }
  const applyStatus = (s: LoadStatus) =>
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

  const head = STEP_TONE[shown]
  const HeadIcon = STATUS_ICON[shown]
  // Тихие действия справа в шапке: редкие и необратимые по духу, в ряд обычных шагов
  // им нельзя.
  const quiet =
    'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-t3 transition-colors hover:bg-bad-500/10 hover:text-bad-400'

  return (
    <div aria-busy={pending} className="@container">
      {/* Шапка: где груз сейчас — крупно, со значком в стеклянной плашке того же цвета,
          что и кружок на полосе. Раньше текущий шаг узнавался только по обводке кружка. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* grow, а не flex-1: у flex-1 основа 0, и в узкой плитке действия справа
            сжимали название статуса в ноль вместо того, чтобы уйти строкой ниже. */}
        <div className="flex min-w-0 grow items-center gap-3">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors ${head.chip}`}>
            <HeadIcon size={18} strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="text-2xs font-medium uppercase tracking-wider text-t3">{t(locale, 'loadStatus.caption')}</p>
            <p className={`truncate text-lg font-semibold leading-tight ${head.text}`}>{statusLabel(locale, shown)}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {/* Заведён по ошибке — удалить совсем, с тем же подтверждением, что в списке
              грузов. После удаления — на карточку трака: этого груза больше нет. */}
          <DeleteButton
            action={deleteLoad}
            id={id}
            title={title || `#${id}`}
            note={t(locale, 'loads.page.deleteNote')}
            className={quiet}
            label={
              <>
                <Trash2 size={13} strokeWidth={2.25} />
                {t(locale, 'loadStatus.deleteWrong')}
              </>
            }
            onDone={() => router.push(truckId ? `/trucks/${truckId}` : '/loads')}
          />
          {!cancelled && (
            <button type="button" onClick={() => go('cancelled')} className={quiet}>
              <Ban size={13} strokeWidth={2.25} />
              {t(locale, 'loadStatus.cancel')}
            </button>
          )}
        </div>
      </div>

      {/* Classic stepper geometry: each step is a fixed-width column, and the
          connectors between them are the flexible part. Поля вокруг — место для
          свечения текущего кружка: полоса едет вбок и обрезает всё, что за краем. */}
      <ol
        ref={railRef}
        className={`-mx-2 flex items-start overflow-x-auto px-2 py-2 transition-opacity ${cancelled ? 'opacity-40' : ''}`}
      >
        {PIPELINE.map((s, i) => {
          // Первый «В пути» уходит с полосы, как только трак отметился на точке —
          // его место теперь после этой точки.
          if (s === 'in_transit' && firstLegHidden) return null
          const done = currentIdx > i
          const isCurrent = currentIdx === i
          const tone = STEP_TONE[s]
          // Линия переливается из цвета прошлого шага в цвет этого.
          const prev = STEP_TONE[PIPELINE[Math.max(0, i - 1)]]
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
                        className={`${LINE} ${sd || atStop ? `bg-linear-to-r ${STEP_TONE.in_transit.from} ${stTone.to}` : LINE_OFF}`}
                      />
                      <div className={STEP_W} title={stopText(st)}>
                        <Node
                          tone={stTone}
                          state={sd ? 'done' : atStop ? 'current' : 'todo'}
                          icon={st.role === 'pickup' ? STATUS_ICON.booked : STATUS_ICON.delivered}
                          disabled={cancelled}
                          onClick={() => clickStop(st)}
                        />
                        <span className={`${LABEL} ${atStop ? `font-semibold ${stTone.text}` : sd ? 'text-t2' : 'text-t3'}`}>
                          {st.label}
                        </span>
                        {st.sub && <span className="-mt-1 w-full truncate text-center text-2xs text-t3">{st.sub}</span>}
                        {st.role === 'delivery' && (
                          <DocChip
                            label="POD"
                            kind="pod"
                            loadId={id}
                            seq={st.seq}
                            docId={st.podId ?? null}
                            due={sd || atStop}
                          />
                        )}
                      </div>
                      {/* «В пути» после точки: пустой, пока трак стоит на ней; текущий,
                          когда выехал. */}
                      {showTransitAfter && (
                        <>
                          <span
                            aria-hidden
                            className={`${LINE} ${sd ? `bg-linear-to-r ${stTone.from} ${STEP_TONE.in_transit.to}` : LINE_OFF}`}
                          />
                          <div className={STEP_W}>
                            <Node
                              tone={STEP_TONE.in_transit}
                              state={sd ? 'current' : 'todo'}
                              icon={STATUS_ICON.in_transit}
                              disabled={cancelled}
                              onClick={() => leaveStop(st)}
                              title={statusLabel(locale, 'in_transit')}
                            />
                            <span className={`${LABEL} ${sd ? `font-semibold ${STEP_TONE.in_transit.text}` : 'text-t3'}`}>
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
                  className={`${LINE} ${done || isCurrent ? `bg-linear-to-r ${prev.from} ${tone.to}` : LINE_OFF}`}
                />
              )}
              <div className={STEP_W}>
                <Node
                  tone={tone}
                  state={done ? 'done' : isCurrent ? 'current' : 'todo'}
                  icon={STATUS_ICON[s]}
                  onClick={() => (s === shown ? same(s) : go(s))}
                  title={statusLabel(locale, s)}
                />
                <span className={`${LABEL} ${isCurrent ? `font-semibold ${tone.text}` : done ? 'text-t2' : 'text-t3'}`}>
                  {statusLabel(locale, s)}
                </span>
                {s === 'booked' && <DocChip label="BOL" kind="bol" loadId={id} docId={bolId} due={currentIdx >= 1} />}
                {s === 'delivered' && <DocChip label="POD" kind="pod" loadId={id} docId={podId} due={currentIdx >= 2} />}
              </div>
            </li>
          )
        })}
      </ol>

      {/* Отменили не тот груз или брокер вернул рейс: одна кнопка возвращает его в
          работу — «В пути», трак снова с грузом. Раньше у отменённого груза вся полоса
          была заблокирована, а подсказка обещала, что кружки нажимаются. */}
      {cancelled && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-warn-400/30 bg-warn-500/[0.06] px-3 py-2">
          <p className="min-w-0 flex-1 text-sm text-t2">{t(locale, 'loadStatus.cancelledHint')}</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => applyStatus('in_transit')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-haul-500 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-haul-400 disabled:opacity-50"
          >
            <RotateCcw size={13} strokeWidth={2.5} />
            {t(locale, 'loadStatus.restore')}
          </button>
        </div>
      )}
    </div>
  )
}
