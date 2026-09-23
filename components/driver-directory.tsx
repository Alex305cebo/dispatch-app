'use client'

import { useCallback, useState, useSyncExternalStore, useTransition } from 'react'
import Link from 'next/link'
import { Copy, Pencil, Phone } from 'lucide-react'
import { saveDispatcherPhone } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

/**
 * Данные водителей — то, что у диспетчера спрашивает брокер, плитками.
 *
 * Зачем эти поля вообще собраны вместе. Брокер спрашивает их в каждом звонке, а
 * лежали они в четырёх разных местах: имя и номер трака — на карточке, телефон,
 * прицеп и VIN — внутри «паспорта трака», MC и название компании — в настройках.
 * Собрать их во время разговора значило уйти со страницы два-три раза, держа
 * брокера на линии.
 *
 * Почему теперь плитки, а не свёрнутый список. Раньше это был один блок во всю
 * строку: сначала нажать на заголовок, потом на водителя, и только тогда видно
 * телефон. Два нажатия ради строки, которую диктуют в трубку. Теперь каждый
 * водитель — своя маленькая плитка в общей сетке раздела: всё, что спрашивают,
 * видно сразу, плитки двигаются и меняют размер, как все остальные, а порядок
 * общий для всей компании (lib/tiles-core.ts).
 *
 * Что на экране и что в буфере. Кнопка копирования кладёт тот же устоявшийся блок
 * из десяти строк, который отправляют брокеру (infoBlock ниже) — на плитке те же
 * значения, только подписаны коротко и на языке интерфейса. Общие для всех
 * водителей строки (MC, компания, почта) вынесены в свою плитку: повторять их на
 * каждой из восьми карточек незачем.
 */

export interface DriverEntry {
  truckId: number
  driverName: string | null
  driverPhone: string | null
  truckNumber: string | null
  trailerNumber: string | null
  vin: string | null
  /** Диспетчер, закреплённый за ЭТИМ траком, и его номер. Пусто — значит трак
   * никому не назначен, и в блок идёт тот, кто открыл страницу. */
  dispatcherName?: string | null
  dispatcherPhone?: string | null
}

/** Компания и тот, кто открыл страницу: вторая половина блока для брокера. */
export interface DirectoryCompany {
  mc: string
  companyName: string
  companyEmail: string
  dispatcherName: string
  dispatcherPhone: string
}

/* Свой номер диспетчера живёт в отдельной плитке, а подставляется в блок каждого
   водителя без назначенного диспетчера. Плитки теперь разные компоненты и общего
   состояния у них нет, поэтому номер держим в маленьком хранилище на модуль: иначе
   человек поправил бы номер в своей плитке, а копировался бы до перезагрузки
   страницы старый. Снимок для сервера — то, что пришло с сервера, иначе гидрация. */
let edited: string | null = null
const listeners = new Set<() => void>()

function useDispatcherPhone(fromServer: string): string {
  return useSyncExternalStore(
    useCallback((cb: () => void) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    }, []),
    () => edited ?? fromServer,
    () => fromServer,
  )
}

function setDispatcherPhone(v: string) {
  edited = v
  for (const cb of listeners) cb()
}

