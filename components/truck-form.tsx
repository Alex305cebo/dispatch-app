'use client'

import { useState, useTransition } from 'react'
import { addTruck, fetchDiesel, saveTruck, type TruckInput } from '@/app/actions'
import { notify } from '@/lib/notify'
import { Field, TextField } from '@/components/ui'
import { Info } from '@/components/info'

export function TruckForm({ id, initial }: { id: number | null; initial: TruckInput }) {
  const [t, setT] = useState<TruckInput>(initial)
  const [pending, start] = useTransition()
  const [dieselBusy, startDiesel] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const set = (patch: Partial<TruckInput>) => setT({ ...t, ...patch })

  function save() {
    setError(null)
    if (!t.number.trim()) {
      setError('Укажи номер трака.')
      return
    }
    start(async () => {
      // addTruck redirects on success and never returns; saveTruck returns void.
      const res = id === null ? await addTruck(t) : await saveTruck(id, t)
      if (res?.error) {
        setError(res.error)
        notify('error', `Трак не сохранился: ${res.error}`)
        return
      }
      notify('ok', id === null ? 'Трак добавлен' : 'Трак сохранён — расчёты пересчитаны')
    })
  }

  return (
    <section className="panel max-w-2xl p-5">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/50">Трак</h3>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Номер трака"
          value={t.number}
          onChange={(number) => set({ number })}
          placeholder="425"
        />
        <TextField
          label="Имя водителя"
          value={t.driverName}
          onChange={(driverName) => set({ driverName })}
          placeholder="Ravil"
        />
      </div>

      <h3 className="mb-3 mt-6 text-[11px] font-semibold uppercase tracking-wider text-white/50">
        Экономика
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="MPG · миль на галлон" value={t.mpg} onChange={(mpg) => set({ mpg })} step={0.1} />
        <div>
          <Field
            label="Дизель"
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
                  notify('ok', `Дизель по стране (EIA): $${res.price} на ${res.asOf}`)
                } else
                  notify(
                    'warn',
                    res.error === 'no_key' ? 'Нет ключа EIA' : `Не вышло: ${res.error}`,
                  )
              })
            }
            className="mt-1 text-[11px] text-haul-400 hover:underline disabled:text-white/30"
          >
            {dieselBusy ? 'тяну…' : 'текущий по стране (EIA)'}
          </button>
          <span className="ml-1.5 inline-block align-middle">
            <Info text="Подставит актуальную среднюю цену дизеля по США из официальных данных EIA (обновляется еженедельно) — чтобы себестоимость топлива в расчётах была реальной, а не устаревшей. Нужен бесплатный ключ EIA." />
          </span>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/65">
            Оплата водителя
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
            <option value="cpm">Центы за милю</option>
            <option value="percent">% от гросса</option>
          </select>
        </label>

        {t.driverPay.mode === 'cpm' ? (
          <Field
            label="Ставка водителя"
            value={t.driverPay.centsPerMile}
            onChange={(centsPerMile) => set({ driverPay: { mode: 'cpm', centsPerMile } })}
            step={1}
            suffix="¢/mi"
          />
        ) : (
          <Field
            label="Доля водителя"
            value={t.driverPay.percentOfGross}
            onChange={(percentOfGross) => set({ driverPay: { mode: 'percent', percentOfGross } })}
            step={1}
            suffix="%"
          />
        )}

        <Field
          label="Постоянные расходы/день"
          value={t.fixedCostPerDay}
          onChange={(fixedCostPerDay) => set({ fixedCostPerDay })}
          step={10}
          prefix="$"
        />
        <Field
          label="Обслуживание"
          value={t.maintenanceCostPerMile}
          onChange={(maintenanceCostPerMile) => set({ maintenanceCostPerMile })}
          step={0.01}
          prefix="$"
          suffix="/mi"
        />
        <Field
          label="Факторинг"
          value={t.factoringPercent}
          onChange={(factoringPercent) => set({ factoringPercent })}
          step={0.5}
          suffix="%"
        />
        <Field
          label="Диспетч"
          value={t.dispatchPercent}
          onChange={(dispatchPercent) => set({ dispatchPercent })}
          step={0.5}
          suffix="%"
        />
      </div>

      <button
        onClick={save}
        disabled={pending}
        className="mt-5 w-full rounded-xl bg-haul-500 py-3 text-[15px] font-semibold transition-colors hover:bg-haul-400 disabled:bg-white/8 disabled:text-white/55"
      >
        {pending ? 'Сохраняю…' : id === null ? 'Добавить трак' : 'Сохранить'}
      </button>
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
  fixedCostPerDay: 250,
  maintenanceCostPerMile: 0.18,
  factoringPercent: 2,
  dispatchPercent: 0,
}
