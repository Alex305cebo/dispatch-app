'use client'

import { useRef, useState, useTransition } from 'react'
import { checkTolls, saveLoadTolls, tollsFromDocument, type TollCheck } from '@/app/actions'
import { FleetMap, type MapMarker, type MapRoute } from '@/components/fleet-map'
import { Button } from '@/components/button'
import { CityInput } from '@/components/city-input'
import { usd, usd2, driveTime } from '@/lib/fmt'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale, type MsgKey } from '@/lib/i18n'
import type { OptionBadge, RouteOption } from '@/lib/tolls'

/**
 * Раздел платных дорог: варианты маршрута, карта с пунктами оплаты и разбор.
 *
 * Главная мысль экрана — сравнивать варианты по ПОЛНОЙ стоимости, а не по одним
 * толлам. Маршрут с наименьшими толлами почти всегда самый длинный, и экономия
 * уходит в топливо и часы водителя; кнопка «меньше платных» без цены пробега
 * рядом советовала бы заведомо худшее.
 */
export function TollsClient({
  hasKey,
  used,
  cap,
  cities,
  trucks,
  loads,
}: {
  hasKey: boolean
  used: number
  cap: number
  cities: string[]
  trucks: { id: number; label: string }[]
  loads: { id: number; label: string }[]
}) {
  const locale = useLocale()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [axles, setAxles] = useState('5')
  const [weight, setWeight] = useState('80000')
  const [truckId, setTruckId] = useState('')
  const [loadId, setLoadId] = useState('')
  /** Точки, через которые маршрут обязан пройти, по порядку. */
  const [via, setVia] = useState<string[]>([])
  /** Момент выезда: часть дорог тарифицируется по часу. Пусто — «сейчас». */
  const [departure, setDeparture] = useState('')
  const [res, setRes] = useState<TollCheck | null>(null)
  const [chosen, setChosen] = useState(0)
  /** Пункт оплаты, к которому карта «летит» по щелчку в списке. */
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null)
  const [pending, start] = useTransition()
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function run(over?: { from?: string; to?: string; loadId?: string }) {
    const f = over?.from ?? from
    const t2 = over?.to ?? to
    const lid = over?.loadId ?? loadId
    start(async () => {
      const r = await checkTolls({
        from: f,
        to: t2,
        axles: Number(axles),
        grossWeightLb: Number(weight),
        truckId: truckId ? Number(truckId) : null,
        loadId: lid ? Number(lid) : null,
        via: via.filter((v) => v.trim()),
        departure: departure || null,
      })
      if ('error' in r) {
        setRes(null)
        notify('error', r.error)
      } else {
        setRes(r)
        setChosen(0)
        setFocus(null)
        if (r.options.length === 0) notify('warn', t(locale, 'tolls.noRoute'))
      }
    })
  }

  /** Скриншот DAT или rate con → города → сразу расчёт. */
  function onDocument(file: File | undefined) {
    if (!file) return
    setReading(true)
    const fd = new FormData()
    fd.append('file', file)
    void tollsFromDocument(fd)
      .then((r) => {
        if ('error' in r) {
          notify('error', r.error)
          return
        }
        setFrom(r.from)
        setTo(r.to)
        setLoadId('')
        notify('ok', `${r.from} → ${r.to}`)
        run({ from: r.from, to: r.to, loadId: '' })
      })
      .finally(() => setReading(false))
  }

  const option: RouteOption | null = res?.options[chosen] ?? null
  const best = res?.options[0] ?? null

  const markers: MapMarker[] = []
  const routes: MapRoute[] = []
  if (res && option) {
    const ends = {
      from: [res.from.lat, res.from.lng] as [number, number],
      to: [res.to.lat, res.to.lng] as [number, number],
    }
    // Невыбранные варианты — бледным и ПОД выбранным: видно, где пути расходятся,
    // но глаз держится основного.
    for (const [i, o] of res.options.slice(0, 3).entries())
      if (i !== chosen) routes.push({ ...ends, coords: o.coords, tone: 'free', id: o.id })
    routes.push({ ...ends, coords: option.coords, tone: 'toll', id: option.id })

    markers.push(
      { lat: res.from.lat, lng: res.from.lng, label: from || '—', kind: 'pickup' },
      { lat: res.to.lat, lng: res.to.lng, label: to || '—', kind: 'dest' },
    )
    // Пункты оплаты метками: раньше суммы были только списком, и «где именно
    // платят» приходилось воображать.
    for (const f of option.fares)
      for (const p of f.points)
        markers.push({
          lat: p.lat,
          lng: p.lng,
          label: `${usd2.format(f.amount)} · ${p.name || f.name}`,
          sub: f.system,
          tone: 'on',
        })
  }

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

        {/* Свои точки маршрута. Нужны там, где объехать нельзя в принципе: мосты
            и туннели Нью-Йорка платные все до одного, и «объезд» вокруг них —
            это лишняя сотня миль ради дороги, которой нет. Задав такую точку,
            диспетчер оставляет неизбежное неизбежным и ищет экономию дальше. */}
        {via.map((v, i) => (
          <div key={i} className="mt-3 flex items-end gap-2">
            <label className="block min-w-0 flex-1">
              <span className={label}>
                {t(locale, 'tolls.via')} {i + 1}
              </span>
              <CityInput
                value={v}
                onChange={(next) => setVia(via.map((x, j) => (j === i ? next : x)))}
                cities={cities}
                placeholder="New York, NY"
                className={input}
              />
            </label>
            <button
              type="button"
              onClick={() => setVia(via.filter((_, j) => j !== i))}
              className="mb-1 shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] text-white/45 transition-colors hover:bg-bad-500/10 hover:text-bad-400"
            >
              {t(locale, 'tolls.removeVia')}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setVia([...via, ''])}
          title={t(locale, 'tolls.viaHint')}
          className="mt-2 text-[12px] text-haul-400 transition-colors hover:underline"
        >
          {t(locale, 'tolls.addVia')}
        </button>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {/* Груз задаёт маршрут сам — города перепечатывать незачем. */}
          <label className="block">
            <span className={label}>{t(locale, 'tolls.load')}</span>
            <select
              value={loadId}
              onChange={(e) => {
                setLoadId(e.target.value)
                if (e.target.value) run({ loadId: e.target.value })
              }}
              className={input}
            >
              <option value="">{t(locale, 'tolls.noLoad')}</option>
              {loads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          {/* Цена лишней мили считается по экономике ИМЕННО этого трака: разные
              машины жгут по-разному, и на тысяче миль это решает исход. */}
          <label className="block">
            <span className={label}>{t(locale, 'tolls.truck')}</span>
            <select value={truckId} onChange={(e) => setTruckId(e.target.value)} className={input}>
              <option value="">{t(locale, 'tolls.anyTruck')}</option>
              {trucks.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.label}
                </option>
              ))}
            </select>
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
          {/* Часть дорог тарифицируется по часу: в Нью-Йорке и Чикаго пик дороже
              межпикового, и выехать на два часа позже иногда выгоднее объезда. */}
          <label className="block w-44">
            <span className={label}>{t(locale, 'tolls.departure')}</span>
            <input
              type="datetime-local"
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
              title={t(locale, 'tolls.departureHint')}
              className={input}
            />
          </label>

          <div className="ml-auto flex items-center gap-2">
            {/* Скриншот борда или рейт-кон вместо ручного ввода городов. */}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                onDocument(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <button
              type="button"
              disabled={reading || pending}
              onClick={() => fileRef.current?.click()}
              title={t(locale, 'tolls.fromDocHint')}
              className="rounded-xl border border-dashed border-white/20 px-3 py-2 text-[12.5px] text-white/70 transition-colors hover:border-haul-400/60 hover:text-haul-300 disabled:opacity-50"
            >
              {reading ? t(locale, 'tolls.reading') : t(locale, 'tolls.fromDoc')}
            </button>
            <Button variant="primary" disabled={pending || !hasKey} onClick={() => run()}>
              {pending ? t(locale, 'tolls.calculating') : t(locale, 'tolls.calc')}
            </Button>
          </div>
        </div>

        <p className="nums mt-2 text-[11px] text-white/40">
          {t(locale, 'tolls.usage')
            .replace('{used}', String(res?.used ?? used))
            .replace('{cap}', String(res?.cap ?? cap))}
        </p>
      </section>

      {res && option && best && (
        <>
          {/* Что толлы делают с прибылью КОНКРЕТНОГО груза — то, ради чего груз и
              берут. В расчёте прибыли (lib/profit.ts) толлов нет вовсе, то есть
              чистая по восточным рейсам всё это время была завышена. */}
          {res.load && (
            <section className="panel border-warn-400/25 p-4">
              <p className="text-[15px] font-semibold">
                {t(locale, 'tolls.loadImpact')
                  .replace('{before}', usd.format(res.load.netBefore))
                  .replace('{after}', usd.format(res.load.netBefore - option.total))}
              </p>
              <p className="mt-1 text-[12.5px] text-white/55">{res.load.lane}</p>
              {/* Записываем по кнопке, а не сами: маршрут считают и «на посмотреть»,
                  под ещё не взятый груз, и молча менять чужую чистую нельзя. */}
              <Button
                variant="primary"
                size="sm"
                className="mt-3"
                disabled={saving}
                onClick={() => {
                  const id = res.load!.id
                  setSaving(true)
                  void saveLoadTolls(id, option.total)
                    .then((r) => {
                      if (r?.error) notify('error', r.error)
                      else notify('ok', t(locale, 'tolls.savedToLoad'))
                    })
                    .finally(() => setSaving(false))
                }}
              >
                {t(locale, 'tolls.saveToLoad')}
              </Button>
            </section>
          )}

          <section className="panel p-4">
            <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
              {t(locale, 'tolls.options')}
            </h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {res.options.slice(0, 3).map((o, i) => (
                <OptionCard
                  key={o.id}
                  o={o}
                  active={i === chosen}
                  extra={o.totalCost - best.totalCost}
                  locale={locale}
                  onClick={() => {
                    setChosen(i)
                    setFocus(null)
                  }}
                />
              ))}
            </div>
          </section>

          <section className="panel overflow-hidden p-0">
            <FleetMap
              markers={markers}
              routes={routes}
              height="clamp(360px, 52vh, 660px)"
              distanceMi={option.miles}
              focus={focus}
              onRoute={(id) => {
                const i = res.options.findIndex((o) => o.id === id)
                if (i >= 0) {
                  setChosen(i)
                  setFocus(null)
                }
              }}
            />
          </section>

          <section className="panel p-4">
            <h2 className="mb-2 flex items-baseline justify-between gap-3 text-[11px] font-semibold uppercase tracking-wider text-white/62">
              {t(locale, 'tolls.plazas')}
              <span className="nums font-bold text-warn-400">{usd.format(option.total)}</span>
            </h2>
            {option.fares.length === 0 ? (
              <p className="text-[13px] text-white/55">{t(locale, 'tolls.noTolls')}</p>
            ) : (
              <ul className="flex flex-col">
                {option.fares.map((f, i) => {
                  const point = f.points[0]
                  return (
                    <li key={`${f.name}-${i}`}>
                      {/* Щелчок ведёт карту к рамке: список сумм сам по себе не
                          говорит, где именно платят, а решение часто зависит от
                          того, до или после развязки стоит пункт. */}
                      <button
                        type="button"
                        disabled={!point}
                        onClick={() => point && setFocus({ lat: point.lat, lng: point.lng })}
                        className="flex w-full items-baseline justify-between gap-3 border-b border-white/[0.06] px-1 py-2 text-left text-[13px] transition-colors enabled:hover:bg-white/[0.03] disabled:cursor-default"
                      >
                        <span className="min-w-0">
                          <span className="text-white/85">{f.name}</span>
                          {f.system && f.system !== f.name && (
                            <span className="ml-2 text-[11px] text-white/40">{f.system}</span>
                          )}
                        </span>
                        <span className="nums shrink-0 font-medium">{usd2.format(f.amount)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

const BADGE_KEY: Record<OptionBadge, MsgKey> = {
  cheapest: 'tolls.badge.cheapest',
  fastest: 'tolls.badge.fastest',
  shortest: 'tolls.badge.shortest',
  leastTolls: 'tolls.badge.leastTolls',
}

/**
 * Карточка варианта. Крупно — ПОЛНАЯ стоимость поездки, толлы и мили под ней:
 * решение принимают по сумме, а толлы отдельно — только её половина.
 */
function OptionCard({
  o,
  active,
  extra,
  locale,
  onClick,
}: {
  o: RouteOption
  active: boolean
  extra: number
  locale: Locale
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-colors ${
        active
          ? 'border-haul-400/60 bg-haul-500/[0.12]'
          : 'border-white/8 hover:border-white/20 hover:bg-white/[0.02]'
      }`}
    >
      <div className="flex min-h-4 flex-wrap items-center gap-1">
        {o.badges.map((b) => (
          <span
            key={b}
            className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${
              b === 'cheapest' ? 'bg-good-500/20 text-good-400' : 'bg-white/8 text-white/55'
            }`}
          >
            {t(locale, BADGE_KEY[b])}
          </span>
        ))}
      </div>
      {/* Крупно — ТОЛЛЫ: за ними в этот раздел и приходят. Полная стоимость
          поездки раньше стояла здесь, и «$817» при нулевых платных читалось как
          несуразно дорогой проезд. Она осталась, но строкой сравнения внизу, где
          и приносит пользу: ею объясняется, почему дешёвый по толлам вариант
          может оказаться дороже. */}
      <p className={`nums mt-1.5 text-xl font-bold ${o.total > 0 ? 'text-warn-400' : 'text-good-400'}`}>
        {usd.format(o.total)}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-white/40">
        {t(locale, 'tolls.tollsTotal')}
      </p>
      <p className="nums mt-1.5 text-[12px] text-white/60">
        {o.miles.toLocaleString('en-US')} mi · {driveTime(o.minutes, locale)}
      </p>
      <p className="nums mt-1 text-[11px] text-white/40" title={t(locale, 'tolls.fullCostHint')}>
        {extra <= 0
          ? `${t(locale, 'tolls.isBest')} · ${usd.format(o.totalCost)}`
          : t(locale, 'tolls.vsBest').replace('{v}', usd.format(extra))}
      </p>
    </button>
  )
}
