'use client'

// Кнопка под файлом в переписке: взять эту бумагу в груз водителя.
//
// Водитель — главный выбор. В ЛИЧНОМ чате водителя он уже подставлен, и обычное
// нажатие подшивает файл само (Rate Con — к его грузу с тем же номером или маршрутом,
// иначе новым грузом; BOL/POD — к тому, что он везёт). Во всех остальных чатах (группы
// вроде «RATE CONS MAYA», поддержка, незнакомые номера) кнопка ничего сама не решает:
// открывает окно «какому водителю → к какому грузу», где есть и «Новый груз».
//
// Раньше общий чат привязывали к одному траку, и потом любой Rate Con оттуда молча
// уезжал этому траку — как прикрепить файл другому водителю, было непонятно.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { tgAttachToLoad, tgFileTargets, type TgAttachOpts, type TgLoadChoice } from './actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { statusLabel } from '@/components/status'
import { t, type MsgKey } from '@/lib/i18n'
import type { DocClass } from '@/lib/ai-doc'
import type { LoadStatus } from '@/lib/map'

/** Водитель = его трак: грузы и бумаги в системе висят на траке. */
export type TgDriver = { truckId: number; number: string | null; driver: string | null; hasChat: boolean }

/** Одно на весь открытый чат — страница считает, кто это, один раз. */
export type TgAttachCtx = {
  /** Водитель этого личного чата; null — чат общий или не привязан. */
  driver: TgDriver | null
  /** Чат один на один (не группа) — только такой можно запомнить за водителем. */
  personal: boolean
  drivers: TgDriver[]
}

type Done = { loadId: number | null; loadRoute: string; created?: boolean }

const KINDS: { key: DocClass | 'auto'; label: MsgKey }[] = [
  { key: 'auto', label: 'telegram.attach.kindAuto' },
  { key: 'ratecon', label: 'docs.kind.ratecon' },
  { key: 'driverinfo', label: 'docs.kind.driverinfo' },
  { key: 'bol', label: 'docs.kind.bol' },
  { key: 'seal', label: 'docs.kind.seal' },
  { key: 'pod', label: 'docs.kind.pod' },
  { key: 'other', label: 'docs.kind.other' },
]

const driverName = (d: TgDriver) => d.driver || (d.number ? `#${d.number}` : `#${d.truckId}`)

export function TgAttachButton({
  chatId,
  msgId,
  driver,
  personal,
  drivers,
}: { chatId: string; msgId: number } & TgAttachCtx) {
  const locale = useLocale()
  const [pending, start] = useTransition()
  const [done, setDone] = useState<Done | null>(null)
  const [open, setOpen] = useState(false)

  function run(opts: TgAttachOpts, after?: () => void) {
    start(async () => {
      const res = await tgAttachToLoad(chatId, msgId, opts)
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      after?.()
      notify(
        'ok',
        res.loadId === null
          ? t(locale, 'telegram.attach.savedToTruck')
          : t(locale, res.created ? 'telegram.attach.created' : 'telegram.attach.added').replace(
              '{route}',
              res.loadRoute,
            ),
      )
      setDone({ loadId: res.loadId, loadRoute: res.loadRoute, created: res.created })
    })
  }

  if (done) {
    const label =
      done.loadId === null
        ? t(locale, 'telegram.attach.inTruckFiles')
        : t(locale, done.created ? 'telegram.attach.createdLoad' : 'telegram.attach.inLoad').replace(
            '{route}',
            done.loadRoute,
          )
    const cls =
      'mb-1 flex items-center gap-1.5 rounded-lg bg-good-500/15 px-2.5 py-1.5 text-xs font-medium text-good-400'
    // В файлы трака — ссылке вести некуда: карточка трака открывается из его строки,
    // а ложная ссылка на груз тут была бы обманом.
    return done.loadId === null ? (
      <span className={cls}>{label}</span>
    ) : (
      <Link href={`/loads/${done.loadId}`} className={`${cls} transition-colors hover:bg-good-500/22`}>
        {label}
      </Link>
    )
  }

  return (
    <div className="mb-1">
      <div className="flex items-stretch gap-px overflow-hidden rounded-lg">
        <button
          disabled={pending}
          // Личный чат: водитель известен — подшить сразу. Иначе — сначала выбрать водителя.
          onClick={() => (driver ? run({ truckId: driver.truckId }) : setOpen(true))}
          className="flex min-w-0 items-center gap-1.5 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-t1 transition-colors hover:bg-white/16 disabled:cursor-default disabled:opacity-60"
        >
          <span className="truncate">
            {pending && !open
              ? t(locale, 'telegram.attach.adding')
              : driver
                ? t(locale, 'telegram.attach.toLoadOf').replace('{driver}', driverName(driver))
                : t(locale, 'telegram.attach.toDriverLoad')}
          </span>
        </button>
        <button
          disabled={pending}
          onClick={() => setOpen(true)}
          title={t(locale, 'telegram.attach.choose')}
          aria-label={t(locale, 'telegram.attach.choose')}
          className="flex items-center bg-white/10 px-2 py-1.5 text-xs text-t2 transition-colors hover:bg-white/16 disabled:opacity-60"
        >
          ▾
        </button>
      </div>

      {open && (
        <AttachPicker
          preset={driver}
          personal={personal}
          drivers={drivers}
          pending={pending}
          onClose={() => setOpen(false)}
          onPick={(opts) => run(opts, () => setOpen(false))}
        />
      )}
    </div>
  )
}

