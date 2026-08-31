'use client'

import { Button } from '@/components/button'
// The load's "Детали" panel — read view by default, "Изменить" flips every field to
// an input so the dispatcher can fix whatever the RC parse got wrong. All fields
// feed the profit calc, so saving refreshes the page with new numbers.

import { useState, useTransition } from 'react'
import { brokerContactsFromHistory, findBrokerByName, runBrokerCheck, updateLoadDetails } from '@/app/actions'
import { usd, usd2 } from '@/lib/fmt'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export type LoadDetails = {
  id: number
  rate: number
  loadedMiles: number
  deadheadMiles: number
  transitDays: number
  spotRpm: number | null
  brokerName: string | null
  brokerMc: string | null
  brokerPhone: string | null
  brokerEmail: string | null
  truckLocation: string | null
  pickupAddress: string | null
  deliveryAddress: string | null
  pickupDate: string | null
  deliveryDate: string | null
  /** Окно из рейт-кона («8/14/2026 09:00-13:00»), если оно было прочитано. */
  pickupTime?: string | null
  deliveryTime?: string | null
  /** Наш собственный средний $/милю по этому направлению — подпорка на месте
   * биржевого спот-рейта, которого у нас нет ни от одного бесплатного источника. */
  laneAvgRpm?: number | null
}

