'use client'

import { useState, useTransition } from 'react'
import { Pencil, Plus, Send, Smartphone, X } from 'lucide-react'
import { addLoadEventManual, removeLoadEvent, setLoadEventTime } from '@/app/actions'
import { DetentionTile } from '@/components/detention-tile'
import { Empty } from '@/components/empty'
import { Info } from '@/components/info'
import { useLocale } from '@/components/locale-provider'
import { notify } from '@/lib/notify'
import { t } from '@/lib/i18n'
import type { LoadEvent } from '@/lib/load-events'

const KEY = {
  arrived_pickup: 'driver.ev.arrivedPickup',
  loaded: 'driver.ev.loaded',
  arrived_delivery: 'driver.ev.arrivedDelivery',
  delivered: 'driver.ev.delivered',
  note: 'driver.ev.note',
  photo: 'driver.ev.photo',
} as const
const ICON = {
  arrived_pickup: '📍',
  loaded: '🚚',
  arrived_delivery: '📍',
  delivered: '✅',
  note: '💬',
  photo: '📷',
} as const
/** Цвет точки на линии: прибытие — синим, груз в кузове / сдан — зелёным,
 * сообщение — жёлтым, фото — серым. По цвету видно, где рейс, не читая. */
const DOT = {
  arrived_pickup: 'bg-haul-400 ring-4 ring-haul-400/20',
  loaded: 'bg-good-400 ring-4 ring-good-400/20',
  arrived_delivery: 'bg-haul-400 ring-4 ring-haul-400/20',
  delivered: 'bg-good-400 ring-4 ring-good-400/20',
  note: 'bg-warn-400 ring-4 ring-warn-400/20',
  photo: 'bg-white/40',
} as const

const clock = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
/** ISO → значение для <input type="datetime-local"> в местном времени браузера. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export type DetentionProps = {
  at: 'pickup' | 'delivery'
  sinceIso: string
  endIso: string | null
  min: number
  rateHr: number
  freeHr: number
  refId: string | null
  route: string
  truck: string
}

/**
 * Блок «Водитель» — один на карточке груза и карточке трака, над картой: что и
 * когда водитель отметил (линия с точками), и внизу — стоянка у склада с суммой
 * детеншена по тем же отметкам. Раньше это были две панели про одно и то же.
 *
 * Правится диспетчером: водитель нажимает кнопки на ходу и ошибается — жмёт
 * «Приехал», пока ещё едет, или забывает нажать вовсе и говорит время по телефону.
 * От этих времён считается детеншен, поэтому у каждой отметки есть правка времени и
 * удаление, а недостающую можно добавить руками.
 */
