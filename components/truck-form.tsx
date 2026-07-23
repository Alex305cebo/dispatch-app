'use client'

import { Button } from '@/components/button'
import { useState, useTransition } from 'react'
import { addTruck, fetchDiesel, saveTruck, type TruckInput } from '@/app/actions'
import { notify } from '@/lib/notify'
import { Field, TextField } from '@/components/ui'
import { Info } from '@/components/info'
import { t as tr, type Locale } from '@/lib/i18n'

export function TruckForm({ id, initial, locale = 'en' }: { id: number | null; initial: TruckInput; locale?: Locale }) {
  const [t, setT] = useState<TruckInput>(initial)
  const [pending, start] = useTransition()
  const [dieselBusy, startDiesel] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const set = (patch: Partial<TruckInput>) => setT({ ...t, ...patch })

  function save() {
    setError(null)
    if (!t.number.trim()) {
      setError(tr(locale, 'trucks.form.numberRequired'))
      return
    }
    start(async () => {
      // addTruck redirects on success and never returns; saveTruck returns void.
      const res = id === null ? await addTruck(t) : await saveTruck(id, t)
      if (res?.error) {
        setError(res.error)
        notify('error', `${tr(locale, 'trucks.form.saveFailed')} ${res.error}`)
        return
      }
      notify('ok', id === null ? tr(locale, 'trucks.form.added') : tr(locale, 'trucks.form.saved'))
    })
  }

  return (
    <section className="panel max-w-2xl p-5">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/50">{tr(locale, 'trucks.form.truckHeading')}</h3>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={tr(locale, 'trucks.form.numberLabel')}
          value={t.number}
          onChange={(number) => set({ number })}
          placeholder="425"
        />
        <TextField
          label={tr(locale, 'trucks.form.driverNameLabel')}
          value={t.driverName}
          onChange={(driverName) => set({ driverName })}
          placeholder="Ravil"
        />
      </div>

      <h3 className="mb-3 mt-6 text-[11px] font-semibold uppercase tracking-wider text-white/50">
        {tr(locale, 'trucks.form.economicsHeading')}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr(locale, 'trucks.form.mpgLabel')} value={t.mpg} onChange={(mpg) => set({ mpg })} step={0.1} />
        <div>
          <Field
            label={tr(locale, 'trucks.form.dieselLabel')}
            value={t.fuelPricePerGallon}
            onChange={(fuelPricePerGallon) => set({ fuelPricePerGallon })}
            step={0.05}
            prefix="$"
            suffix="/gal"
          />
          <button
            type="button"
            disabled={dieselBusy}
            onClick={() =>
              startDiesel(async () => {
                const res = await fetchDiesel()
                if ('price' in res) {
                  set({ fuelPricePerGallon: res.price })
                  notify('ok', `${tr(locale, 'trucks.form.dieselFetchedPrefix')}${res.price}${tr(locale, 'trucks.form.dieselFetchedOn')}${res.asOf}`)
                } else
                  notify('warn', tr(locale, 'trucks.form.dieselFailed'))
              })
            }
            className="mt-1 text-[11px] text-haul-400 hover:underline disabled:text-white/30"
          >
            {dieselBusy ? tr(locale, 'trucks.form.dieselFetching') : tr(locale, 'trucks.form.dieselCurrent')}
          </button>
          <span className="ml-1.5 inline-block align-middle">
            <Info text={tr(locale, 'trucks.form.dieselInfo')} />
          </span>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/65">
            {tr(locale, 'trucks.form.driverPayLabel')}
          </span>
          <select
            value={t.driverPay.mode}
            onChange={(e) =>
              set({
                driverPay:
                  e.target.value === 'cpm'
                    ? { mode: 'cpm', centsPerMile: 60 }
                    : { mode: 'percent', percentOfGross: 25 },
              })
            }
            className="w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-[15px] text-white outline-none transition-all duration-200 hover:border-white/15 focus:border-haul-500 focus:ring-4 focus:ring-haul-500/15"
          >
            <option value="cpm">{tr(locale, 'trucks.form.cpmOption')}</option>
            <option value="percent">{tr(locale, 'trucks.form.percentOption')}</option>
          </select>
        </label>

        {t.driverPay.mode === 'cpm' ? (
          <Field
            label={tr(locale, 'trucks.form.driverRateLabel')}
            value={t.driverPay.centsPerMile}
            onChange={(centsPerMile) => set({ driverPay: { mode: 'cpm', centsPerMile } })}
            step={1}
            suffix="¢/mi"
          />
        ) : (
          <Field
            label={tr(locale, 'trucks.form.driverShareLabel')}
            value={t.driverPay.percentOfGross}
            onChange={(percentOfGross) => set({ driverPay: { mode: 'percent', percentOfGross } })}
            step={1}
            suffix="%"
          />
        )}

        <Field
          label={tr(locale, 'trucks.form.truckPaymentLabel')}
          value={t.truckPaymentPerDay}
          onChange={(truckPaymentPerDay) => set({ truckPaymentPerDay })}
          step={5}
          prefix="$"
        />
        <Field
          label={tr(locale, 'trucks.form.insuranceLabel')}
          value={t.insurancePerDay}
          onChange={(insurancePerDay) => set({ insurancePerDay })}
          step={5}
          prefix="$"
        />
        <Field
          label={tr(locale, 'trucks.form.eldPermitsLabel')}
          value={t.eldPermitsPerDay}
          onChange={(eldPermitsPerDay) => set({ eldPermitsPerDay })}
          step={1}
          prefix="$"
        />
        <Field
          label={tr(locale, 'trucks.form.maintenanceLabel')}
          value={t.maintenanceCostPerMile}
          onChange={(maintenanceCostPerMile) => set({ maintenanceCostPerMile })}
          step={0.01}
          prefix="$"
          suffix="/mi"
        />
        <Field
          label={tr(locale, 'trucks.form.factoringLabel')}
          value={t.factoringPercent}
          onChange={(factoringPercent) => set({ factoringPercent })}
          step={0.5}
          suffix="%"
        />
        <Field
          label={tr(locale, 'trucks.form.dispatchLabel')}
          value={t.dispatchPercent}
          onChange={(dispatchPercent) => set({ dispatchPercent })}
          step={0.5}
          suffix="%"
        />
      </div>

      <Button variant="primary" size="lg" block className="mt-5" onClick={save}
        disabled={pending}>
        {pending ? tr(locale, 'trucks.common.saving') : id === null ? tr(locale, 'trucks.form.addTruck') : tr(locale, 'trucks.common.save')}
      </Button>
      {error && <p className="mt-2 text-[13px] text-bad-400">{error}</p>}
    </section>
  )
}

export const NEW_TRUCK: TruckInput = {
  number: '',
  driverName: '',
  mpg: 6.5,
  fuelPricePerGallon: 3.85,
  driverPay: { mode: 'cpm', centsPerMile: 60 },
  // 2026 US owner-operator market rates (researched): truck payment ~$1,200-2,400/mo
  // for a used Class 8, insurance ~$900-1,600/mo with own authority, ELD+IRP/IFTA
  // permits ~$220-340/mo combined.
  truckPaymentPerDay: 60,
  insurancePerDay: 40,
  eldPermitsPerDay: 8,
  maintenanceCostPerMile: 0.18,
  factoringPercent: 2,
  dispatchPercent: 0,
}
