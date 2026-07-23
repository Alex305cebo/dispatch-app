'use client'

import { Button } from '@/components/button'
import { useState, useTransition } from 'react'
import { MotionConfig } from 'motion/react'
import { calcLoad } from '@/lib/profit'
import { EMPTY, type QrLoad } from '@/lib/qr-load'
import { truckLabel, type TruckRecord } from '@/lib/map'
import { createLoad, fetchRouteMiles } from '@/app/actions'
import { humanError } from '@/lib/msg'
import { notify } from '@/lib/notify'
import { Analysis } from './analysis'
import { Field, TextField } from './ui'
import { Info } from './info'
import { useLocale } from './locale-provider'
import { t as tr } from '@/lib/i18n'

export function LoadForm({
  trucks,
  defaultTruckId,
  initial = EMPTY,
  source = 'manual',
  /** Fields the QR couldn't carry — ringed amber so the gap is visible, not guessed. */
  needsAttention = [],
  docId,
  driverInfo,
}: {
  trucks: TruckRecord[]
  defaultTruckId?: number
  initial?: QrLoad
  source?: 'manual' | 'qr'
  needsAttention?: string[]
  /** An already-uploaded document (the imported RC) to attach to the created load. */
  docId?: number
  /** The "Driver Information" block already rendered from the AI read (/import) —
   * omitted for manual entry, which has nothing to render. */
  driverInfo?: string
}) {
  const locale = useLocale()
  const [load, setLoad] = useState<QrLoad>(initial)
  const [truckId, setTruckId] = useState<number>(defaultTruckId ?? trucks[0]?.id ?? 0)
  const [pending, start] = useTransition()
  const [milesBusy, startMiles] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const set = (patch: Partial<QrLoad>) => setLoad({ ...load, ...patch })
  const attn = (k: string) => needsAttention.includes(k)
  // Analysis uses the SELECTED truck's economics — switching trucks re-costs the load.
  const truck = trucks.find((t) => t.id === truckId) ?? trucks[0]

  let result: ReturnType<typeof calcLoad> | null = null
  let calcError: string | null = null
  try {
    if (!truck) throw new Error(tr(locale, 'loadForm.noTrucks'))
    result = calcLoad(load, truck)
  } catch (e) {
    calcError = humanError(e)
  }

  function save() {
    setError(null)
    if (!truck) {
      setError(tr(locale, 'loadForm.addTruckFirst'))
      return
    }
    start(async () => {
      const res = await createLoad({ ...load, source, truckId: truck.id }, docId, driverInfo)
      // On success createLoad redirects and never returns.
      if (res?.error) {
        setError(res.error)
        notify('error', tr(locale, 'loadForm.saveFailedToast').replace('{error}', res.error))
      }
    })
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section className="panel p-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            {tr(locale, 'loadForm.heading')}
          </h2>

          <label className="mb-4 block">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/65">
              {tr(locale, 'loadForm.truckLabel')}
            </span>
            <select
              value={truckId}
              onChange={(e) => setTruckId(Number(e.target.value))}
              className="w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-[15px] text-white outline-none transition-all duration-200 hover:border-white/15 focus:border-haul-500 focus:ring-4 focus:ring-haul-500/15"
            >
              {trucks.map((t) => (
                <option key={t.id} value={t.id}>
                  {truckLabel(t)}
                </option>
              ))}
            </select>
          </label>

          <div className="mb-4">
            <Field
              label={tr(locale, 'loadForm.brokerRateLabel')}
              value={load.rate}
              onChange={(rate) => set({ rate })}
              step={25}
              prefix="$"
              big
              missing={attn('rate')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Field
                label={tr(locale, 'loadForm.loadedMilesLabel')}
                value={load.loadedMiles}
                onChange={(loadedMiles) => set({ loadedMiles })}
                step={10}
                missing={attn('loadedMiles')}
              />
              <button
                type="button"
                disabled={milesBusy || !load.origin || !load.destination}
                onClick={() =>
                  startMiles(async () => {
                    const res = await fetchRouteMiles(load.origin ?? '', load.destination ?? '')
                    if ('miles' in res) {
                      set({ loadedMiles: res.miles })
                      notify('ok', tr(locale, 'loadForm.milesByMapToast').replace('{miles}', String(res.miles)))
                    } else
                      notify(
                        'warn',
                        res.error === 'no_key'
                          ? tr(locale, 'loadForm.routeDisabled')
                          : tr(locale, 'loadForm.routeFailedToast').replace('{error}', res.error),
                      )
                  })
                }
                className="mt-1 text-[11px] text-haul-400 hover:underline disabled:text-white/30"
              >
                {milesBusy ? tr(locale, 'loadForm.calculating') : tr(locale, 'loadForm.milesByMapButton')}
              </button>
              <span className="ml-1.5 inline-block align-middle">
                <Info text={tr(locale, 'loadForm.milesByMapInfo')} />
              </span>
            </div>
            <Field
              label={tr(locale, 'loadForm.deadheadLabel')}
              value={load.deadheadMiles}
              onChange={(deadheadMiles) => set({ deadheadMiles })}
              step={10}
              missing={attn('deadheadMiles')}
            />
          </div>

          <div className="mt-3">
            <Field
              label={tr(locale, 'loadForm.transitDaysLabel')}
              value={load.transitDays}
              onChange={(transitDays) => set({ transitDays })}
              step={0.5}
              suffix={tr(locale, 'loadForm.daysSuffix')}
              missing={attn('transitDays')}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <TextField
              label={tr(locale, 'loadForm.originLabel')}
              value={load.origin ?? ''}
              onChange={(origin) => set({ origin: origin || null })}
              placeholder="Chicago, IL"
            />
            <TextField
              label={tr(locale, 'loadForm.destinationLabel')}
              value={load.destination ?? ''}
              onChange={(destination) => set({ destination: destination || null })}
              placeholder="Dallas, TX"
            />
          </div>

          {(load.brokerMc || load.brokerPhone || load.brokerEmail || load.referenceId) && (
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/8 pt-4">
              {load.brokerMc && <Chip label="MC" value={load.brokerMc} />}
              {load.brokerPhone && (
                <Chip label={tr(locale, 'loadForm.phoneChipLabel')} value={load.brokerPhone} href={`tel:${load.brokerPhone}`} />
              )}
              {load.brokerEmail && (
                <Chip label="Email" value={load.brokerEmail} href={`mailto:${load.brokerEmail}`} />
              )}
              {load.referenceId && <Chip label="Ref" value={load.referenceId} />}
              {load.truckLocation && <Chip label={tr(locale, 'loadForm.truckChipLabel')} value={load.truckLocation} />}
            </div>
          )}

          <Button variant="primary" size="lg" block className="mt-5 disabled:cursor-not-allowed" onClick={save}
            disabled={pending || !!calcError}>
            {pending ? tr(locale, 'loadForm.saving') : tr(locale, 'loadForm.saveLoad')}
          </Button>
          {error && <p className="mt-2 text-[13px] text-bad-400">{error}</p>}
        </section>

        <section className="panel p-5 lg:sticky lg:top-6">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            {tr(locale, 'loadDetail.rateHeading')}
          </h2>
          {calcError && <p className="text-sm text-bad-400">{calcError}</p>}
          {result && truck && <Analysis r={result} mpg={truck.mpg} spotRpm={load.spotRpm} />}
        </section>
      </div>
    </MotionConfig>
  )
}

function Chip({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <>
      <span className="text-white/62">{label}</span>
      <span className="text-white/85">{value}</span>
    </>
  )
  const cls =
    'flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5 text-[12px]'
  return href ? (
    <a href={href} className={`${cls} transition-colors hover:border-haul-500/40`}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  )
}
