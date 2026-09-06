'use client'

import { useState, useTransition } from 'react'
import { Pencil, Plus, Send, Smartphone, X } from 'lucide-react'
import { addLoadEventManual, removeLoadEvent, setLoadEventTime } from '@/app/actions'
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

const clock = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
/** ISO → значение для <input type="datetime-local"> в местном времени браузера. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Хронология рейса от водителя на странице груза: что и когда он отметил, и сколько
 * простоял на складе между «приехал» и «загрузился».
 *
 * Правится диспетчером: водитель нажимает кнопки на ходу и ошибается — жмёт
 * «Приехал», пока ещё едет, или забывает нажать вовсе и говорит время по телефону.
 * От этих времён считается детеншен, поэтому у каждой отметки есть правка времени и
 * удаление, а недостающую можно добавить руками.
 */
export function DriverTimeline({ events, locale, truckId, loadId }: { events: LoadEvent[]; locale: ReturnType<typeof useLocale>; truckId: number; loadId: number }) {
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()
  const [timeOf, setTimeOf] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)

  const run = (fn: () => Promise<{ error: string } | void>) =>
    start(async () => {
      const r = await fn()
      if (r && 'error' in r) notify('error', r.error)
    })

  return (
    <section className="panel mt-4 p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
        {t(locale, 'driver.timeline.heading')}
        <Info text={t(locale, 'driver.timeline.info')} />
        {events.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setEditing((v) => !v)
              setTimeOf(null)
              setAdding(false)
            }}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium normal-case tracking-normal text-white/50 hover:bg-white/8 hover:text-white/85"
          >
            <Pencil size={11} strokeWidth={2.2} />
            {t(locale, editing ? 'driver.timeline.editDone' : 'driver.timeline.edit')}
          </button>
        )}
      </h2>

      {events.length === 0 ? (
        <Empty
          row
          icon={Smartphone}
          title={t(locale, 'driver.timeline.noneTitle')}
          text={t(locale, 'driver.timeline.none')}
          action={{ href: `/trucks/${truckId}`, label: t(locale, 'driver.timeline.noneCta'), icon: <Send size={14} strokeWidth={2.2} /> }}
        />
      ) : (
        <ol className={`flex flex-col gap-1.5 ${pending ? 'opacity-60' : ''}`}>
          {events.map((e, i) => {
            const prev = events[i - 1]
            // Время на складе: приехал → загрузился / приехал → выгрузился.
            const dwell =
              prev && ((prev.kind === 'arrived_pickup' && e.kind === 'loaded') || (prev.kind === 'arrived_delivery' && e.kind === 'delivered'))
                ? Math.round((Date.parse(e.at) - Date.parse(prev.at)) / 60_000)
                : null
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
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
                    className={`nums w-[7.5rem] shrink-0 text-left text-white/45 ${editing ? 'rounded-md underline decoration-dotted underline-offset-2 hover:text-haul-300' : 'cursor-default'}`}
                  >
                    {clock(e.at)}
                  </button>
                )}
                <span className={e.kind === 'note' ? 'font-medium text-warn-300' : 'text-white/85'}>
                  {ICON[e.kind]} {t(locale, KEY[e.kind])}
                  {e.note ? `: ${e.note}` : ''}
                </span>
                {dwell != null && dwell > 0 && (
                  <span className={`nums text-[12px] ${dwell >= 120 ? 'text-bad-400' : 'text-white/45'}`}>
                    · {Math.floor(dwell / 60)}h {dwell % 60}m
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
      <button type="button" onClick={onCancel} className="rounded-lg px-2 py-1.5 text-[12.5px] text-white/55 hover:text-white/85">
        {t(locale, 'driver.timeline.cancel')}
      </button>
    </div>
  )
}
