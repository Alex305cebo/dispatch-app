'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/button'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { parseRelayText, type AmazonStop } from '@/lib/amazon-relay'
import { saveAmazonTrip, type AmazonTripInput } from '@/app/amazon/actions'

export type TruckOption = { id: number; label: string }

const FIELD =
  'min-h-9 w-full rounded-lg border border-white/12 bg-white/[0.04] px-2.5 text-base text-t1 outline-none focus:border-haul-500/60 max-md:min-h-11'
const LABEL = 'mb-1 block text-xs text-t3'

const emptyStop = (): AmazonStop => ({ code: null, city: null, date: null, time: null, tz: null })

export const emptyTripInput = (): AmazonTripInput => ({
  vrid: '',
  tourId: '',
  truckId: null,
  stops: [emptyStop(), emptyStop()],
  rate: '',
  miles: '',
  trailerNo: '',
  trailerOwner: '',
  loadKind: '',
  notes: '',
  rawText: '',
})

/** «Новый рейс»: вставить текст из Relay → разобрать → проверить → сохранить. */
export function AmazonAdd({ trucks, today }: { trucks: TruckOption[]; today: string }) {
  const locale = useLocale()
  const [raw, setRaw] = useState('')
  const [draft, setDraft] = useState<AmazonTripInput | null>(null)

  const parse = (text: string) => {
    const d = parseRelayText(text, today)
    const found = [d.vrid, d.tourId, d.rate, d.miles, d.trailerNo, d.trailerOwner, d.loadKind].filter((x) => x != null).length + d.stops.length
    notify(found ? 'ok' : 'warn', found ? t(locale, 'amazon.parsedSome').replace('{n}', String(found)) : t(locale, 'amazon.parsedNothing'))
    setDraft({
      ...emptyTripInput(),
      vrid: d.vrid ?? '',
      tourId: d.tourId ?? '',
      stops: d.stops.length ? d.stops : [emptyStop(), emptyStop()],
      rate: d.rate != null ? String(d.rate) : '',
      miles: d.miles != null ? String(d.miles) : '',
      trailerNo: d.trailerNo ?? '',
      trailerOwner: d.trailerOwner ?? '',
      loadKind: d.loadKind ?? '',
      rawText: text,
    })
  }

  if (draft)
    return (
      <div className="panel p-4">
        <h2 className="mb-3 text-base font-bold text-t1">{t(locale, 'amazon.addTitle')}</h2>
        <TripForm
          initial={draft}
          trucks={trucks}
          onDone={(saved) => {
            setDraft(null)
            if (saved) setRaw('')
          }}
        />
      </div>
    )

  return (
    <div className="panel p-4">
      <h2 className="text-base font-bold text-t1">{t(locale, 'amazon.addTitle')}</h2>
      <p className="mb-2 text-sm text-t2">{t(locale, 'amazon.pasteHint')}</p>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onPaste={(e) => {
          // Вставили — сразу разбираем: лишнее нажатие «Разобрать» никому не нужно.
          const text = e.clipboardData.getData('text')
          if (text.trim() && !raw.trim()) {
            e.preventDefault()
            setRaw(text)
            parse(text)
          }
        }}
        rows={4}
        placeholder={t(locale, 'amazon.pastePlaceholder')}
        className="w-full rounded-lg border border-white/12 bg-white/[0.04] p-2.5 font-mono text-sm text-t1 outline-none focus:border-haul-500/60"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" disabled={!raw.trim()} onClick={() => parse(raw)}>
          {t(locale, 'amazon.parse')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setDraft(emptyTripInput())}>
          {t(locale, 'amazon.manual')}
        </Button>
      </div>
    </div>
  )
}

