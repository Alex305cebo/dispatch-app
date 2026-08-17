'use client'

import { useState } from 'react'
import { ChevronRight, Copy } from 'lucide-react'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

/**
 * Справочник водителей — то, что у диспетчера спрашивает брокер.
 *
 * Зачем отдельная секция. Эти шесть полей брокер спрашивает в каждом звонке, а
 * лежали они в четырёх разных местах: имя и номер трака — на карточке, телефон,
 * прицеп и VIN — внутри «паспорта трака» под кнопкой на странице конкретного
 * трака, MC компании — вообще в настройках. Собрать их во время разговора значило
 * уйти со страницы два-три раза, держа брокера на линии.
 *
 * Свёрнутый вид — одна строка на водителя, чтобы секция наверху не съедала экран.
 * Развёрнутый — шесть полей, каждое копируется в один щелчок, плюс «скопировать
 * всё» одним блоком: брокеру эти данные обычно отправляют текстом, а не диктуют.
 */

export interface DriverEntry {
  truckId: number
  driverName: string | null
  driverPhone: string | null
  truckNumber: string | null
  trailerNumber: string | null
  vin: string | null
}

export function DriverDirectory({ drivers, mcdot }: { drivers: DriverEntry[]; mcdot: string }) {
  const locale = useLocale()
  // Открыт максимум один: справочник читают по одному водителю за раз, а список
  // из восьми развёрнутых карточек — это уже не компактная секция наверху.
  const [open, setOpen] = useState<number | null>(null)

  if (drivers.length === 0) return null

  return (
    <section className="panel mb-4 p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'drivers.title')}
        </h2>
        <span className="text-[11px] text-white/40">{t(locale, 'drivers.subtitle')}</span>
      </div>

      <ul className="flex flex-col gap-1">
        {drivers.map((d) => {
          const isOpen = open === d.truckId
          const fields: { label: string; value: string | null }[] = [
            { label: t(locale, 'drivers.name'), value: d.driverName },
            { label: t(locale, 'drivers.phone'), value: d.driverPhone },
            { label: t(locale, 'drivers.truck'), value: d.truckNumber },
            { label: t(locale, 'drivers.trailer'), value: d.trailerNumber },
            { label: 'MC', value: mcdot || null },
            { label: 'VIN', value: d.vin },
          ]

          return (
            <li key={d.truckId} className="rounded-lg border border-white/6">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : d.truckId)}
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
                {/* В свёрнутой строке — только номера: по ним водителя и находят,
                    остальное разворачивается. */}
                <span className="nums shrink-0 text-[12px] text-white/45">
                  {d.truckNumber ? `TRK-${d.truckNumber}` : '—'}
                  {d.trailerNumber ? ` · TRL-${d.trailerNumber}` : ''}
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-white/6 px-3 py-2.5">
                  <dl className="grid gap-1.5 sm:grid-cols-2">
                    {fields.map((f) => (
                      <CopyRow key={f.label} label={f.label} value={f.value} locale={locale} />
                    ))}
                  </dl>
                  <button
                    type="button"
                    onClick={() => copy(blockFor(d, mcdot, locale), t(locale, 'drivers.copiedAll'))}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-haul-500/35 bg-haul-500/[0.10] px-2.5 py-1 text-[12px] font-medium text-haul-300 transition-colors hover:border-haul-400/60 hover:bg-haul-500/20"
                  >
                    <Copy size={12} strokeWidth={2.5} />
                    {t(locale, 'drivers.copyAll')}
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Одно поле. Пустое не копируется и подписано, где его заполнить. */
function CopyRow({
  label,
  value,
  locale,
}: {
  label: string
  value: string | null
  locale: Parameters<typeof t>[0]
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <dt className="shrink-0 text-white/50">{label}</dt>
      <dd className="min-w-0 text-right">
        {value ? (
          <button
            type="button"
            onClick={() => copy(value, t(locale, 'drivers.copied'))}
            title={t(locale, 'drivers.copyHint')}
            className="nums group inline-flex max-w-full items-center gap-1.5 break-all text-left font-medium text-white/85 hover:text-haul-300"
          >
            {value}
            <Copy size={11} strokeWidth={2.5} className="shrink-0 text-white/25 group-hover:text-haul-400" />
          </button>
        ) : (
          <span className="text-white/30">{t(locale, 'drivers.empty')}</span>
        )}
      </dd>
    </div>
  )
}

/** Готовый блок для отправки брокеру — он обычно просит текстом, а не голосом. */
function blockFor(d: DriverEntry, mcdot: string, locale: Parameters<typeof t>[0]): string {
  return [
    `${t(locale, 'drivers.name')}: ${d.driverName || '—'}`,
    `${t(locale, 'drivers.phone')}: ${d.driverPhone || '—'}`,
    `${t(locale, 'drivers.truck')}: ${d.truckNumber || '—'}`,
    `${t(locale, 'drivers.trailer')}: ${d.trailerNumber || '—'}`,
    `MC: ${mcdot || '—'}`,
    `VIN: ${d.vin || '—'}`,
  ].join('\n')
}

function copy(text: string, okMessage: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => notify('ok', okMessage))
    // Буфер закрыт (нет https или отказано в разрешении) — молчать нельзя, иначе
    // человек будет думать, что скопировалось, и вставит брокеру пустоту.
    .catch(() => notify('warn', text))
}