/** Плитка одного водителя. Всё, что спрашивает брокер, — без единого нажатия. */
export function DriverTile({ driver, company }: { driver: DriverEntry; company: DirectoryCompany }) {
  const locale = useLocale()
  const phone = useDispatcherPhone(company.dispatcherPhone)
  const block = infoBlock(driver, { ...company, dispatcherPhone: phone })
  // Диспетчер на карточке — только закреплённый за ЭТИМ траком. Когда трак ничей,
  // в блок идёт тот, кто открыл страницу, и его номер стоит своей плиткой рядом:
  // повторять собственное имя на каждой из восьми карточек незачем.
  const dispatcher = driver.dispatcherName
  const digits = (driver.driverPhone ?? '').replace(/[^\d+]/g, '')

  return (
    <div className="panel flex h-full flex-col gap-1 px-3 py-2.5">
      <div className="flex items-start gap-1">
        {/* Имя ведёт на карточку трака: оттуда берут VIN, бумаги и пробег — то, что
            на плитку не помещается и в блок брокеру не идёт. */}
        <Link
          href={`/trucks/${driver.truckId}`}
          className="line-clamp-2 min-w-0 flex-1 text-base leading-tight font-semibold break-words text-t1 hover:text-haul-300"
        >
          {driver.driverName || t(locale, 'drivers.noName')}
        </Link>
        <button
          type="button"
          onClick={() => copy(block, t(locale, 'drivers.copied'))}
          title={t(locale, 'drivers.copy')}
          aria-label={`${t(locale, 'drivers.copy')}: ${driver.driverName || t(locale, 'drivers.noName')}`}
          className="-mr-1 -mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-haul-300/70 transition-colors hover:bg-white/10 hover:text-haul-300"
        >
          <Copy size={13} strokeWidth={2.5} />
        </button>
      </div>

      {/* Телефон водителя — ссылка: с телефона по нему сразу звонят, а не переписывают
          цифры в звонилку руками. */}
      {digits ? (
        <a
          href={`tel:${digits}`}
          className="nums flex min-w-0 items-center gap-1 truncate text-sm text-haul-300 hover:underline"
        >
          <Phone size={11} strokeWidth={2.5} className="shrink-0 opacity-70" />
          {driver.driverPhone}
        </a>
      ) : (
        <span className="text-sm text-t3">{t(locale, 'drivers.noPhone')}</span>
      )}

      {/* Трак и прицеп переносятся целиком, вторым рядом: в узкой плитке телефона
          обрезка оставляла «TRK-DEMO-101 · TRL…» — прицеп пропадал. */}
      <div className="nums flex flex-wrap gap-x-1 text-xs text-t3">
        <span className="whitespace-nowrap">{driver.truckNumber ? `TRK-${driver.truckNumber}` : '—'}</span>
        {driver.trailerNumber && <span className="whitespace-nowrap">· TRL-{driver.trailerNumber}</span>}
      </div>
      {dispatcher && (
        <div className="mt-auto truncate text-2xs text-t3">
          {t(locale, 'drivers.dispatcher')} {dispatcher}
        </div>
      )}
    </div>
  )
}

/** Свой номер: брокер перезванивает человеку, который прислал груз, а не на общий
 *  номер компании. В базе его негде было хранить, поэтому диспетчер вписывает его
 *  прямо здесь — и это единственная плитка раздела, которую правят. */
export function MyPhoneTile({ phone: fromServer }: { phone: string }) {
  const locale = useLocale()
  const phone = useDispatcherPhone(fromServer)
  const [draft, setDraft] = useState(phone)
  const [edit, setEdit] = useState(false)
  const [pending, start] = useTransition()

  return (
    <div className="panel flex h-full flex-col justify-center gap-1 px-3 py-2.5">
      <div className="truncate text-xs text-t3">{t(locale, 'drivers.myPhone')}</div>
      {edit ? (
        <div className="flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="786 461 4739"
            aria-label={t(locale, 'drivers.myPhone')}
            className="nums min-w-0 flex-1 rounded-md border border-white/10 bg-ink-950/70 px-2 py-1 text-sm text-white outline-none focus:border-haul-500"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await saveDispatcherPhone(draft)
                if (res?.error) notify('error', res.error)
                else {
                  setDispatcherPhone(draft)
                  notify('ok', t(locale, 'drivers.phoneSaved'))
                  setEdit(false)
                }
              })
            }
            className="shrink-0 rounded-md bg-haul-500/20 px-2 py-1 text-sm font-medium text-haul-300 hover:bg-haul-500/30 disabled:opacity-50"
          >
            {t(locale, 'drivers.save')}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          {/* Номер — моноширинным и в одну строку; «не указан» — обычным текстом и с
              переносом: в узкой плитке моноширинная подпись обрезалась до «no number …». */}
          <span
            className={`min-w-0 flex-1 ${phone ? 'nums truncate text-base font-semibold text-t1' : 'text-sm text-t3'}`}
          >
            {phone || t(locale, 'drivers.noPhone')}
          </span>
          <button
            type="button"
            onClick={() => {
              setDraft(phone)
              setEdit(true)
            }}
            title={t(locale, 'drivers.editPhone')}
            aria-label={t(locale, 'drivers.editPhone')}
            className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-lg text-haul-300/70 transition-colors hover:bg-white/10 hover:text-haul-300"
          >
            <Pencil size={13} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  )
}

