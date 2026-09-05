'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Locale } from '@/lib/i18n'
import type { LoadStatus } from '@/lib/map'

type DriverLoad = {
  id: number
  status: LoadStatus
  origin: string | null
  destination: string | null
  pickupAddress: string | null
  deliveryAddress: string | null
  pickupDate: string | null
  deliveryDate: string | null
  pickupTime: string | null
  deliveryTime: string | null
  brokerName: string | null
  brokerPhone: string | null
  referenceId: string | null
  hasBol: boolean
  hasPod: boolean
  photos: number
}

type Ev = { id: number; kind: string; note: string | null; at: string }

const EVENT_KEY = {
  arrived_pickup: 'driver.ev.arrivedPickup',
  loaded: 'driver.ev.loaded',
  arrived_delivery: 'driver.ev.arrivedDelivery',
  delivered: 'driver.ev.delivered',
  note: 'driver.ev.note',
  photo: 'driver.ev.photo',
} as const

const mapsHref = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
const clock = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/**
 * Страница водителя: где он сейчас в рейсе, один следующий шаг крупной кнопкой,
 * адреса, звонки, фото и сообщение диспетчеру. Всё крупно — читается на стоянке,
 * нажимается большим пальцем. Шаги идут по порядку: приехал на погрузку →
 * загрузился → приехал на выгрузку → выгрузился; время каждого — диспетчеру.
 */
