// Витрина вида «draggable widget grid»: посмотреть и решить, переводить ли на него
// обзор. Цифры тут выдуманные и в базу страница не ходит — сломать ей нечего,
// в меню её нет, открывается только по прямому адресу /ui.

import { DollarSign, Package, Route, TrendingUp } from 'lucide-react'
import { Stat } from '@/components/stat'
import { WidgetGrid } from '@/components/widget-grid'

export const dynamic = 'force-dynamic'

const ROWS = [
  { unit: '104', lane: 'Chicago, IL → Dallas, TX', rate: '$3,150', rpm: '3.42', state: 'В пути' },
  { unit: '108', lane: 'Atlanta, GA → Memphis, TN', rate: '$1,180', rpm: '2.98', state: 'Забукирован' },
  { unit: '112', lane: 'Laredo, TX → Denver, CO', rate: '$2,640', rpm: '2.11', state: 'Доставлен' },
  { unit: '117', lane: 'Fresno, CA → Seattle, WA', rate: '$2,900', rpm: '2.55', state: 'В пути' },
]

const TONE: Record<string, string> = {
  'В пути': 'bg-good-500/15 text-good-400 ring-good-400/20',
  Забукирован: 'bg-haul-500/15 text-haul-300 ring-haul-400/20',
  Доставлен: 'bg-white/[0.06] text-white/60 ring-white/10',
}

/** Плотная таблица-журнал по образцу trade-journal-table: строка = одна сделка,
 * цифры моноширинные, статус капсулой. Внутри плитки, чтобы её тоже можно было двигать. */
function Journal() {
  return (
    <div className="panel-inset px-3.5 py-3">
      <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-white/55">
        Грузы недели
      </div>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.unit} className="border-t border-white/[0.06] first:border-0">
                <td className="py-1.5 pl-1 pr-2 nums font-semibold text-white/80">{r.unit}</td>
                <td className="py-1.5 pr-2 text-white/70">{r.lane}</td>
                <td className="py-1.5 pr-2 nums text-right font-semibold">{r.rate}</td>
                <td className="py-1.5 pr-2 nums text-right text-white/55">{r.rpm}/mi</td>
                <td className="py-1.5 pr-1 text-right">
                  <span className={`rounded-md px-1.5 py-0.5 text-2xs font-semibold ring-1 ${TONE[r.state]}`}>
                    {r.state}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <div className="mx-auto max-w-5xl px-3 py-4">
      <h1 className="text-xl font-bold">Как это выглядит</h1>
      <p className="mt-1 mb-4 max-w-prose text-base text-white/60">
        Тот же обзор, но плитки переставляются и запоминают порядок в этом браузере. Цифры
        здесь выдуманные, в базу страница не ходит.
      </p>

      <div className="panel p-2.5">
        <WidgetGrid
          storageKey="ui-preview"
          hintTouch="Нажмите, подержите и потяните плитку"
          hintPointer="Потяните плитку мышью, чтобы переставить"
          widgets={[
            {
              id: 'gross',
              node: (
                <Stat
                  hero
                  icon={<DollarSign size={15} strokeWidth={2.5} />}
                  accent="haul"
                  label="Ставка всего"
                  value="$81,799"
                />
              ),
            },
            {
              id: 'rpm',
              node: (
                <Stat
                  icon={<TrendingUp size={15} strokeWidth={2.5} />}
                  accent="good"
                  label="RPM"
                  value="$2.74/mi"
                />
              ),
            },
            {
              id: 'active',
              node: (
                <Stat
                  icon={<Package size={15} strokeWidth={2.5} />}
                  accent="warn"
                  label="В работе"
                  value="7"
                  sub="свободно траков: 2"
                  subTone="good"
                />
              ),
            },
            {
              id: 'miles',
              node: (
                <Stat
                  icon={<Route size={15} strokeWidth={2.5} />}
                  accent="haul"
                  label="Миль всего"
                  value="29,847"
                />
              ),
            },
            { id: 'journal', span: 2, node: <Journal /> },
          ]}
        />
      </div>
    </div>
  )
}
