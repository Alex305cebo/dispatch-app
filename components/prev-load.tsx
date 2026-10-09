// «Прошлый груз» — одной строкой в шапке груза и на карточке трака.
//
// Это проверка, а не история. Deadhead считается от прошлой выгрузки, и когда между
// двумя рейсами груз не заведён (или заведён на другой трак), понять это можно только
// увидев оба рядом: прошлый закончился в Мемфисе, этот грузится в Далласе — вот откуда
// 400 порожних миль. Раньше, чтобы это сверить, надо было уйти на трак, найти рейс
// перед этим и вернуться; из-за этого красный флаг Deadhead (components/deadhead-flag.tsx)
// закрывали кнопкой «Всё верно», не проверив.
//
// Серверный компонент: сам груз выбирает prevLoadFor (lib/map.ts) на странице, где
// список грузов трака уже загружен, — отдельного захода в базу строка не стоит.

import Link from 'next/link'
import { History } from 'lucide-react'
import type { LoadRecord } from '@/lib/map'
import { Rpm } from '@/components/rpm'
import { usd, usDate } from '@/lib/fmt'
import { Info } from '@/components/info'
import { RateConButton } from '@/components/ratecon-button'
import { t, type Locale } from '@/lib/i18n'

export function PrevLoad({
  load,
  rcId,
  locale,
  className = '',
}: {
  /** Прошлый рейс трака; null — рейс у трака первый, строки нет. */
  load: LoadRecord | null
  /** Rate Con прошлого рейса — кнопкой справа от строки. */
  rcId?: number
  locale: Locale
  className?: string
}) {
  if (!load) return null
  return (
    <div className={className}>
      {/* Подпись со значком — отдельной строкой над самим грузом: внутри строки ⓘ
          попадал под ссылку и открывал груз вместо подсказки. */}
      <p className="mb-1 flex items-center gap-1.5 px-0.5 text-xs font-semibold tracking-wide text-t3 uppercase">
        <History size={12} strokeWidth={2.2} aria-hidden />
        {t(locale, 'prevLoad.label')}
        <Info text={t(locale, 'prevLoad.info')} />
      </p>
      {/* Маршрут и деньги — в строку, дата с номером — под ними. Одной общей строкой с
          переносом на телефоне вторая строка начиналась с висящей точки-разделителя.
          Rate Con — рядом со ссылкой, а не внутри: <button> в <a> — невалидная разметка. */}
      <div className={`panel-inset flex items-center transition-colors hover:bg-white/[0.06] ${rcId ? 'pr-2' : ''}`}>
        <Link
          href={`/loads/${load.id}`}
          className="group block min-w-0 flex-1 px-3 py-2 text-sm max-md:min-h-11"
        >
          <span className="flex items-baseline gap-x-2">
            <span className="min-w-0 font-medium text-t1 group-hover:underline">
              {load.origin ?? '—'} → {load.destination ?? '—'}
            </span>
            <span className="nums ml-auto shrink-0 font-semibold text-t2">
              {usd.format(load.rate)} <Rpm rate={load.rate} miles={load.loadedMiles + load.deadheadMiles} className="text-sm font-normal text-t3" />
            </span>
          </span>
          {(load.deliveryDate || load.referenceId) && (
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-t3">
              {load.deliveryDate && (
                <span className="nums">
                  {t(locale, 'prevLoad.delivered')} {usDate(load.deliveryDate)}
                </span>
              )}
              {load.referenceId && <span className="nums text-t3">#{load.referenceId}</span>}
            </span>
          )}
        </Link>
        {rcId && <RateConButton docId={rcId} compact />}
      </div>
    </div>
  )
}