/** Форма рейса — и для нового, и для правки (id). onDone(true) — сохранено. */
export function TripForm({
  initial,
  id,
  trucks,
  onDone,
}: {
  initial: AmazonTripInput
  id?: number
  trucks: TruckOption[]
  onDone: (saved: boolean) => void
}) {
  const locale = useLocale()
  const [v, setV] = useState<AmazonTripInput>(initial)
  const [busy, start] = useTransition()
  const set = <K extends keyof AmazonTripInput>(k: K, val: AmazonTripInput[K]) => setV((p) => ({ ...p, [k]: val }))
  const setStop = (i: number, k: keyof AmazonStop, val: string) =>
    setV((p) => ({ ...p, stops: p.stops.map((s, j) => (j === i ? { ...s, [k]: val.trim() ? val : null } : s)) }))

  const save = () =>
    start(async () => {
      const res = await saveAmazonTrip(v, id)
      if ('error' in res) return notify('error', res.error)
      notify('ok', t(locale, 'amazon.saved'))
      onDone(true)
    })

  return (
    <div
      className="flex flex-col gap-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onDone(false)
      }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label>
          <span className={LABEL}>{t(locale, 'amazon.vrid')}</span>
          <input value={v.vrid} onChange={(e) => set('vrid', e.target.value)} className={`${FIELD} font-mono`} />
        </label>
        <label>
          <span className={LABEL}>{t(locale, 'amazon.tour')}</span>
          <input value={v.tourId} onChange={(e) => set('tourId', e.target.value)} className={`${FIELD} font-mono`} />
        </label>
        <label className="col-span-2 sm:col-span-1">
          <span className={LABEL}>{t(locale, 'amazon.truck')}</span>
          <select
            value={v.truckId ?? ''}
            onChange={(e) => set('truckId', e.target.value ? Number(e.target.value) : null)}
            className={FIELD}
          >
            <option value="">{t(locale, 'amazon.noTruck')}</option>
            {trucks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <span className={LABEL}>{t(locale, 'amazon.stops')}</span>
        <div className="flex flex-col gap-2">
          {v.stops.map((s, i) => (
            <div key={i} className="grid grid-cols-6 gap-1.5 sm:grid-cols-[5.5rem_1fr_9rem_6rem_2.5rem]">
              <input
                value={s.code ?? ''}
                onChange={(e) => setStop(i, 'code', e.target.value.toUpperCase())}
                placeholder={t(locale, 'amazon.stopCode')}
                aria-label={t(locale, 'amazon.stopCode')}
                className={`${FIELD} font-mono max-sm:col-span-2`}
              />
              <input
                value={s.city ?? ''}
                onChange={(e) => setStop(i, 'city', e.target.value)}
                placeholder={t(locale, 'amazon.stopCity')}
                aria-label={t(locale, 'amazon.stopCity')}
                className={`${FIELD} max-sm:col-span-3`}
              />
              <button
                type="button"
                onClick={() => setV((p) => ({ ...p, stops: p.stops.filter((_, j) => j !== i) }))}
                aria-label={t(locale, 'amazon.removeStop')}
                title={t(locale, 'amazon.removeStop')}
                className="min-h-9 rounded-lg px-2 text-t3 hover:text-t1 max-md:min-h-11 sm:order-last"
              >
                ✕
              </button>
              <input
                type="date"
                value={s.date ?? ''}
                onChange={(e) => setStop(i, 'date', e.target.value)}
                aria-label={t(locale, 'amazon.stopDate')}
                className={`${FIELD} max-sm:col-span-3`}
              />
              <input
                type="time"
                value={s.time ?? ''}
                onChange={(e) => setStop(i, 'time', e.target.value)}
                aria-label={t(locale, 'amazon.stopTime')}
                className={`${FIELD} max-sm:col-span-3`}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setV((p) => ({ ...p, stops: [...p.stops, emptyStop()] }))}
          className="mt-1.5 min-h-9 text-sm text-haul-300 hover:text-haul-200 max-md:min-h-11"
        >
          {t(locale, 'amazon.addStop')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label>
          <span className={LABEL}>{t(locale, 'amazon.rate')}</span>
          <input inputMode="decimal" value={v.rate} onChange={(e) => set('rate', e.target.value)} className={`${FIELD} nums`} />
        </label>
        <label>
          <span className={LABEL}>{t(locale, 'amazon.miles')}</span>
          <input inputMode="decimal" value={v.miles} onChange={(e) => set('miles', e.target.value)} className={`${FIELD} nums`} />
        </label>
        <label>
          <span className={LABEL}>{t(locale, 'amazon.trailerOwner')}</span>
          <select value={v.trailerOwner} onChange={(e) => set('trailerOwner', e.target.value)} className={FIELD}>
            <option value="">{t(locale, 'amazon.unknown')}</option>
            <option value="amazon">{t(locale, 'amazon.ownerAmazon')}</option>
            <option value="own">{t(locale, 'amazon.ownerOwn')}</option>
          </select>
        </label>
        <label>
          <span className={LABEL}>{t(locale, 'amazon.trailerNo')}</span>
          <input value={v.trailerNo} onChange={(e) => set('trailerNo', e.target.value)} className={`${FIELD} font-mono`} />
        </label>
        <label>
          <span className={LABEL}>{t(locale, 'amazon.loadKind')}</span>
          <select value={v.loadKind} onChange={(e) => set('loadKind', e.target.value)} className={FIELD}>
            <option value="">{t(locale, 'amazon.unknown')}</option>
            <option value="drop">{t(locale, 'amazon.kindDrop')}</option>
            <option value="live">{t(locale, 'amazon.kindLive')}</option>
          </select>
        </label>
        <label className="col-span-2 sm:col-span-3">
          <span className={LABEL}>{t(locale, 'amazon.notes')}</span>
          <input value={v.notes} onChange={(e) => set('notes', e.target.value)} className={FIELD} />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={save}>
          {t(locale, 'amazon.save')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => onDone(false)}>
          {t(locale, 'amazon.cancel')}
        </Button>
      </div>
    </div>
  )
}
