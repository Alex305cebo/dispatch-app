'use client'

import { useState, useTransition } from 'react'
import { ChevronRight, Copy } from 'lucide-react'
import { saveDispatcherPhone } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

/**
 * Справочник водителей — то, что у диспетчера спрашивает брокер.
 *
 * Зачем отдельная секция. Эти поля брокер спрашивает в каждом звонке, а лежали они
 * в четырёх разных местах: имя и номер трака — на карточке, телефон, прицеп и VIN —
 * внутри «паспорта трака» на странице конкретного трака, MC и название компании —
 * в настройках. Собрать их во время разговора значило уйти со страницы два-три
 * раза, держа брокера на линии.
 *
 * Почему показываем ровно тот текст, который копируется. Диспетчер эти данные не
 * диктует, а отправляет сообщением, и формат у них устоявшийся — до строчки. Если
 * на экране одна раскладка, а в буфере другая, доверия к кнопке нет. Поэтому
 * развёрнутый водитель — это и есть готовый блок, а «Скопировать» кладёт в буфер
 * ровно его.
 *
 * Сама секция свёрнута: она стоит первой на странице и в развёрнутом виде
 * отодвигала бы парк за нижний край экрана.
 */

export interface DriverEntry {
  truckId: number
  driverName: string | null
  driverPhone: string | null
  truckNumber: string | null
  trailerNumber: string | null
  vin: string | null
}

export function DriverDirectory({
  drivers,
  mc,
  companyName,
  dispatcherName,
  dispatcherPhone,
}: {
  drivers: DriverEntry[]
  mc: string
  companyName: string
  dispatcherName: string
  /** Личный номер диспетчера. В блоке он стоит рядом с именем — брокер звонит
   * человеку, который прислал груз, а не на общий номер компании. */
  dispatcherPhone: string
}) {
  const locale = useLocale()
  const [openSection, setOpenSection] = useState(false)
  // Открыт максимум один водитель: справочник читают по одному за раз, а восемь
  // развёрнутых блоков — это уже не компактная секция наверху страницы.
  const [openDriver, setOpenDriver] = useState<number | null>(null)
  const [phone, setPhone] = useState(dispatcherPhone)
  const [editPhone, setEditPhone] = useState(false)
  const [pending, start] = useTransition()

  if (drivers.length === 0) return null

  return (
    <section className="panel mb-4 p-3 sm:p-4">
      <button
        type="button"
        onClick={() => setOpenSection((v) => !v)}
        aria-expanded={openSection}
        className="flex w-full items-center gap-2 text-left"
      >
        <ChevronRight
          size={14}
          strokeWidth={2.5}
          className={`shrink-0 text-white/40 transition-transform ${openSection ? 'rotate-90' : ''}`}
        />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'drivers.title')}
        </h2>
        <span className="nums text-[11px] text-white/35">{drivers.length}</span>
        <span className="ml-auto truncate text-[11px] text-white/40">
          {t(locale, 'drivers.subtitle')}
        </span>
      </button>

      {openSection && (
        <>
          {/* Свой номер диспетчер вписывает прямо здесь: в базе его негде было
              хранить, а в блок он обязан попасть — брокер перезванивает человеку,
              а не на общий номер компании. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-white/6 px-3 py-2 text-[12px]">
            <span className="text-white/50">{t(locale, 'drivers.dispatcher')}</span>
            <span className="font-medium text-white/85">{dispatcherName || '—'}</span>
            {editPhone ? (
              <>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="786 461 4739"
                  className="nums min-w-0 flex-1 rounded-md border border-white/10 bg-ink-950/70 px-2 py-1 text-[12px] text-white outline-none focus:border-haul-500"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await saveDispatcherPhone(phone)
                      if (res?.error) notify('error', res.error)
                      else {
                        notify('ok', t(locale, 'drivers.phoneSaved'))
                        setEditPhone(false)
                      }
                    })
                  }
                  className="shrink-0 rounded-md bg-haul-500/20 px-2 py-1 text-[12px] font-medium text-haul-300 hover:bg-haul-500/30 disabled:opacity-50"
                >
                  {t(locale, 'drivers.save')}
                </button>
              </>
            ) : (
              <>
                <span className="nums text-white/85">{phone || t(locale, 'drivers.noPhone')}</span>
                <button
                  type="button"
                  onClick={() => setEditPhone(true)}
                  className="text-[11px] text-haul-400 hover:underline"
                >
                  {t(locale, 'drivers.editPhone')}
                </button>
              </>
            )}
          </div>

          <ul className="mt-2 flex flex-col gap-1">
            {drivers.map((d) => {
              const isOpen = openDriver === d.truckId
              const block = infoBlock(d, { mc, companyName, dispatcherName, dispatcherPhone: phone })
              return (
                <li key={d.truckId} className="rounded-lg border border-white/6">
                  <button
                    type="button"
                    onClick={() => setOpenDriver(isOpen ? null : d.truckId)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <ChevronRight
                      size={13}
                      strokeWidth={2.5}
                      className={`shrink-0 text-white/35 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                      {d.driverName || t(locale, 'drivers.noName')}
                    </span>
                    <span className="nums shrink-0 text-[12px] text-white/45">
                      {d.truckNumber ? `TRK-${d.truckNumber}` : '—'}
                      {d.trailerNumber ? ` · TRL-${d.trailerNumber}` : ''}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-white/6 p-3">
                      <pre className="nums overflow-x-auto whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-white/85">
                        {block}
                      </pre>
                      <button
                        type="button"
                        onClick={() => copy(block, t(locale, 'drivers.copied'))}
                        className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-haul-500/35 bg-haul-500/[0.10] px-2.5 py-1 text-[12px] font-medium text-haul-300 transition-colors hover:border-haul-400/60 hover:bg-haul-500/20"
                      >
                        <Copy size={12} strokeWidth={2.5} />
                        {t(locale, 'drivers.copy')}
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

/**
 * Готовый блок для брокера — в том виде, в котором его отправляют. Раскладка,
 * порядок строк и пустые строки повторяют образец заказчика: это устоявшийся
 * формат отрасли, брокер читает его глазами и ждёт именно такой.
 *
 * Всегда по-английски, независимо от языка интерфейса: получатель — американский
 * брокер, а не пользователь приложения.
 */
export function infoBlock(
  d: DriverEntry,
  co: { mc: string; companyName: string; dispatcherName: string; dispatcherPhone: string },
): string {
  const dash = (v: string | null | undefined) => (v && v.trim() ? v.trim() : '—')
  return [
    `Driver Name – ${dash(d.driverName)}`,
    `Driver Phone Number – ${dash(d.driverPhone)}`,
    `Truck Number – ${dash(d.truckNumber)}`,
    `Trailer Number – ${dash(d.trailerNumber)}`,
    '',
    `Truck VIN - ${dash(d.vin)}`,
    '',
    '',
    `Dispatcher – ${dash(co.dispatcherName)}`,
    `Dispatcher Number – ${dash(co.dispatcherPhone)}`,
    `MC - ${dash(co.mc)}`,
    `Company Name – ${dash(co.companyName)}`,
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
