'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Locale } from '@/lib/i18n'
import type { LoadStatus } from '@/lib/map'
import { usDate } from '@/lib/fmt'
import { arrivedAt, isDone, stopTitle, stopsLabel, type MergedStop } from '@/lib/stops'

export type DriverLoad = {
  id: number
  status: LoadStatus
  origin: string | null
  destination: string | null
  brokerName: string | null
  brokerPhone: string | null
  referenceId: string | null
  hasBol: boolean
  hasPod: boolean
  photos: number
}

export type Ev = {
  id: number
  kind: string
  note: string | null
  at: string
  stopSeq: number | null
  loadId: number | null
}

const EVENT_KEY = {
  arrived_pickup: 'driver.ev.arrivedPickup',
  loaded: 'driver.ev.loaded',
  arrived_delivery: 'driver.ev.arrivedDelivery',
  delivered: 'driver.ev.delivered',
  note: 'driver.ev.note',
  photo: 'driver.ev.photo',
} as const

const mapsHref = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
const clock = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/**
 * Страница водителя: где он сейчас в рейсе, один следующий шаг крупной кнопкой,
 * адреса, звонки, фото и сообщение диспетчеру. Всё крупно — читается на стоянке,
 * нажимается большим пальцем.
 *
 * Рейс — лента ОСТАНОВОК (lib/stops.ts): у каждой «приехал», потом «загрузился»
 * или «выгрузился». Груз с тремя точками идёт по трём; партиалы (два груза в одном
 * трейлере) — одной лентой по датам, у каждой остановки подпись, чей это груз.
 */
