'use client'

// Кнопка под файлом в переписке: взять эту бумагу в дело.
//
// Обычный путь — одно нажатие, тип и место приложение определяет само. Рядом стрелка
// «выбрать»: там диспетчер называет тип (рейт-кон, BOL, POD, другое) и место — любой
// груз этого трака, новый груз по самой бумаге, или просто файлы трака.
//
// Выбор нужен потому, что угадывание ошибается на краях: нечитаемый скан уезжает в
// «другое», а бумага на будущий рейс не относится ни к одному из заведённых грузов.
// Раньше в обоих случаях документ молча ложился не туда.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { tgAttachToLoad, tgFileTargets, type TgAttachOpts } from './actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t, type MsgKey } from '@/lib/i18n'
import type { DocClass } from '@/lib/ai-doc'

type Done = { loadId: number | null; loadRoute: string; created?: boolean }

const KINDS: { key: DocClass | 'auto'; label: MsgKey }[] = [
  { key: 'auto', label: 'telegram.attach.kindAuto' },
  { key: 'ratecon', label: 'docs.kind.ratecon' },
  { key: 'driverinfo', label: 'docs.kind.driverinfo' },
  { key: 'bol', label: 'docs.kind.bol' },
  { key: 'pod', label: 'docs.kind.pod' },
  { key: 'other', label: 'docs.kind.other' },
]

export function TgAttachButton({
  chatId,
  msgId,
  phone,
}: {
  chatId: string
  msgId: number
  phone: string | null
}) {
  const locale = useLocale()
  const [pending, start] = useTransition()
  const [done, setDone] = useState<Done | null>(null)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<DocClass | 'auto'>('auto')
  const [targets, setTargets] = useState<{ id: number; route: string; status: string }[] | null>(null)

  function run(opts?: TgAttachOpts) {
    start(async () => {
      const res = await tgAttachToLoad(chatId, msgId, phone, opts)
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      setOpen(false)
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

  // Список грузов подтягивается на первое открытие, а не вместе с перепиской: в чате
  // десятки файлов, и запрашивать грузы под каждый — впустую.
  function toggle() {
    const next = !open
    setOpen(next)
    if (next && targets === null) {
      start(async () => {
        const res = await tgFileTargets(chatId, phone)
        if ('error' in res) {
          notify('error', res.error)
          setOpen(false)
          return
        }
        setTargets(res.loads)
      })
    }
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
      'mb-1 flex items-center gap-1.5 rounded-lg bg-good-500/15 px-2.5 py-1.5 text-[11.5px] font-medium text-good-400'
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
          onClick={() => run()}
          className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1.5 text-[11.5px] font-medium text-white/80 transition-colors hover:bg-white/16 disabled:cursor-default disabled:opacity-60"
        >
          {pending && !open ? t(locale, 'telegram.attach.adding') : t(locale, 'telegram.attach.toDriverLoad')}
        </button>
        <button
          disabled={pending}
          onClick={toggle}
          title={t(locale, 'telegram.attach.choose')}
          aria-expanded={open}
          className="flex items-center bg-white/10 px-2 py-1.5 text-[11.5px] text-white/70 transition-colors hover:bg-white/16 disabled:opacity-60"
        >
          {open ? '▴' : '▾'}
        </button>
      </div>

      {open && (
        <div className="mt-1.5 w-[15rem] rounded-xl border border-white/12 bg-ink-900/95 p-2 shadow-lg">
          <div className="px-1 pb-1 text-[9.5px] uppercase tracking-wider text-white/40">
            {t(locale, 'telegram.attach.kindTitle')}
          </div>
          <div className="flex flex-wrap gap-1">
            {KINDS.map((k) => (
              <button
                key={k.key}
                onClick={() => setKind(k.key)}
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                  kind === k.key ? 'bg-haul-500/25 text-haul-300' : 'bg-white/8 text-white/60 hover:text-white/90'
                }`}
              >
                {t(locale, k.label)}
              </button>
            ))}
          </div>

          <div className="px-1 pb-1 pt-2.5 text-[9.5px] uppercase tracking-wider text-white/40">
            {t(locale, 'telegram.attach.whereTitle')}
          </div>
          <div className="flex flex-col gap-1">
            <Row
              label={t(locale, 'telegram.attach.newLoad')}
              hint={t(locale, 'telegram.attach.newLoadHint')}
              disabled={pending}
              onClick={() => run({ kind, target: 'new' })}
            />
            <Row
              label={t(locale, 'telegram.attach.truckFiles')}
              hint={t(locale, 'telegram.attach.truckFilesHint')}
              disabled={pending}
              onClick={() => run({ kind, target: 'truck' })}
            />
            {targets?.map((l) => (
              <Row key={l.id} label={l.route} hint={l.status} disabled={pending} onClick={() => run({ kind, target: l.id })} />
            ))}
            {targets?.length === 0 && (
              <div className="px-2 py-1 text-[11px] text-white/40">{t(locale, 'telegram.attach.noLoads')}</div>
            )}
          </div>
        </div>
      )}
    </div>
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
      <span className="block truncate text-[11.5px] font-medium text-white/85">{label}</span>
      {hint && <span className="block truncate text-[10px] text-white/40">{hint}</span>}
    </button>
  )
}