/** Окно выбора: водитель → груз (или новый груз, или просто файлы трака). */
function AttachPicker({
  preset,
  personal,
  drivers,
  pending,
  onClose,
  onPick,
}: {
  preset: TgDriver | null
  personal: boolean
  drivers: TgDriver[]
  pending: boolean
  onClose: () => void
  onPick: (opts: TgAttachOpts) => void
}) {
  const locale = useLocale()
  const [who, setWho] = useState<TgDriver | null>(preset)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<DocClass | 'auto'>('auto')
  const [loads, setLoads] = useState<TgLoadChoice[] | null>(null)
  const [loading, setLoading] = useState(false)
  // Личный чат ещё без водителя: можно запомнить — дальше его бумаги пойдут этому
  // водителю одним нажатием. Сам не отмечен: один на один пишут не только водители.
  // Группу не запоминаем никогда.
  const [remember, setRemember] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!who) {
      searchRef.current?.focus()
      return
    }
    let alive = true
    setLoads(null)
    setLoading(true)
    void tgFileTargets(who.truckId).then((res) => {
      if (!alive) return
      setLoading(false)
      if ('error' in res) notify('error', res.error)
      else setLoads(res.loads)
    })
    return () => {
      alive = false
    }
  }, [who])

  const found = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return drivers
    return drivers.filter((d) => `${d.driver ?? ''} ${d.number ?? ''}`.toLowerCase().includes(q))
  }, [drivers, query])

  const pick = (target: TgAttachOpts['target']) =>
    who && onPick({ truckId: who.truckId, kind, target, remember: personal && !preset && remember })

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden p-0"
      >
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-2.5">
          <span className="min-w-0 flex-1 truncate text-base font-semibold text-t1">
            {who ? t(locale, 'telegram.attach.loadTitle') : t(locale, 'telegram.attach.driverTitle')}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'userPanel.close')}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-lg text-t3 transition-colors hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {!who ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(locale, 'telegram.attach.search')}
              className="w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm text-t1 outline-none placeholder:text-t3 focus:border-haul-400/60"
            />
            <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
              {found.map((d) => (
                <Row
                  key={d.truckId}
                  label={driverName(d)}
                  hint={[d.driver && d.number ? `#${d.number}` : null, d.hasChat ? t(locale, 'telegram.attach.hasChat') : null]
                    .filter(Boolean)
                    .join(' · ')}
                  onClick={() => setWho(d)}
                />
              ))}
              {found.length === 0 && (
                <div className="px-2 py-3 text-center text-sm text-t3">{t(locale, 'telegram.attach.noDrivers')}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
            <div className="flex items-center gap-2 rounded-lg bg-white/6 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-t1">
                <span className="font-semibold">{driverName(who)}</span>
                {who.driver && who.number && <span className="nums ml-1.5 text-t3">#{who.number}</span>}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => setWho(null)}
                className="shrink-0 text-xs font-medium text-haul-300 hover:underline disabled:opacity-50"
              >
                {t(locale, 'telegram.attach.change')}
              </button>
            </div>

            <div>
              <div className="px-1 pb-1 text-xs font-medium text-t3">{t(locale, 'telegram.attach.kindTitle')}</div>
              <div className="flex flex-wrap gap-1">
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    onClick={() => setKind(k.key)}
                    className={`rounded-full px-2 py-0.5 text-2xs font-medium transition-colors ${
                      kind === k.key ? 'bg-haul-500/25 text-haul-300' : 'bg-white/8 text-t2 hover:text-t1'
                    }`}
                  >
                    {t(locale, k.label)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-0.5">
              <Row
                label={`＋ ${t(locale, 'telegram.attach.newLoad')}`}
                hint={t(locale, 'telegram.attach.newLoadHint')}
                disabled={pending}
                onClick={() => pick('new')}
              />
              {loading && <div className="px-2 py-1.5 text-xs text-t3">{t(locale, 'common.loading')}</div>}
              {loads?.map((l) => (
                <Row
                  key={l.id}
                  label={l.route}
                  hint={[statusLabel(locale, l.status as LoadStatus), l.pickup].filter(Boolean).join(' · ')}
                  disabled={pending}
                  onClick={() => pick(l.id)}
                />
              ))}
              {loads?.length === 0 && (
                <div className="px-2 py-1 text-xs text-t3">{t(locale, 'telegram.attach.noLoads')}</div>
              )}
              <Row
                label={t(locale, 'telegram.attach.truckFiles')}
                hint={t(locale, 'telegram.attach.truckFilesHint')}
                disabled={pending}
                onClick={() => pick('truck')}
              />
            </div>

            {personal && !preset && (
              <label className="flex items-center gap-2 px-1 text-xs text-t2">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                {t(locale, 'telegram.attach.remember')}
              </label>
            )}
            {pending && <div className="px-1 text-xs text-t3">{t(locale, 'telegram.attach.adding')}</div>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Row({
  label,
  hint,
  disabled,
  onClick,
}: {
  label: string
  hint?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/8 disabled:opacity-50"
    >
      <span className="block truncate text-sm font-medium text-t1">{label}</span>
      {hint && <span className="block truncate text-xs text-t3">{hint}</span>}
    </button>
  )
}