export function DriverClient({
  token,
  locale,
  load,
  loads,
  stops,
  events,
  dispatcherPhone,
}: {
  token: string
  locale: Locale
  /** Основной груз — под него идут фото BOL/POD. */
  load: DriverLoad | null
  /** Все грузы, которые едут сейчас (текущий + партиалы). */
  loads: DriverLoad[]
  /** Остановки всех этих грузов по порядку. */
  stops: MergedStop[]
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

  // Где водитель в рейсе — по отметкам на каждой остановке. Груз «в пути» без
  // отметок (статус поставил GPS или диспетчер): его первый пикап уже позади.
  const stopsOf = (loadId: number) => stops.filter((s) => s.loadId === loadId)
  const evOf = (loadId: number) => events.filter((e) => e.loadId === loadId)
  const statusOf = (loadId: number) => loads.find((l) => l.id === loadId)?.status ?? 'booked'
  const done = (s: MergedStop) => {
    const st = statusOf(s.loadId)
    if (st === 'delivered' || st === 'paid') return true
    if (isDone(s, evOf(s.loadId), stopsOf(s.loadId))) return true
    return (
      s.role === 'pickup' && st === 'in_transit' && stopsOf(s.loadId).find((x) => x.role === 'pickup')?.seq === s.seq
    )
  }
  const next = stops.find((s) => !done(s)) ?? null
  const arrived = next ? arrivedAt(next, evOf(next.loadId), stopsOf(next.loadId)) : null
  const many = loads.length > 1
  const stepText = !next
    ? 'driver.step.done'
    : next.role === 'pickup'
      ? arrived
        ? 'driver.step.atPickup'
        : 'driver.step.toPickup'
      : arrived
        ? 'driver.step.atDelivery'
        : 'driver.step.toDelivery'
  const target = (s: MergedStop) => ({ loadId: String(s.loadId), stopSeq: String(s.seq) })
  const tag = (s: MergedStop) => (many ? ` · #${s.ref ?? s.loadId}${s.broker ? ` ${s.broker}` : ''}` : '')

  const card = (s: MergedStop, active: boolean) => {
    const where = s.address || s.city || '—'
    const finished = done(s)
    return (
      <div
        key={`${s.loadId}-${s.seq}`}
        className={`rounded-xl border p-3 ${
          active
            ? 'border-haul-400/60 bg-haul-500/[0.08]'
            : finished
              ? 'border-white/5 bg-white/[0.02] opacity-60'
              : 'border-white/10 bg-white/[0.03]'
        }`}
      >
        <div className="text-[11px] uppercase tracking-wider text-white/50">
          {finished ? '✓ ' : ''}
          {stopTitle(s, stopsOf(s.loadId), locale)}
          {tag(s)}
          {active && (
            <span className="ml-2 rounded bg-haul-500/25 px-1.5 py-0.5 text-[10px] normal-case text-haul-200">
              {t(locale, 'driver.next')}
            </span>
          )}
        </div>
        {s.name && <div className="mt-0.5 text-[13px] font-semibold text-white/80">{s.name}</div>}
        <div className="mt-0.5 text-[15px] font-semibold leading-snug">{where}</div>
        {(s.date || s.time) && (
          <div className="nums mt-0.5 text-[13px] text-white/70">
            {usDate(s.date)}
            {s.time ? ` · ${s.time}` : ''}
          </div>
        )}
        {s.refs.length > 0 && <div className="nums mt-0.5 text-[12px] text-white/50">Ref: {s.refs.join(', ')}</div>}
        {!finished && (
          <a
            href={mapsHref(where)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-haul-500/15 px-3 py-1.5 text-[13px] font-semibold text-haul-300"
          >
            📍 {t(locale, 'driver.openMap')}
          </a>
        )}
      </div>
    )
  }

  return (
    <>
      {load && (
        <section className="panel mt-4 p-4">
          {/* Полоса остановок: видно, где он и что дальше. */}
          <ol className="flex items-center gap-1 text-[10px] uppercase tracking-wider">
            {stops.map((s) => {
              const state = done(s) ? 'done' : s === next ? 'now' : 'later'
              return (
                <li key={`${s.loadId}-${s.seq}`} className="flex min-w-0 flex-1 items-center gap-1">
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${state === 'done' ? 'bg-good-400' : state === 'now' ? 'bg-haul-400 ring-4 ring-haul-500/25' : 'bg-white/15'}`}
                  />
                  <span className={`truncate ${state === 'now' ? 'text-white' : 'text-white/40'}`}>
                    {(s.city ?? stopTitle(s, stopsOf(s.loadId), locale)).replace(/,.*$/, '')}
                  </span>
                </li>
              )
            })}
          </ol>
          <div className="mt-3 text-[18px] font-bold leading-snug">
            {load.origin ?? '—'} → {load.destination ?? '—'}
            {(stops.length > 2 || many) && (
              <span className="ml-2 text-[13px] font-medium text-white/50">· {stopsLabel(stops, locale)}</span>
            )}
          </div>
          <div className="mt-0.5 text-[13px] text-white/60">
            {t(locale, stepText)}
            {next && next.city ? ` · ${next.city}` : ''}
            {!many && load.referenceId ? ` · #${load.referenceId}` : ''}
          </div>

          {/* ОДИН следующий шаг — большой кнопкой прямо под заголовком. */}
          <div className="mt-3">
            {next && !arrived && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => act({ action: 'arrived', ...target(next) }, 'arrived')}
                className={`${big} bg-haul-500 text-white`}
              >
                📍{' '}
                {busy === 'arrived'
                  ? t(locale, 'driver.sending')
                  : t(locale, next.role === 'pickup' ? 'driver.arrivedPickup' : 'driver.arrivedDelivery')}
              </button>
            )}
            {next && arrived && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => act({ action: 'status', ...target(next) }, 'status')}
                className={`${big} ${next.role === 'pickup' ? 'bg-haul-500' : 'bg-good-500'} text-white`}
              >
                {next.role === 'pickup' ? '🚚' : '✅'}{' '}
                {busy === 'status'
                  ? t(locale, 'driver.sending')
                  : t(locale, next.role === 'pickup' ? 'driver.loaded' : 'driver.delivered')}
              </button>
            )}
            {!next && (
              <p className="rounded-xl bg-good-500/10 px-4 py-3 text-center text-[14px] font-medium text-good-400">
                {t(locale, 'driver.allDone')}
              </p>
            )}
            {/* Пропустил «приехал» — можно сразу «загрузился/выгрузился», мелкой кнопкой. */}
            {next && !arrived && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => act({ action: 'status', ...target(next) }, 'skip')}
                className="mt-2 w-full rounded-lg py-1.5 text-[12.5px] text-white/50 underline-offset-2 hover:underline"
              >
                {t(locale, next.role === 'pickup' ? 'driver.alreadyLoaded' : 'driver.alreadyDelivered')}
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2">{stops.map((s) => card(s, s === next))}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {loads
              .filter((l) => l.brokerPhone)
              .map((l) => (
                <a
                  key={l.id}
                  href={`tel:${l.brokerPhone}`}
                  className="rounded-xl border border-white/15 px-4 py-2 text-[14px] font-semibold"
                >
                  📞 {t(locale, 'driver.callBroker')}
                  {l.brokerName ? ` · ${l.brokerName}` : ''}
                  {many && l.referenceId ? ` · #${l.referenceId}` : ''}
                </a>
              ))}
            {dispatcherPhone && (
              <a
                href={`tel:${dispatcherPhone}`}
                className="rounded-xl border border-white/15 px-4 py-2 text-[14px] font-semibold"
              >
                📞 {t(locale, 'driver.callDispatch')}
              </a>
            )}
          </div>
        </section>
      )}

      {load && (
        <section className="mt-4">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-white/50">{t(locale, 'driver.docsHeading')}</p>
          <input
            ref={bolRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              upload('bol', e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={podRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              upload('pod', e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              upload('photo', e.target.files)
              e.target.value = ''
            }}
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => bolRef.current?.click()}
              className={`${big} border-2 ${load.hasBol ? 'border-good-500/40 text-good-400' : 'border-warn-400/50 text-warn-400'}`}
            >
              📄{' '}
              {busy === 'bol'
                ? t(locale, 'driver.sending')
                : load.hasBol
                  ? t(locale, 'driver.bolDone')
                  : t(locale, 'driver.bolPhoto')}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => podRef.current?.click()}
              className={`${big} border-2 ${load.hasPod ? 'border-good-500/40 text-good-400' : 'border-warn-400/50 text-warn-400'}`}
            >
              📄{' '}
              {busy === 'pod'
                ? t(locale, 'driver.sending')
                : load.hasPod
                  ? t(locale, 'driver.podDone')
                  : t(locale, 'driver.podPhoto')}
            </button>
          </div>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => photoRef.current?.click()}
            className={`${big} mt-3 border-2 border-white/15 text-white/85`}
          >
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
          {(
            ['driver.quick.delay', 'driver.quick.breakdown', 'driver.quick.waiting', 'driver.quick.question'] as const
          ).map((k) => (
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
          <p className="mb-2 text-[11px] uppercase tracking-wider text-white/50">
            {t(locale, 'driver.historyHeading')}
          </p>
          <ul className="flex flex-col gap-1 text-[12.5px]">
            {[...events]
              .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
              .reverse()
              .slice(0, 8)
              .map((e) => {
                const st =
                  e.loadId != null && e.stopSeq != null
                    ? stops.find((s) => s.loadId === e.loadId && s.seq === e.stopSeq)
                    : null
                return (
                  <li key={e.id} className="flex items-baseline gap-2 text-white/70">
                    <span className="nums shrink-0 text-white/45">{clock(e.at)}</span>
                    <span>
                      {t(locale, EVENT_KEY[e.kind as keyof typeof EVENT_KEY] ?? 'driver.ev.note')}
                      {st?.city ? ` · ${st.city}` : ''}
                      {e.note ? `: ${e.note}` : ''}
                    </span>
                  </li>
                )
              })}
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