export function DriverClient({
  token,
  locale,
  load,
  events,
  dispatcherPhone,
}: {
  token: string
  locale: Locale
  load: DriverLoad | null
  events: Ev[]
  dispatcherPhone: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const bolRef = useRef<HTMLInputElement>(null)
  const podRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  async function post(fd: FormData, key: string) {
    setBusy(key)
    setMsg(null)
    try {
      const r = await fetch(`/api/driver/${token}`, { method: 'POST', body: fd })
      const j = (await r.json()) as { ok?: boolean }
      if (!r.ok || !j.ok) setMsg(t(locale, 'driver.failed'))
      else {
        setMsg(t(locale, 'driver.done'))
        router.refresh()
      }
    } catch {
      setMsg(t(locale, 'driver.failed'))
    } finally {
      setBusy(null)
    }
  }
  const act = (fields: Record<string, string>, key: string) => {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) fd.append(k, v)
    void post(fd, key)
  }
  function upload(kind: 'bol' | 'pod' | 'photo', files: FileList | null) {
    if (!files || !files.length) return
    const fd = new FormData()
    fd.append('action', 'photo')
    fd.append('kind', kind)
    for (const f of Array.from(files)) fd.append('file', f)
    void post(fd, kind)
  }

  const big =
    'flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-[16px] font-bold transition-transform active:scale-[0.98] disabled:opacity-50'

  // Где водитель в рейсе — по статусу и по последней отметке «приехал».
  const arrivedPickup = events.some((e) => e.kind === 'arrived_pickup')
  const arrivedDelivery = events.some((e) => e.kind === 'arrived_delivery')
  const step: 0 | 1 | 2 | 3 | 4 = !load
    ? 0
    : load.status === 'booked'
      ? arrivedPickup
        ? 1
        : 0
      : load.status === 'in_transit'
        ? arrivedDelivery
          ? 3
          : 2
        : 4
  const STEPS = ['driver.step.toPickup', 'driver.step.atPickup', 'driver.step.toDelivery', 'driver.step.atDelivery', 'driver.step.done'] as const

  const stop = (label: string, addr: string | null, city: string | null, date: string | null, time: string | null, active: boolean) => {
    const where = addr || city || '—'
    return (
      <div className={`rounded-xl border p-3 ${active ? 'border-haul-400/60 bg-haul-500/[0.08]' : 'border-white/10 bg-white/[0.03]'}`}>
        <div className="text-[11px] uppercase tracking-wider text-white/50">
          {label}
          {active && <span className="ml-2 rounded bg-haul-500/25 px-1.5 py-0.5 text-[10px] normal-case text-haul-200">{t(locale, 'driver.next')}</span>}
        </div>
        <div className="mt-0.5 text-[15px] font-semibold leading-snug">{where}</div>
        {(date || time) && (
          <div className="nums mt-0.5 text-[13px] text-white/70">
            {date ? date.slice(0, 10) : ''}
            {time ? ` · ${time}` : ''}
          </div>
        )}
        <a href={mapsHref(where)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-haul-500/15 px-3 py-1.5 text-[13px] font-semibold text-haul-300">
          📍 {t(locale, 'driver.openMap')}
        </a>
      </div>
    )
  }

  return (
    <>
      {load && (
        <section className="panel mt-4 p-4">
          {/* Полоса шагов: видно, где он и что дальше. */}
          <ol className="flex items-center gap-1 text-[10px] uppercase tracking-wider">
            {STEPS.slice(0, 4).map((k, i) => (
              <li key={k} className="flex flex-1 items-center gap-1">
                <span className={`size-2.5 shrink-0 rounded-full ${i < step ? 'bg-good-400' : i === step ? 'bg-haul-400 ring-4 ring-haul-500/25' : 'bg-white/15'}`} />
                <span className={`truncate ${i === step ? 'text-white' : 'text-white/40'}`}>{t(locale, k)}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 text-[18px] font-bold leading-snug">
            {load.origin ?? '—'} → {load.destination ?? '—'}
          </div>
          <div className="mt-0.5 text-[13px] text-white/60">
            {t(locale, STEPS[step])}
            {load.referenceId ? ` · #${load.referenceId}` : ''}
          </div>

          {/* ОДИН следующий шаг — большой кнопкой прямо под заголовком. */}
          <div className="mt-3">
            {step === 0 && (
              <button type="button" disabled={!!busy} onClick={() => act({ action: 'arrived' }, 'arrived')} className={`${big} bg-haul-500 text-white`}>
                📍 {busy === 'arrived' ? t(locale, 'driver.sending') : t(locale, 'driver.arrivedPickup')}
              </button>
            )}
            {step === 1 && (
              <button type="button" disabled={!!busy} onClick={() => act({ action: 'status', to: 'in_transit' }, 'in_transit')} className={`${big} bg-haul-500 text-white`}>
                🚚 {busy === 'in_transit' ? t(locale, 'driver.sending') : t(locale, 'driver.loaded')}
              </button>
            )}
            {step === 2 && (
              <button type="button" disabled={!!busy} onClick={() => act({ action: 'arrived' }, 'arrived')} className={`${big} bg-haul-500 text-white`}>
                📍 {busy === 'arrived' ? t(locale, 'driver.sending') : t(locale, 'driver.arrivedDelivery')}
              </button>
            )}
            {step === 3 && (
              <button type="button" disabled={!!busy} onClick={() => act({ action: 'status', to: 'delivered' }, 'delivered')} className={`${big} bg-good-500 text-white`}>
                ✅ {busy === 'delivered' ? t(locale, 'driver.sending') : t(locale, 'driver.delivered')}
              </button>
            )}
            {step === 4 && <p className="rounded-xl bg-good-500/10 px-4 py-3 text-center text-[14px] font-medium text-good-400">{t(locale, 'driver.allDone')}</p>}
            {/* Пропустил «приехал» — можно сразу «загрузился/выгрузился», мелкой кнопкой. */}
            {(step === 0 || step === 2) && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => act({ action: 'status', to: step === 0 ? 'in_transit' : 'delivered' }, 'skip')}
                className="mt-2 w-full rounded-lg py-1.5 text-[12.5px] text-white/50 underline-offset-2 hover:underline"
              >
                {t(locale, step === 0 ? 'driver.alreadyLoaded' : 'driver.alreadyDelivered')}
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {stop(t(locale, 'driver.pickup'), load.pickupAddress, load.origin, load.pickupDate, load.pickupTime, step <= 1)}
            {stop(t(locale, 'driver.delivery'), load.deliveryAddress, load.destination, load.deliveryDate, load.deliveryTime, step === 2 || step === 3)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {load.brokerPhone && (
              <a href={`tel:${load.brokerPhone}`} className="rounded-xl border border-white/15 px-4 py-2 text-[14px] font-semibold">
                📞 {t(locale, 'driver.callBroker')}
                {load.brokerName ? ` · ${load.brokerName}` : ''}
              </a>
            )}
            {dispatcherPhone && (
              <a href={`tel:${dispatcherPhone}`} className="rounded-xl border border-white/15 px-4 py-2 text-[14px] font-semibold">
                📞 {t(locale, 'driver.callDispatch')}
              </a>
            )}
          </div>
        </section>
      )}

      {load && (
        <section className="mt-4">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-white/50">{t(locale, 'driver.docsHeading')}</p>
          <input ref={bolRef} type="file" accept="image/*,application/pdf" capture="environment" multiple className="hidden" onChange={(e) => { upload('bol', e.target.files); e.target.value = '' }} />
          <input ref={podRef} type="file" accept="image/*,application/pdf" capture="environment" multiple className="hidden" onChange={(e) => { upload('pod', e.target.files); e.target.value = '' }} />
          <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { upload('photo', e.target.files); e.target.value = '' }} />
          <div className="grid grid-cols-2 gap-3">
            <button type="button" disabled={!!busy} onClick={() => bolRef.current?.click()} className={`${big} border-2 ${load.hasBol ? 'border-good-500/40 text-good-400' : 'border-warn-400/50 text-warn-400'}`}>
              📄 {busy === 'bol' ? t(locale, 'driver.sending') : load.hasBol ? t(locale, 'driver.bolDone') : t(locale, 'driver.bolPhoto')}
            </button>
            <button type="button" disabled={!!busy} onClick={() => podRef.current?.click()} className={`${big} border-2 ${load.hasPod ? 'border-good-500/40 text-good-400' : 'border-warn-400/50 text-warn-400'}`}>
              📄 {busy === 'pod' ? t(locale, 'driver.sending') : load.hasPod ? t(locale, 'driver.podDone') : t(locale, 'driver.podPhoto')}
            </button>
          </div>
          <button type="button" disabled={!!busy} onClick={() => photoRef.current?.click()} className={`${big} mt-3 border-2 border-white/15 text-white/85`}>
            📷 {busy === 'photo' ? t(locale, 'driver.sending') : t(locale, 'driver.cargoPhoto')}
            {load.photos > 0 && <span className="nums text-[13px] font-medium text-white/50">· {load.photos}</span>}
          </button>
          <p className="mt-2 text-center text-[12px] text-white/45">{t(locale, 'driver.docsHint')}</p>
        </section>
      )}

      {/* Сообщение диспетчеру — сломался, задержка, вопрос. Пишет сам водитель. */}
      <section className="mt-4">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-white/50">{t(locale, 'driver.noteHeading')}</p>
        <div className="flex flex-wrap gap-2">
          {(['driver.quick.delay', 'driver.quick.breakdown', 'driver.quick.waiting', 'driver.quick.question'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setNote(t(locale, k))}
              className="rounded-full border border-white/15 px-3 py-1 text-[12.5px] text-white/80 hover:border-white/35"
            >
              {t(locale, k)}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(locale, 'driver.notePlaceholder')}
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-ink-950/60 px-3 py-2.5 text-[14px] outline-none focus:border-haul-400"
          />
          <button
            type="button"
            disabled={!!busy || !note.trim()}
            onClick={() => {
              act({ action: 'note', text: note.trim() }, 'note')
              setNote('')
            }}
            className="rounded-xl bg-haul-500 px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {busy === 'note' ? '…' : t(locale, 'driver.send')}
          </button>
        </div>
      </section>

      {msg && <p className="mt-3 text-center text-[14px] font-medium text-white/80">{msg}</p>}

      {events.length > 0 && (
        <section className="mt-5">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-white/50">{t(locale, 'driver.historyHeading')}</p>
          <ul className="flex flex-col gap-1 text-[12.5px]">
            {[...events].reverse().slice(0, 8).map((e) => (
              <li key={e.id} className="flex items-baseline gap-2 text-white/70">
                <span className="nums shrink-0 text-white/45">{clock(e.at)}</span>
                <span>
                  {t(locale, EVENT_KEY[e.kind as keyof typeof EVENT_KEY] ?? 'driver.ev.note')}
                  {e.note ? `: ${e.note}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-4 text-center text-[12px] text-white/45">{t(locale, 'driver.hint')}</p>
    </>
  )
}

/** Язык — кнопки внизу; своя cookie, не приложения: у водителя свой телефон. */
export function LangSwitch({ locale }: { locale: Locale }) {
  const router = useRouter()
  const pick = (l: string) => {
    document.cookie = `driver_locale=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    router.refresh()
  }
  return (
    <div className="mt-6 flex justify-center gap-2">
      {(['en', 'ru', 'es', 'uk', 'ro', 'kk'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => pick(l)}
          className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold uppercase ${l === locale ? 'bg-white/15 text-white' : 'text-white/45'}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
