// Направления, сложенные по деньгам: куда возить выгодно, а куда — по привычке.
//
// Список грузов отвечает на вопрос «что было». Эта таблица — на вопрос «что брать
// дальше»: одинаковые рейсы сложены вместе, и видно, что Даллас — Атланта за
// одиннадцать рейсов принесла больше, чем разовый удачный дальняк.
//
// Ставка за милю считается по всем милям направления, а не как среднее от средних:
// иначе один короткий дорогой рейс задирал бы всё направление.

import Link from 'next/link'
import { lanes, repeatLanes, type PricedLoad } from '@/lib/lanes'
import { usd, usd2 } from '@/lib/fmt'
import { Info } from '@/components/info'
import { t, type Locale } from '@/lib/i18n'

export function LaneStats({ rows, locale }: { rows: PricedLoad[]; locale: Locale }) {
  const all = lanes(rows)
  const repeats = repeatLanes(all)
  // Повторяющиеся направления впереди: по ним решение «брать ещё» имеет смысл.
  // Если повторов нет вовсе (парк только начал возить), показываем всё подряд —
  // пустая таблица хуже короткой.
  const shown = (repeats.length > 0 ? repeats : all).slice(0, 8)
  if (shown.length === 0) return null

  return (
    <details className="panel mt-4 p-4">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
        <span className="text-white/40">▸</span>
        {t(locale, 'lanes.heading')}
        <Info text={t(locale, 'lanes.info')} />
        <span className="nums ml-auto normal-case text-white/35">{all.length}</span>
      </summary>

      {/* Список, а не таблица: таблица на телефоне уезжала в горизонтальную прокрутку и
          прятала и начало маршрута, и $/милю. Маршрут — своей строкой, цифры под ним;
          на широком экране цифры встают справа в ту же строку. «Ср. чистыми» убрано —
          главная цифра везде ставка. */}
      <ul className="mt-3 flex flex-col">
        {shown.map((l) => (
          <li key={l.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-white/6 py-2 text-[12.5px]">
            {/* Клик уводит в поиск по этому направлению — оттуда видно сами рейсы,
                из которых сложилась строка. */}
            <Link
              href={`/loads?q=${encodeURIComponent(l.origin)}`}
              className="min-w-0 basis-full text-[13px] font-medium text-white/85 hover:text-white hover:underline sm:flex-1 sm:basis-auto sm:truncate"
            >
              {l.origin} → {l.destination}
            </Link>
            <span className="nums flex shrink-0 items-baseline gap-x-3 text-white/60">
              <span>{t(locale, 'lanes.tripsInline').replace('{n}', String(l.loads))}</span>
              <span className="text-white/85">{usd.format(l.avgRate)}</span>
              <span
                className={`font-semibold ${
                  l.rpm >= 2 ? 'text-good-400' : l.rpm >= 1.5 ? 'text-white/85' : 'text-warn-400'
                }`}
              >
                {usd2.format(l.rpm)}/mi
              </span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}
