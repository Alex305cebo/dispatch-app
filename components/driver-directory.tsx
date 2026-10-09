'use client'

import { useCallback, useSyncExternalStore, useTransition } from 'react'
import { saveDispatcherPhone } from '@/app/actions'
import { notify } from '@/lib/notify'

/**
 * Данные водителей — то, что у диспетчера спрашивает брокер.
 *
 * Зачем эти поля вообще собраны вместе. Брокер спрашивает их в каждом звонке, а
 * лежали они в четырёх разных местах: имя и номер трака — на карточке, телефон,
 * прицеп и VIN — внутри «паспорта трака», MC и название компании — в настройках.
 * Собрать их во время разговора значило уйти со страницы два-три раза, держа
 * брокера на линии.
 *
 * Где это теперь (план «Порядок в TMS», 10/09/26). Водитель, его телефон и кнопка
 * «скопировать для брокера» — в строке трака на «Траках» (components/fleet-list.tsx):
 * раньше у каждого водителя была ещё и своя плитка, и он стоял на странице четыре
 * раза. «Мой номер» и «Компания» — в меню аккаунта (components/user-panel.tsx):
 * они одни на все траки, и повторять их в разделе незачем.
 *
 * Что в буфере. Кнопка копирования кладёт тот же устоявшийся блок из десяти строк,
 * который отправляют брокеру (infoBlock ниже), — и со страницы «Траки», и с карточки
 * трака: один формат в двух местах, иначе брокер получал бы разные письма.
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

/* Свой номер диспетчера правится в меню аккаунта, а подставляется в блок каждого
   водителя без назначенного диспетчера — в строках «Траков». Это разные компоненты
   без общего состояния, поэтому номер держим в маленьком хранилище на модуль: иначе
   человек поправил бы номер в меню, а копировался бы до перезагрузки страницы
   старый. Снимок для сервера — то, что пришло с сервера, иначе гидрация. */
let edited: string | null = null
const listeners = new Set<() => void>()

export function useDispatcherPhone(fromServer: string): string {
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

/** «Мой номер» для меню аккаунта: текущий номер и сохранение. Брокер перезванивает
 *  человеку, который прислал груз, а не на общий номер компании; в базе его негде
 *  было хранить, поэтому диспетчер вписывает его сам. */
export function useMyPhone(fromServer: string) {
  const phone = useDispatcherPhone(fromServer)
  const [pending, start] = useTransition()
  const save = (draft: string, okMessage: string, done: () => void) =>
    start(async () => {
      const res = await saveDispatcherPhone(draft)
      if (res?.error) notify('error', res.error)
      else {
        setDispatcherPhone(draft.trim())
        notify('ok', okMessage)
        done()
      }
    })
  return { phone, save, pending }
}

/** Вторая половина блока, одинаковая у всех водителей. Брокер часто просит только MC
 *  и название — поэтому она копируется и отдельно, из меню аккаунта. */
export function companyBlock(co: Pick<DirectoryCompany, 'mc' | 'companyName' | 'companyEmail'>): string {
  return [
    `MC - ${co.mc.trim() || '—'}`,
    `Company Name - ${co.companyName.trim() || '—'}`,
    `Email - ${co.companyEmail.trim() || '—'}`,
  ].join('\n')
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

export function copyText(text: string, okMessage: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => notify('ok', okMessage))
    // Буфер закрыт (нет https или отказано в разрешении) — молчать нельзя, иначе
    // человек решит, что скопировалось, и отправит брокеру пустоту.
    .catch(() => notify('warn', text))
}