export function LoadEditNumbers({ load }: { load: LoadDetails }) {
  const locale = useLocale()
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()

  // Form state as strings (inputs), seeded from the load.
  const [f, setF] = useState({
    rate: String(load.rate),
    loadedMiles: String(load.loadedMiles),
    deadheadMiles: String(load.deadheadMiles),
    transitDays: String(load.transitDays),
    spotRpm: load.spotRpm != null ? String(load.spotRpm) : '',
    brokerName: load.brokerName ?? '',
    brokerMc: load.brokerMc ?? '',
    brokerPhone: load.brokerPhone ?? '',
    brokerEmail: load.brokerEmail ?? '',
    pickupDate: load.pickupDate ?? '',
    deliveryDate: load.deliveryDate ?? '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value })

  // Поиск MC по названию. MC печатают не все брокеры, а без него ни проверить
  // контору, ни выставить счёт; название на бумаге есть всегда.
  const [hits, setHits] = useState<
    { dot: string; legalName: string; dbaName: string | null; city: string | null; state: string | null; active: boolean }[]
  >([])
  const [lookup, startLookup] = useTransition()

  function findMc() {
    setHits([])
    startLookup(async () => {
      const res = await findBrokerByName(f.brokerName)
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      setHits(res.results)
    })
  }

  /** Выбрали компанию — достаём её MC (по DOT, уже существующей проверкой). */
  function pick(dot: string, legalName: string) {
    startLookup(async () => {
      const res = await runBrokerCheck('dot', dot)
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      setF((prev) => ({ ...prev, brokerMc: res.mc ?? prev.brokerMc, brokerName: legalName || prev.brokerName }))
      setHits([])
      if (!res.mc) notify('warn', t(locale, 'loadEdit.noMcForCompany'))
    })
  }

  // Почты в FMCSA нет вовсе, поэтому адрес для счёта берётся из наших же прошлых
  // грузов этого брокера: один раз вписали — дальше подставляется.
  function fromHistory() {
    startLookup(async () => {
      const h = await brokerContactsFromHistory(f.brokerName || load.brokerName, f.brokerMc || load.brokerMc)
      if (!h.email && !h.phone && !h.mc) {
        notify('warn', t(locale, 'loadEdit.nothingInHistory'))
        return
      }
      setF((prev) => ({
        ...prev,
        brokerEmail: prev.brokerEmail || h.email || '',
        brokerPhone: prev.brokerPhone || h.phone || '',
        brokerMc: prev.brokerMc || h.mc || '',
      }))
    })
  }

  function save() {
    start(async () => {
      const res = await updateLoadDetails(load.id, {
        rate: Number(f.rate) || 0,
        loadedMiles: Number(f.loadedMiles) || 0,
        deadheadMiles: Number(f.deadheadMiles) || 0,
        transitDays: Number(f.transitDays) || 0,
        spotRpm: f.spotRpm.trim() === '' ? null : Number(f.spotRpm),
        brokerName: f.brokerName.trim() || null,
        brokerMc: f.brokerMc.trim() || null,
        brokerPhone: f.brokerPhone.trim() || null,
        brokerEmail: f.brokerEmail.trim() || null,
        pickupDate: f.pickupDate || null,
        deliveryDate: f.deliveryDate || null,
      })
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', t(locale, 'loadEdit.updatedToast'))
        setEditing(false)
      }
    })
  }

  if (!editing) {
    return (
      <>
        {/* Четыре смысловых блока вместо одной перемешанной сетки: раньше «Ставка»
            соседствовала с милями, телефон с пикапом, и глаз собирал ответ по всей
            карточке. Теперь деньги — к деньгам, брокер — к брокеру. Пустые поля
            рисуются прочерком: «в рейт-коне нет MC» видно, а не спрятано. */}
        <div className="grid gap-3 text-[13px] sm:grid-cols-2">
          <div className="rounded-xl border border-white/6 bg-white/[0.02] p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              {t(locale, 'loadEdit.groupMoney')}
            </div>
            <dl className="grid gap-y-2">
              <Row label={t(locale, 'loadEdit.rate')} value={usd.format(load.rate)} />
              {/* Ставку за милю раньше считали в голове — а это первая цифра,
                  по которой решают, хорош ли груз. */}
              <Row
                label={t(locale, 'loadEdit.perMile')}
                value={load.loadedMiles > 0 ? `${usd2.format(load.rate / load.loadedMiles)}/mi` : '—'}
              />
              <Row
                label={t(locale, 'loadEdit.spotRate')}
                value={load.spotRpm ? `${usd2.format(load.spotRpm)}/mi` : '—'}
                // Биржевого фида у нас нет, и вечный прочерк ни о чём не говорит. Вместо
                // него — единственная честная опора: сколько мы сами брали на этом
                // направлении раньше.
                hint={
                  load.spotRpm
                    ? undefined
                    : load.laneAvgRpm
                      ? `${t(locale, 'loadEdit.ourLaneAvg')} ${usd2.format(load.laneAvgRpm)}/mi`
                      : t(locale, 'loadEdit.noMarketData')
                }
              />
            </dl>
          </div>

          <div className="rounded-xl border border-white/6 bg-white/[0.02] p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              {t(locale, 'loadEdit.groupTrip')}
            </div>
            <dl className="grid gap-y-2">
              <Row label={t(locale, 'loadEdit.loadedMiles')} value={`${load.loadedMiles} mi`} />
              <Row label={t(locale, 'loadEdit.deadheadMiles')} value={`${load.deadheadMiles} mi`} />
              <Row label={t(locale, 'loadEdit.transitDays')} value={String(load.transitDays)} />
              {load.truckLocation && <Row label={t(locale, 'loadEdit.truckWasAt')} value={load.truckLocation} />}
            </dl>
          </div>

          <div className="rounded-xl border border-white/6 bg-white/[0.02] p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              {t(locale, 'loadEdit.groupBroker')}
            </div>
            <dl className="grid gap-y-2">
              <Row label={t(locale, 'loadEdit.brokerName')} value={load.brokerName ?? '—'} />
              <Row label={t(locale, 'loadEdit.brokerMc')} value={load.brokerMc ?? '—'} />
              <Row
                label={t(locale, 'loadEdit.phone')}
                value={load.brokerPhone ?? '—'}
                href={load.brokerPhone ? `tel:${load.brokerPhone}` : undefined}
              />
              <Row
                label={t(locale, 'loadEdit.invoiceTo')}
                value={load.brokerEmail ?? '—'}
                href={load.brokerEmail ? `mailto:${load.brokerEmail}` : undefined}
              />
            </dl>
          </div>

          <div className="rounded-xl border border-white/6 bg-white/[0.02] p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              {t(locale, 'loadEdit.groupDates')}
            </div>
            <dl className="grid gap-y-2">
              {/* Окно из рейт-кона («8/14/2026 09:00-13:00») информативнее голой
                  даты — диспетчеру нужен именно интервал. */}
              <Row label={t(locale, 'loadEdit.pickup')} value={load.pickupTime || load.pickupDate || '—'} />
              {/* Полный адрес из рейт-кона — прямо под окном: раньше за ним
                  ходили в сам документ или на карту. */}
              {load.pickupAddress && <Addr text={load.pickupAddress} />}
              <Row label={t(locale, 'loadEdit.delivery')} value={load.deliveryTime || load.deliveryDate || '—'} />
              {load.deliveryAddress && <Addr text={load.deliveryAddress} />}
            </dl>
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="mt-3 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white"
        >
          {t(locale, 'loadEdit.edit')}
        </button>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t(locale, 'loadEdit.rateDollar')} value={f.rate} onChange={set('rate')} />
        <Field label="Loaded miles" value={f.loadedMiles} onChange={set('loadedMiles')} />
        <Field label={t(locale, 'loadEdit.deadheadMiles')} value={f.deadheadMiles} onChange={set('deadheadMiles')} />
        <Field label={t(locale, 'loadEdit.transitDays')} value={f.transitDays} onChange={set('transitDays')} />
        <Field label="Spot rate $/mi" value={f.spotRpm} onChange={set('spotRpm')} placeholder="—" />
        <Field label={t(locale, 'loadEdit.brokerName')} value={f.brokerName} onChange={set('brokerName')} text />
        <Field label={t(locale, 'loadEdit.brokerMc')} value={f.brokerMc} onChange={set('brokerMc')} text />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={lookup || f.brokerName.trim().length < 3} onClick={findMc}>
          {lookup ? t(locale, 'loadEdit.findingMc') : t(locale, 'loadEdit.findMc')}
        </Button>
        <Button size="sm" variant="secondary" disabled={lookup} onClick={fromHistory}>
          {t(locale, 'loadEdit.fromHistory')}
        </Button>
      </div>

      {hits.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-ink-950/60 p-2">
          <p className="px-1 pb-1 text-[11px] text-white/45">{t(locale, 'loadEdit.pickCompany')}</p>
          <div className="flex flex-col gap-1">
            {/* Выбирает человек: у крупного брокера в реестре десятки строк —
                перевозчик, брокерская контора, дочерние фирмы, — и подставить
                наугад значит отправить счёт не туда. */}
            {hits.map((h) => (
              <button
                key={h.dot}
                type="button"
                disabled={lookup}
                onClick={() => pick(h.dot, h.legalName)}
                className="rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/8 disabled:opacity-50"
              >
                <span className="block truncate text-[12.5px] font-medium text-white/85">
                  {h.legalName}
                  {h.dbaName ? ` (dba ${h.dbaName})` : ''}
                </span>
                <span className="block truncate text-[11px] text-white/45">
                  DOT {h.dot}
                  {h.city ? ` · ${h.city}, ${h.state ?? ''}` : ''}
                  {h.active ? '' : ` · ${t(locale, 'loadEdit.notAllowed')}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={t(locale, 'loadEdit.phone')} value={f.brokerPhone} onChange={set('brokerPhone')} text />
        <Field label="Email" value={f.brokerEmail} onChange={set('brokerEmail')} text />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t(locale, 'loadEdit.pickup')} value={f.pickupDate} onChange={set('pickupDate')} type="date" />
        <Field label={t(locale, 'loadEdit.delivery')} value={f.deliveryDate} onChange={set('deliveryDate')} type="date" />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" disabled={pending}
          onClick={save}>
          {pending ? t(locale, 'loadEdit.saving') : t(locale, 'loadEdit.save')}
        </Button>
        <button
          onClick={() => setEditing(false)}
          className="rounded-lg px-4 py-2 text-[13px] text-white/70 transition-colors hover:text-white"
        >
          {t(locale, 'loadEdit.cancel')}
        </button>
      </div>
    </div>
  )
}

// Was nested inside LoadEditNumbers — a new function identity every render, so
// React tore down and remounted the <input> on every keystroke, dropping focus
// and characters. Hoisted out so its identity (and the DOM node) stays stable.
function Field({
  label,
  value,
  onChange,
  text,
  type,
  placeholder,
}: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  text?: boolean
  type?: 'date'
  placeholder?: string
}) {
  const input =
    'w-full rounded-lg border border-white/10 bg-ink-950/70 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500'
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-white/55">{label}</span>
      <input
        type={type ?? (text ? 'text' : 'number')}
        inputMode={type || text ? undefined : 'decimal'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={input}
      />
    </label>
  )
}

/** Адрес точки — своей строкой под окном: инлайном с датой он не читался. */
function Addr({ text }: { text: string }) {
  return (
    <div className="-mt-1 border-b border-white/[0.06] pb-1.5 pl-3 text-[12px] leading-snug text-white/55">
      📍 {text}
    </div>
  )
}

function Row({
  label,
  value,
  href,
  hint,
}: {
  label: string
  value: string
  href?: string
  /** Приписка под значением — чем заменить прочерк, когда самого значения нет. */
  hint?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-1.5">
      <dt className="shrink-0 text-white/60">{label}</dt>
      <dd className="nums min-w-0 text-right font-medium">
        {href ? (
          <a href={href} className="text-haul-400 hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
        {hint && <span className="ml-1.5 text-[11px] font-normal text-white/40">{hint}</span>}
      </dd>
    </div>
  )
}
