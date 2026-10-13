'use client'

// Карта горячести штатов — квадрат на штат, по местам примерно как на карте США
// (раскладка «tile grid», как у NPR). Цвет — сколько грузов DAT на один трак в штате
// против медианы по стране: оранжевый — грузов много (горячий), голубой — мало. Так
// «куда ехать за грузом» видно одним взглядом, а не таблицей из пятидесяти строк
// (владелец, 13/10/26: «переделай всё» по образцу SmartHop; у SmartHop такая карта
// рынка — главная картинка раздела). Нажатие на штат ставит его в «Откуда» планировщика.

import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { usd2 } from '@/lib/fmt'
import { heatLevel, HEAT_LEVEL_KEY, ltMedian, regionOf, type DatSnapshot, type HeatLevel } from '@/lib/dat-market-core'
import { stateLabel } from '@/lib/route-plan-core'

/** [столбец, строка] каждого штата в сетке 12 × 8. Плитки шире, чем выше (с sm): карта
 *  во всю ширину раздела и не выше полэкрана. */
const TILES: Record<string, [number, number]> = {
  AK: [0, 0], ME: [11, 0],
  WI: [6, 1], VT: [10, 1], NH: [11, 1],
  WA: [1, 2], ID: [2, 2], MT: [3, 2], ND: [4, 2], MN: [5, 2], IL: [6, 2], MI: [7, 2], NY: [9, 2], MA: [10, 2],
  OR: [1, 3], NV: [2, 3], WY: [3, 3], SD: [4, 3], IA: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3], NJ: [9, 3], CT: [10, 3], RI: [11, 3],
  CA: [1, 4], UT: [2, 4], CO: [3, 4], NE: [4, 4], MO: [5, 4], KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4],
  AZ: [2, 5], NM: [3, 5], KS: [4, 5], AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5], DC: [9, 5],
  OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6],
  HI: [0, 7], TX: [4, 7], FL: [9, 7],
}

/** Заливка по уровню. Цвета свои, не акцент: «горячо» — оранжевый и при фиолетовом
 *  акценте, иначе карта перекрашивалась бы вместе с кнопками. */
const FILL: Record<HeatLevel, { bg: string; fg: string }> = {
  veryHot: { bg: 'rgba(234, 88, 12, 0.92)', fg: '#ffffff' },
  hot: { bg: 'rgba(249, 115, 22, 0.5)', fg: 'var(--color-t1)' },
  warm: { bg: 'color-mix(in srgb, var(--color-white) 8%, transparent)', fg: 'var(--color-t2)' },
  cold: { bg: 'rgba(14, 165, 233, 0.32)', fg: 'var(--color-t1)' },
  veryCold: { bg: 'rgba(2, 132, 199, 0.85)', fg: '#ffffff' },
}
const LEVELS: HeatLevel[] = ['veryCold', 'cold', 'warm', 'hot', 'veryHot']

export function StateHeatGrid({
  snap,
  origin,
  onPick,
}: {
  snap: DatSnapshot
  /** Штат «Откуда» — обведён. */
  origin?: string | null
  onPick?: (state: string) => void
}) {
  const locale = useLocale()
  const median = ltMedian(snap)
  if (!(median > 0)) return null

  return (
    <div>
      <div className="grid grid-cols-12 gap-[3px] sm:gap-1" role="list">
        {Object.entries(TILES).map(([code, [col, row]]) => {
          const ratio = snap.lt[code]?.ratio ?? null
          const level = ratio != null && ratio > 0 ? heatLevel(median, ratio) : null
          const fill = level ? FILL[level] : { bg: 'color-mix(in srgb, var(--color-white) 4%, transparent)', fg: 'var(--color-t3)' }
          const rate = regionOf(snap, code)?.rpm
          const title = [
            stateLabel(code),
            level ? t(locale, HEAT_LEVEL_KEY[level]) : null,
            ratio != null && ratio > 0 ? t(locale, 'plan.ltVsMedian').replace('{n}', ratio.toFixed(1)).replace('{m}', median.toFixed(1)) : null,
            rate ? `DAT ${usd2.format(rate)}/mi` : null,
          ]
            .filter(Boolean)
            .join('\n')
          const picked = origin === code
          return (
            <button
              key={code}
              type="button"
              role="listitem"
              title={title}
              aria-label={title.replace(/\n/g, ' · ')}
              disabled={!onPick}
              onClick={() => onPick?.(code)}
              style={{ gridColumn: col + 1, gridRow: row + 1, background: fill.bg, color: fill.fg }}
              className={`flex aspect-square min-w-0 items-center justify-center rounded-[5px] text-[10px] font-semibold transition-[transform,box-shadow] duration-100 sm:aspect-[3/2] sm:text-xs lg:text-sm ${
                onPick ? 'cursor-pointer hover:scale-105 hover:shadow-md' : 'cursor-default'
              } ${picked ? 'ring-2 ring-t1 ring-offset-1 ring-offset-[var(--glass-bg)]' : ''}`}
            >
              {code}
            </button>
          )
        })}
      </div>
      {/* Шкала: от «очень холодный» до «очень горячий» — словами, цвет рядом. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-t3">
        {LEVELS.map((lv) => (
          <span key={lv} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: FILL[lv].bg }} aria-hidden />
            {t(locale, HEAT_LEVEL_KEY[lv]).replace(/^[^\p{L}]+/u, '')}
          </span>
        ))}
      </div>
    </div>
  )
}