export function DriverTimeline({
  events,
  locale,
  truckId,
  loadId,
  detention = null,
}: {
  events: LoadEvent[]
  locale: ReturnType<typeof useLocale>
  truckId: number
  loadId: number
  /** Стоянка у склада ≥ 30 мин по отметкам — см. lib/detention stopWindow. */
  detention?: DetentionProps | null
}) {
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()
  const [timeOf, setTimeOf] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)

  const run = (fn: () => Promise<{ error: string } | void>) =>
    start(async () => {
      const r = await fn()
      if (r && 'error' in r) notify('error', r.error)
    })

  // Где рейс сейчас — последний шаг (не сообщение и не фото), одной строкой в шапке.
  const last = [...events].reverse().find((e) => e.kind !== 'note' && e.kind !== 'photo') ?? null

  return (
    <section className="panel mt-4 overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/[0.06] bg-white/[0.025] px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          <Smartphone size={13} strokeWidth={2.2} className="text-haul-300" />
          {t(locale, 'driver.timeline.heading')}
          <Info text={t(locale, 'driver.timeline.info')} />
        </h2>
        {last && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-ink-950/50 px-2.5 py-0.5 text-[12px] text-white/80">
            <span className={`h-1.5 w-1.5 rounded-full ${DOT[last.kind].split(' ')[0]}`} />
            {t(locale, KEY[last.kind])}
            <span className="nums text-white/45">· {clock(last.at)}</span>
          </span>
        )}
        {events.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setEditing((v) => !v)
              setTimeOf(null)
              setAdding(false)
            }}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
              editing
                ? 'border-haul-500/50 bg-haul-500/20 text-haul-200 hover:bg-haul-500/30'
                : 'border-white/15 bg-white/[0.06] text-white/80 hover:border-white/30 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Pencil size={12} strokeWidth={2.2} />
            {t(locale, editing ? 'driver.timeline.editDone' : 'driver.timeline.edit')}
          </button>
        )}
      </div>

      <div className="px-4 py-3">
        {events.length === 0 ? (
          <Empty
            row
            icon={Smartphone}
            title={t(locale, 'driver.timeline.noneTitle')}
            text={t(locale, 'driver.timeline.none')}
            action={{
              href: `/trucks/${truckId}`,
              label: t(locale, 'driver.timeline.noneCta'),
              icon: <Send size={14} strokeWidth={2.2} />,
            }}
          />
        ) : (
          <ol className={`relative ml-1.5 border-l border-white/10 ${pending ? 'opacity-60' : ''}`}>
            {events.map((e, i) => {
              const prev = events[i - 1]
              // Время на складе: приехал → загрузился / приехал → выгрузился.
              const dwell =
                prev &&
                ((prev.kind === 'arrived_pickup' && e.kind === 'loaded') ||
                  (prev.kind === 'arrived_delivery' && e.kind === 'delivered'))
                  ? Math.round((Date.parse(e.at) - Date.parse(prev.at)) / 60_000)
                  : null
              const isLast = i === events.length - 1
              return (
                <li key={e.id} className="relative flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 pl-5 text-[13px]">
                  <span className={`absolute -left-[5px] top-[0.95rem] h-[9px] w-[9px] rounded-full ${DOT[e.kind]}`} />
                  {timeOf === e.id ? (
                    <input
                      type="datetime-local"
                      defaultValue={toLocalInput(e.at)}
                      autoFocus
                      onBlur={(ev) => {
                        const v = ev.currentTarget.value
                        setTimeOf(null)
                        if (v) run(() => setLoadEventTime(e.id, new Date(v).toISOString()))
                      }}
                      className="nums rounded-md border border-haul-400/60 bg-ink-950/80 px-1.5 py-0.5 text-[12.5px] outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={!editing}
                      onClick={() => setTimeOf(e.id)}
                      className={`nums w-[7.5rem] shrink-0 text-left text-[12px] text-white/45 ${editing ? 'rounded-md underline decoration-dotted underline-offset-2 hover:text-haul-300' : 'cursor-default'}`}
                    >
                      {clock(e.at)}
                    </button>
                  )}
                  <span
                    className={
                      e.kind === 'note'
                        ? 'font-medium text-warn-300'
                        : `${isLast ? 'font-semibold text-white' : 'text-white/80'}`
                    }
                  >
                    {ICON[e.kind]} {t(locale, KEY[e.kind])}
                    {e.note ? `: ${e.note}` : ''}
                  </span>
                  {dwell != null && dwell > 0 && (
                    <span
                      className={`nums rounded-md px-1.5 py-0.5 text-[11.5px] ${dwell >= 120 ? 'bg-bad-500/15 text-bad-300' : 'bg-white/[0.06] text-white/55'}`}
                    >
                      {Math.floor(dwell / 60)}h {dwell % 60}m
                    </span>
                  )}
                  {editing && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(t(locale, 'driver.timeline.deleteConfirm'))) run(() => removeLoadEvent(e.id))
                      }}
                      title={t(locale, 'driver.timeline.deleteConfirm')}
                      className="ml-auto shrink-0 rounded-md px-1 text-white/35 hover:bg-bad-500/15 hover:text-bad-400"
                    >
                      <X size={13} strokeWidth={2.5} />
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
        )}

        {editing && (
          <div className="mt-3 border-t border-white/8 pt-3">
            <p className="text-[12px] leading-relaxed text-white/50">{t(locale, 'driver.timeline.editHint')}</p>
            {adding ? (
              <AddForm
                locale={locale}
                onCancel={() => setAdding(false)}
                onSave={(kind, at, note) => {
                  setAdding(false)
                  run(() => addLoadEventManual(loadId, kind, at, note))
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-medium text-white/80 hover:border-white/35"
              >
                <Plus size={13} strokeWidth={2.5} />
                {t(locale, 'driver.timeline.add')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Стоянка у склада — внизу того же блока: считается из отметок выше. */}
      {detention && (
        <div className="border-t border-white/[0.06] px-4 pb-4">
          <DetentionTile wide {...detention} />
        </div>
      )}
    </section>
  )
}

/** Отметка руками: водитель забыл нажать, а время сказал по телефону. */
function AddForm({
  locale,
  onSave,
  onCancel,
}: {
  locale: ReturnType<typeof useLocale>
  onSave: (kind: string, atIso: string, note?: string) => void
  onCancel: () => void
}) {
  const [kind, setKind] = useState('arrived_pickup')
  const [at, setAt] = useState(toLocalInput(new Date().toISOString()))
  const [note, setNote] = useState('')
  const KINDS = ['arrived_pickup', 'loaded', 'arrived_delivery', 'delivered', 'note'] as const
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        className="rounded-lg border border-white/15 bg-ink-950/70 px-2 py-1.5 text-[12.5px] outline-none"
      >
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {t(locale, KEY[k])}
          </option>
        ))}
      </select>
      <input
        type="datetime-local"
        value={at}
        onChange={(e) => setAt(e.target.value)}
        className="nums rounded-lg border border-white/15 bg-ink-950/70 px-2 py-1.5 text-[12.5px] outline-none"
      />
      {kind === 'note' && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t(locale, 'driver.notePlaceholder')}
          className="min-w-0 flex-1 basis-[10rem] rounded-lg border border-white/15 bg-ink-950/70 px-2 py-1.5 text-[12.5px] outline-none"
        />
      )}
      <button
        type="button"
        disabled={!at}
        onClick={() => onSave(kind, new Date(at).toISOString(), note.trim() || undefined)}
        className="rounded-lg bg-haul-500 px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
      >
        {t(locale, 'driver.timeline.save')}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg px-2 py-1.5 text-[12.5px] text-white/55 hover:text-white/85"
      >
        {t(locale, 'driver.timeline.cancel')}
      </button>
    </div>
  )
}
