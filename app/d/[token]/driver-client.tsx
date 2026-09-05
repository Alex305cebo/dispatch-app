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

const STATUS_KEY = {
  quoted: 'driver.status.quoted',
  booked: 'driver.status.booked',
  in_transit: 'driver.status.in_transit',
  delivered: 'driver.status.delivered',
  paid: 'driver.status.paid',
  cancelled: 'driver.status.cancelled',
} as const

const mapsHref = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`

/** Страница водителя: груз, адреса и три больших кнопки. Всё крупно — читается за
 * рулём на стоянке, нажимается большим пальцем. */
export function DriverClient({
  token,
  locale,
  load,
  dispatcherPhone,
}: {
  token: string
  locale: Locale
  load: DriverLoad
  dispatcherPhone: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const bolRef = useRef<HTMLInputElement>(null)
  const podRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  async function post(fd: FormData, key: string) {
    setBusy(key)
    setMsg(null)
    try {
      const r = await fetch(`/api/driver/${token}`, { method: 'POST', body: fd })
      const j = (await r.json()) as { ok?: boolean; error?: string; saved?: number }
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

  function setStatus(to: 'in_transit' | 'delivered') {
    const fd = new FormData()
    fd.append('action', 'status')
    fd.append('to', to)
    void post(fd, to)
  }

  function upload(kind: 'bol' | 'pod' | 'photo', files: FileList | null) {
    if (!files || !files.length) return
    const fd = new FormData()
    fd.append('action', 'photo')
    fd.append('kind', kind)
    for (const f of Array.from(files)) fd.append('file', f)
    void post(fd, kind)
  }

  const stop = (label: string, addr: string | null, city: string | null, date: string | null, time: string | null) => {
    const where = addr || city || '—'
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="text-[11px] uppercase tracking-wider text-white/50">{label}</div>
        <div className="mt-0.5 text-[15px] font-semibold leading-snug">{where}</div>
        {(date || time) && (
          <div className="nums mt-0.5 text-[13px] text-white/70">
            {date ? date.slice(0, 10) : ''}
            {time ? ` · ${time}` : ''}
          </div>
        )}
        <a
          href={mapsHref(where)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-haul-500/15 px-3 py-1.5 text-[13px] font-semibold text-haul-300"
        >
          📍 {t(locale, 'driver.openMap')}
        </a>
      </div>
    )
  }

  const big =
    'flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-[16px] font-bold transition-transform active:scale-[0.98] disabled:opacity-50'

  return (
    <>
      <section className="panel mt-4 p-4">
        <div className="text-[11px] uppercase tracking-wider text-white/50">{t(locale, 'driver.currentLoad')}</div>
        <div className="mt-1 text-[18px] font-bold leading-snug">
          {load.origin ?? '—'} → {load.destination ?? '—'}
        </div>
        <div className="mt-1 text-[13px] text-white/60">
          {t(locale, STATUS_KEY[load.status])}
          {load.referenceId ? ` · #${load.referenceId}` : ''}
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {stop(t(locale, 'driver.pickup'), load.pickupAddress, load.origin, load.pickupDate, load.pickupTime)}
          {stop(t(locale, 'driver.delivery'), load.deliveryAddress, load.destination, load.deliveryDate, load.deliveryTime)}
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

      <section className="mt-4 flex flex-col gap-3">
        {load.status === 'booked' && (
          <button type="button" disabled={!!busy} onClick={() => setStatus('in_transit')} className={`${big} bg-haul-500 text-white`}>
            🚚 {busy === 'in_transit' ? t(locale, 'driver.sending') : t(locale, 'driver.loaded')}
          </button>
        )}
        {load.status === 'in_transit' && (
          <button type="button" disabled={!!busy} onClick={() => setStatus('delivered')} className={`${big} bg-good-500 text-white`}>
            ✅ {busy === 'delivered' ? t(locale, 'driver.sending') : t(locale, 'driver.delivered')}
          </button>
        )}

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
        <button type="button" disabled={!!busy} onClick={() => photoRef.current?.click()} className={`${big} border-2 border-white/15 text-white/85`}>
          📷 {busy === 'photo' ? t(locale, 'driver.sending') : t(locale, 'driver.cargoPhoto')}
          {load.photos > 0 && <span className="nums text-[13px] font-medium text-white/50">· {load.photos}</span>}
        </button>
        {msg && <p className="text-center text-[14px] font-medium text-white/80">{msg}</p>}
        <p className="text-center text-[12px] text-white/45">{t(locale, 'driver.hint')}</p>
      </section>
    </>
  )
}

/** Язык — три кнопки внизу; ставят ту же cookie, что и приложение. */
export function LangSwitch({ locale }: { locale: Locale }) {
  const router = useRouter()
  const pick = (l: string) => {
    document.cookie = `locale=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    router.refresh()
  }
  return (
    <div className="mt-8 flex justify-center gap-2">
      {(['ru', 'en', 'es', 'uk', 'ro', 'kk'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => pick(l)}
          className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold uppercase ${
            l === locale ? 'bg-white/15 text-white' : 'text-white/45'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
