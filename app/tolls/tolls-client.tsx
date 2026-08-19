'use client'

import { useState, useTransition } from 'react'
import { checkTolls, type TollCheck } from '@/app/actions'
import { FleetMap, type MapMarker, type MapRoute } from '@/components/fleet-map'
import { Button } from '@/components/button'
import { CityInput } from '@/components/city-input'
import { usd, usd2, driveTime } from '@/lib/fmt'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

/**
 * Форма и результат раздела платных дорог.
 *
 * Два маршрута показываем рядом, а не один: вопрос диспетчера — не «сколько
 * стоят толлы», а «объезжать или нет». Ответ на него это разница, и она сведена
 * в одну строку словами: считать её в уме над двумя колонками цифр никто не
 * станет, а решение принимают именно по ней.
 */
export function TollsClient({
  hasKey,
  used,
  cap,
  cities,
}: {
  hasKey: boolean
  used: number
  cap: number
  /** Подсказки для полей города: свои направления впереди, дальше грузовые узлы. */
  cities: string[]
}) {
  const locale = useLocale()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [axles, setAxles] = useState('5')
  const [weight, setWeight] = useState('80000')
  const [transponder, setTransponder] = useState(true)
  const [res, setRes] = useState<TollCheck | null>(null)
  const [pending, start] = useTransition()

  function run() {
    start(async () => {
      const r = await checkTolls({
        from,
        to,
        axles: Number(axles),
        grossWeightLb: Number(weight),
        transponder,
      })
      if ('error' in r) {
        setRes(null)
        notify('error', r.error)
      } else setRes(r)
    })
  }

  const markers: MapMarker[] = res
    ? [
        { lat: res.from.lat, lng: res.from.lng, label: from, kind: 'pickup' },
        { lat: res.to.lat, lng: res.to.lng, label: to, kind: 'dest' },
      ]
    : []

  const ends = res
    ? {
        from: [res.from.lat, res.from.lng] as [number, number],
        to: [res.to.lat, res.to.lng] as [number, number],
      }
    : null

  // Объезд рисуем ПЕРВЫМ, чтобы платный маршрут лёг поверх него: там, где они
  // совпадают, видна должна быть основная линия, а не пунктир под ней.
  const routes: MapRoute[] =
    res && ends
      ? [
          ...(res.free ? [{ ...ends, coords: res.free.coords, tone: 'free' as const }] : []),
          { ...ends, coords: res.toll.coords, tone: 'toll' as const },
        ]
      : []

  const input =
    'w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-haul-500'
  const label = 'mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/60'

  return (
    <div className="flex flex-col gap-4">
      {!hasKey && (
        <p className="rounded-xl border border-warn-400/30 bg-warn-500/[0.08] px-3.5 py-2.5 text-[13px] text-warn-400">
          {t(locale, 'tolls.noKey')}
        </p>
      )}

      <section className="panel relative z-20 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>{t(locale, 'tolls.from')}</span>
            <CityInput
              value={from}
              onChange={setFrom}
              cities={cities}
              placeholder="Philadelphia, PA"
              className={input}
            />
          </label>
          <label className="block">
            <span className={label}>{t(locale, 'tolls.to')}</span>
            <CityInput
              value={to}
              onChange={setTo}
              cities={cities}
              placeholder="Pittsburgh, PA"
              className={input}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block w-20">
            <span className={label}>{t(locale, 'tolls.axles')}</span>
            <input
              value={axles}
              onChange={(e) => setAxles(e.target.value)}
              inputMode="numeric"
              className={input}
            />
          </label>
          <label className="block w-28">
            <span className={label}>{t(locale, 'tolls.weight')}</span>
            <input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              inputMode="numeric"
              className={input}
            />
          </label>
          {/* Транспондер включён по умолчанию: он есть почти у всех, а тариф без
              него выше в разы — молчаливое «нет» завышало бы каждую оценку. */}
          <label className="flex cursor-pointer items-center gap-2 pb-2 text-[13px] text-white/80">
            <input
              type="checkbox"
              checked={transponder}
              onChange={(e) => setTransponder(e.target.checked)}
              className="size-4 accent-haul-500"
            />
            {t(locale, 'tolls.transponder')}
          </label>
          <Button variant="primary" className="ml-auto" disabled={pending || !hasKey} onClick={run}>
            {pending ? t(locale, 'tolls.calculating') : t(locale, 'tolls.calc')}
          </Button>
        </div>

        <p className="nums mt-2 text-[11px] text-white/40">
          {t(locale, 'tolls.usage')
            .replace('{used}', String(res?.used ?? used))
            .replace('{cap}', String(res?.cap ?? cap))}
        </p>
      </section>

      {res && (
        <>
          {/* Вердикт первым. Две колонки под ним — доказательство, а решение
              принимают по одной строке. */}
          {res.compare && (
            <section className={`panel p-4 ${res.compare.net > 0 ? 'border-good-500/25' : ''}`}>
              <p className="text-[15px] font-semibold">
                {res.compare.net > 0
                  ? t(locale, 'tolls.detourWorth').replace('{v}', usd.format(res.compare.net))
                  : t(locale, 'tolls.detourNot').replace('{v}', usd.format(-res.compare.net))}
              </p>
              <p className="nums mt-1 text-[12.5px] text-white/55">
                {t(locale, 'tolls.detourDetail')
                  .replace('{mi}', String(res.compare.extraMiles))
                  .replace('{time}', driveTime(Math.max(0, res.compare.extraMinutes), locale))
                  .replace('{cost}', usd.format(res.compare.extraCost))}
              </p>
            </section>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <RouteCard
              title={t(locale, 'tolls.withTolls')}
              miles={res.toll.miles}
              minutes={res.toll.minutes}
              tolls={res.toll.total}
              accent
            />
            {res.free && (
              <RouteCard
                title={t(locale, 'tolls.avoiding')}
                miles={res.free.miles}
                minutes={res.free.minutes}
                tolls={res.free.total}
              />
            )}
          </div>

          <section className="panel overflow-hidden p-0">
            <FleetMap markers={markers} routes={routes} height={340} distanceMi={res.toll.miles} />
          </section>

          <section className="panel p-4">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/62">
              {t(locale, 'tolls.plazas')}
            </h2>
            {res.toll.fares.length === 0 ? (
              <p className="text-[13px] text-white/55">{t(locale, 'tolls.noTolls')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {res.toll.fares.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] pb-1.5 text-[13px]"
                  >
                    <span className="min-w-0">
                      <span className="text-white/85">{f.name}</span>
                      {f.system && f.system !== f.name && (
                        <span className="ml-2 text-[11px] text-white/40">{f.system}</span>
                      )}
                    </span>
                    <span className="nums shrink-0 font-medium">{usd2.format(f.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function RouteCard({
  title,
  miles,
  minutes,
  tolls,
  accent,
}: {
  title: string
  miles: number
  minutes: number
  tolls: number
  accent?: boolean
}) {
  const locale = useLocale()
  return (
    <section className={`panel p-4 ${accent ? 'border-haul-500/25' : ''}`}>
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/62">{title}</h2>
      <p className={`nums mt-1.5 text-2xl font-bold ${tolls > 0 ? 'text-warn-400' : 'text-good-400'}`}>
        {usd.format(tolls)}
      </p>
      <p className="nums mt-1 text-[12.5px] text-white/55">
        {miles.toLocaleString('en-US')} mi · {driveTime(minutes, locale)}
      </p>
    </section>
  )
}
