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

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
              <th className="pb-1.5 pr-3 font-medium">{t(locale, 'lanes.lane')}</th>
              <th className="pb-1.5 pr-3 text-right font-medium">{t(locale, 'lanes.trips')}</th>
              <th className="pb-1.5 pr-3 text-right font-medium">{t(locale, 'lanes.avgRate')}</th>
              <th className="pb-1.5 pr-3 text-right font-medium">{t(locale, 'lanes.rpm')}</th>
              <th className="pb-1.5 text-right font-medium">{t(locale, 'lanes.avgNet')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.key} className="border-t border-white/6">
                <td className="max-w-[16rem] truncate py-1.5 pr-3 text-white/85">
                  {/* Клик уводит в поиск по этому направлению — оттуда видно сами рейсы,
                      из которых сложилась строка. Цифра без возможности её раскрыть
                      заставляет верить на слово. */}
                  <Link
                    href={`/loads?q=${encodeURIComponent(l.origin)}`}
                    className="hover:text-white hover:underline"
                  >
                    {l.origin} → {l.destination}
                  </Link>
                </td>
                <td className="nums py-1.5 pr-3 text-right text-white/60">{l.loads}</td>
                <td className="nums py-1.5 pr-3 text-right text-white/85">{usd.format(l.avgRate)}</td>
                <td
                  className={`nums py-1.5 pr-3 text-right ${
                    l.rpm >= 2 ? 'text-good-400' : l.rpm >= 1.5 ? 'text-white/85' : 'text-warn-400'
                  }`}
                >
                  {usd2.format(l.rpm)}
                </td>
                <td
                  className={`nums py-1.5 text-right font-semibold ${
                    l.avgNet > 0 ? 'text-good-400' : 'text-bad-400'
                  }`}
                >
                  {usd.format(l.avgNet)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