/** Компания: вторая половина блока, одинаковая у всех водителей. Отдельной плиткой,
 *  чтобы не повторять три строки на каждой карточке. Копируется тоже — брокер часто
 *  просит только MC и название. */
export function CompanyTile({ mc, companyName, companyEmail }: Omit<DirectoryCompany, 'dispatcherName' | 'dispatcherPhone'>) {
  const locale = useLocale()
  const block = [
    `MC - ${mc.trim() || '—'}`,
    `Company Name - ${companyName.trim() || '—'}`,
    `Email - ${companyEmail.trim() || '—'}`,
  ].join('\n')

  return (
    <div className="panel flex h-full flex-col gap-1 px-3 py-2.5">
      <div className="flex items-start gap-1">
        <span className="min-w-0 flex-1 truncate text-xs text-t3">{t(locale, 'drivers.company')}</span>
        <button
          type="button"
          onClick={() => copy(block, t(locale, 'drivers.copied'))}
          title={t(locale, 'drivers.copy')}
          aria-label={`${t(locale, 'drivers.copy')}: ${t(locale, 'drivers.company')}`}
          className="-mr-1 -mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-haul-300/70 transition-colors hover:bg-white/10 hover:text-haul-300"
        >
          <Copy size={13} strokeWidth={2.5} />
        </button>
      </div>
      <div className="nums truncate text-base leading-tight font-semibold text-t1">MC {mc || '—'}</div>
      <div className="truncate text-xs text-t3">{companyName || '—'}</div>
      <div className="mt-auto truncate text-2xs text-t3">{companyEmail || '—'}</div>
    </div>
  )
}

/**
 * Готовый блок для брокера — в том виде, в котором его отправляют.
 *
 * Раскладка, порядок строк и пустая строка посередине повторяют образец заказчика:
 * это устоявшийся формат отрасли, брокер читает его глазами и ждёт именно такой.
 * Дефис везде обычный, а не типографское тире: блок вставляют в чужие системы, и
 * длинное тире там иногда приезжает вопросительным знаком.
 *
 * Все значения — живые: водитель и номера из карточки трака, компания, MC и почта
 * из профиля компании, диспетчер и его телефон из учётной записи того, кто нажал
 * кнопку. Ничего не зашито в код, поэтому блок не устаревает.
 *
 * Всегда по-английски, независимо от языка интерфейса: получатель — американский
 * брокер, а не пользователь приложения.
 */
export function infoBlock(d: DriverEntry, co: DirectoryCompany): string {
  const dash = (v: string | null | undefined) => (v && v.trim() ? v.trim() : '—')
  // Телефон — одними цифрами: его вставляют в чужие поля и звонилки, а пробелы и
  // скобки там мешают. Плюс у международного номера сохраняем.
  const tel = (v: string | null | undefined) => {
    const t = (v ?? '').trim()
    if (!t) return '—'
    const digits = t.replace(/[^\d+]/g, '')
    return digits || '—'
  }
  return [
    `Driver Name - ${dash(d.driverName)}`,
    `Driver Phone Number - ${tel(d.driverPhone)}`,
    `Truck Number - ${dash(d.truckNumber)}`,
    `Trailer Number - ${dash(d.trailerNumber)}`,
    '',
    `MC - ${dash(co.mc)}`,
    `Company Name - ${dash(co.companyName)}`,
    `Email - ${dash(co.companyEmail)}`,
    `Dispatcher - ${dash(d.dispatcherName || co.dispatcherName)}`,
    `Dispatcher Number - ${tel(d.dispatcherName ? d.dispatcherPhone : co.dispatcherPhone)}`,
  ].join('\n')
}

function copy(text: string, okMessage: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => notify('ok', okMessage))
    // Буфер закрыт (нет https или отказано в разрешении) — молчать нельзя, иначе
    // человек решит, что скопировалось, и отправит брокеру пустоту.
    .catch(() => notify('warn', text))
}
