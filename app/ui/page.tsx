// Витрина вида «draggable widget grid»: посмотреть и решить, переводить ли на него
// обзор. Цифры тут выдуманные и в базу страница не ходит — сломать ей нечего,
// в меню её нет, открывается только по прямому адресу /ui.

import { DollarSign, Package, Route, TrendingUp } from 'lucide-react'
import Link from 'next/link'
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

/** Плотная строка-журнал по образцу trade-journal-table. Не таблица: таблица требовала
 * min-width 420px, на телефоне уезжала вбок, и колонка статуса оказывалась за краем —
 * выглядело так, будто её обрезало. Две строки в одной, номер и маршрут сверху, деньги
 * и статус снизу: помещается на любой ширине без боковой прокрутки. */
function Journal() {
  return (
    <div className="panel-inset px-3.5 py-3">
      <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-white/55">
        Грузы недели
      </div>
      {ROWS.map((r) => (
        <div
          key={r.unit}
          className="grid grid-cols-[2rem_1fr_auto] items-center gap-x-2 gap-y-1 border-t border-white/[0.06] py-2 first:border-0 lg:grid-cols-[2.5rem_1fr_auto_auto] lg:gap-x-5"
        >
          <span className="nums text-md font-semibold text-white/80">{r.unit}</span>
          <span className="min-w-0 truncate text-base text-white/70">{r.lane}</span>
          {/* На узком экране ставка стоит в первой строке, на широком уезжает в конец
              строки — это единственная колонка, которую читают справа налево. */}
          <span className="nums text-right text-base font-semibold lg:order-last">{r.rate}</span>
          <span className="col-span-2 col-start-2 flex items-center gap-2 lg:col-span-1 lg:col-start-auto">
            <span className={`rounded-md px-1.5 py-0.5 text-2xs font-semibold ring-1 ${TONE[r.state]}`}>
              {r.state}
            </span>
            <span className="nums text-xs text-white/50">{r.rpm}/mi</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export default function Page() {
  return (
    <div className="mx-auto max-w-5xl px-3 py-4">
      <h1 className="text-xl font-bold">Обзор в новом виде</h1>
      <p className="mt-1 mb-4 max-w-prose text-base text-white/60">
        Плитки можно переставить, порядок запомнится. Цифры здесь выдуманные — тот же вид{' '}
        <Link href="/ui/overview" className="font-semibold text-haul-400 hover:underline">
          на настоящих данных
        </Link>
        .
      </p>

      <div className="panel p-2.5">
        <WidgetGrid
          storageKey="ui-preview"
          hintTouch="Нажмите, подержите и потяните плитку"
          hintPointer="Потяните плитку мышью"
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
            { id: 'journal', span: 'full', node: <Journal /> },
          ]}
        />
      </div>
    </div>
  )
}
