'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { refreshFleetStatus } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { REFRESH_BTN } from '@/components/small-refresh-button'

/** GPS older than this on page open = pull fresh automatically. */
const STALE_MINUTES = 10

/** While the map is on screen, poll this often so the fleet visibly moves instead of
 * sitting still until someone reloads. 30s: often enough to read as "live" against a
 * ~1-2min real GPS ping rate from the trucks themselves, without hammering the
 * third-party Live Share endpoints (7 trucks × 2 requests ≈ 14 req/30s, only while
 * this tab is open and visible — paused in a background tab). */
// 60, не 30: каждый тик — это полный серверный рендер страницы с картой (маршрут,
// погода, история пути) на КАЖДУЮ открытую вкладку. Трак за минуту проезжает милю —
// на карте страны это меньше пикселя, а нагрузка на сервер и базу — вдвое.
const POLL_MS = 60_000

const UNIT: Record<string, [string, string]> = { ru: ['мин', 'ч'], uk: ['хв', 'год'], kk: ['мин', 'сағ'] }

/** Pulls fresh GPS from Live Share (+ vendor API if configured) right now, instead
 * of waiting for the external cron — which only runs against a deployed URL, so on
 * a local/dev instance this button (plus the auto-catch-up and live poll below) is
 * the ONLY thing that ever refreshes position data. */
export function RefreshFleetButton({
  staleMinutes,
  seenAt,
}: {
  staleMinutes: number | null
  /** Время самой GPS-точки от устройства (fleet_status.eld_seen), если источник его дал. */
  seenAt?: string | null
}) {
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()
  // Effects run twice in dev StrictMode; without this the auto-refresh would fire
  // two ELD polls back-to-back on every page open.
  const autoFired = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const lastPoll = useRef(0)
  /** Карта (секция с кнопкой) сейчас на экране. */
  const onScreen = useRef(true)

  function refresh(silent = false) {
    lastPoll.current = Date.now()
    start(async () => {
      const res = await refreshFleetStatus()
      if (res.errors.length && !silent) notify('warn', res.errors.join(' · '))
      else if (!silent)
        notify(
          'ok',
          res.updated > 0
            ? `${t(locale, 'tracking.updatedTrucksPrefix')}${res.updated}`
            : t(locale, 'tracking.noNewData'),
        )
      // Свежий GPS страница получает сама: действие зовёт revalidatePath, и Next
      // присылает перерисованную страницу прямо в ответе на него. Лишний
      // router.refresh() здесь был ВТОРЫМ полным рендером «Траков» — на каждом
      // открытии со старым GPS и раз в минуту по таймеру, даже когда ничего не
      // пришло, — и заодно стирал в браузере все уже открытые разделы.
      // Только по нажатию кнопки — человек явно просит перечитать страницу.
      if (!silent) router.refresh()
    })
  }

  useEffect(() => {
    if (autoFired.current) return
    if (staleMinutes === null || staleMinutes < STALE_MINUTES) return
    autoFired.current = true
    refresh(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staleMinutes])

  // Раз в минуту — только когда это кому-то нужно (владелец 11/13/26): вкладка на
  // экране И карта в видимой части страницы. Свернул, ушёл в другую вкладку,
  // прокрутил карту за экран — опроса нет. Вернулся спустя минуту и больше — сразу
  // свежая точка, не ждать следующего тика.
  useEffect(() => {
    const due = () =>
      document.visibilityState === 'visible' && onScreen.current && Date.now() - lastPoll.current >= POLL_MS - 1000
    const tick = () => {
      if (due()) refresh(true)
    }
    const id = setInterval(tick, 5_000)
    const section = boxRef.current?.closest('section') ?? boxRef.current
    let io: IntersectionObserver | null = null
    if (section && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        onScreen.current = entries.some((e) => e.isIntersecting)
        tick()
      })
      io.observe(section)
    }
    document.addEventListener('visibilitychange', tick)
    // Первый тик — через минуту после открытия: само открытие страницы уже свежее
    // (или его догнал авто-опрос выше).
    lastPoll.current = Date.now()
    return () => {
      clearInterval(id)
      io?.disconnect()
      document.removeEventListener('visibilitychange', tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Сколько лет самой точке — честно, рядом с кнопкой. Только после монтирования
  // (иначе сервер и браузер нарисуют разные минуты → #418).
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])
  const seenMs = seenAt ? Date.parse(seenAt) : NaN
  const ageMin = now !== null && !Number.isNaN(seenMs) ? Math.max(0, Math.round((now - seenMs) / 60000)) : null
  const ageText =
    ageMin === null
      ? null
      : ageMin < 1
        ? t(locale, 'tracking.gpsJustNow')
        : t(locale, 'tracking.gpsAgo').replace(
            '{age}',
            ageMin < 60 ? `${ageMin} ${UNIT[locale]?.[0] ?? 'min'}` : `${Math.round(ageMin / 60)} ${UNIT[locale]?.[1] ?? 'h'}`,
          )

  return (
    <div ref={boxRef} className="flex max-w-full shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
      {ageText && (
        <span
          className={`nums text-2xs font-medium ${ageMin !== null && ageMin > 30 ? 'text-warn-400' : 'text-t3'}`}
          title={t(locale, 'tracking.gpsAgeTitle')}
        >
          {ageText}
        </span>
      )}
      <span className="flex items-center gap-1 text-2xs text-good-400" title={t(locale, 'tracking.autoRefreshTitle')}>
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-good-400 opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-good-500" />
        </span>
        live
      </span>
      <button
        disabled={pending}
        onClick={() => refresh()}
        className={REFRESH_BTN}
      >
        <span className={pending ? 'animate-spin' : ''}>↻</span>
        {pending ? t(locale, 'tracking.updating') : t(locale, 'tracking.refresh')}
      </button>
    </div>
  )
}
