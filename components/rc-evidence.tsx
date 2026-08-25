'use client'

// «Что прочитано и откуда» — таблица полей рейт-кона с цитатой из документа.
//
// Смысл цитаты: число можно ПРОВЕРИТЬ, а не просто принять. Ставка $7,450 сама по
// себе ничего не доказывает; строка «Total USD $7450.0», из которой она взята,
// доказывает. Там же видно, чего в бумаге не нашлось вовсе, — жёлтым.
//
// Жил этот блок на отдельной странице импорта. Страниц, заводящих груз из рейт-кона,
// было две: «Новый груз» со сканером и /import со сканером и этой таблицей. Одно
// действие — один экран, поэтому таблица переехала сюда, а /import стал
// переадресацией.

import type { RateConFields } from '@/lib/ratecon'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale } from '@/lib/i18n'

/** Поля, которые показываем с цитатой. Стопы, адреса и заметки сюда не входят: они
 * длинные и видны в самой форме ниже. */
type FoundKey = Exclude<
  keyof RateConFields,
  'transitDays' | 'stops' | 'pickupStop' | 'deliveryStop' | 'importantNotes' | 'pickupAddress' | 'deliveryAddress'
>

function labelsFor(locale: Locale): Record<FoundKey, string> {
  return {
    rate: t(locale, 'import.label.rate'),
    loadedMiles: t(locale, 'import.label.loadedMiles'),
    payVia: t(locale, 'import.label.payVia'),
    origin: t(locale, 'import.label.origin'),
    destination: t(locale, 'import.label.destination'),
    // Not "broker's MC": real rate cons carry the CARRIER's MC (yours) just as often.
    mcNumber: t(locale, 'import.label.mcNumber'),
    brokerName: t(locale, 'import.label.brokerName'),
    brokerPhone: t(locale, 'import.label.brokerPhone'),
    brokerEmail: t(locale, 'import.label.brokerEmail'),
    referenceId: t(locale, 'import.label.referenceId'),
    pickupDate: t(locale, 'import.label.pickupDate'),
    deliveryDate: t(locale, 'import.label.deliveryDate'),
    commodity: t(locale, 'import.label.commodity'),
    weight: t(locale, 'import.label.weight'),
  }
}

export function RcEvidence({ fields }: { fields: RateConFields }) {
  const locale = useLocale()
  const LABELS = labelsFor(locale)

  return (
    // Свёрнуто по умолчанию: на обычном рейт-коне всё прочиталось верно, и четырнадцать
    // строк с цитатами только отодвигают форму. Открывают, когда цифра вызывает сомнение.
    <details className="panel mb-3 p-3">
      <summary className="cursor-pointer list-none text-[12px] font-semibold text-white/70">
        <span className="text-white/40">▸ </span>
        {t(locale, 'import.whatWasRead')}
      </summary>

      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {(Object.keys(LABELS) as FoundKey[]).map((k) => {
          const f = fields[k]
          return (
            <div
              key={k}
              className={`rounded-lg border px-2.5 py-1.5 ${
                f ? 'border-white/8 bg-white/[0.02]' : 'border-amber-400/25 bg-amber-400/[0.04]'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-white/62">{LABELS[k]}</span>
                <span className={`nums text-[13px] ${f ? 'text-white/85' : 'text-amber-300/70'}`}>
                  {f ? String(f.value) : t(locale, 'import.notFound')}
                </span>
              </div>
              {/* Цитата из документа — по ней число проверяют, а не принимают на веру. */}
              {f && (
                <p className="mt-0.5 truncate text-[10px] text-white/52" title={f.evidence}>
                  {f.evidence}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-white/62">{t(locale, 'import.nothingGuessed')}</p>
    </details>
  )
}
