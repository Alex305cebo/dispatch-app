// Раздел «Документы» — бывшие «Файлы» и «Финансы» одной страницей.
//
// Слито по грузу: у него есть и бумаги, и деньги, и раньше человек читал «не хватает
// POD» в одном разделе, а искал сам файл в другом. Теперь:
//   Грузы            — строка груза: плитки бумаг (открыть/догрузить) + путь денег;
//   Траки и водители — бумаги, у которых груза нет: страховка, регистрация, чеки, фото;
//   Деньги           — отчёты: кто должен, что оплачено, недели, диспетчеры, водители;
//   Корзина          — удалённые бумаги, откуда их возвращают.
//
// Денежные вкладки и суммы закрыты правом «Финансы»; без него остаются бумаги, и
// раздел не исчезает — файлы нужны всем, кто работает с грузом.
// Старый адрес /invoices ведёт сюда со своей вкладкой (app/invoices/page.tsx).

import { WidgetGrid, type Widget } from '@/components/widget-grid'
import { tileGrid } from '@/lib/tiles'
import { DOCS_FLEET_TILES, DOCS_TILES } from '@/lib/tiles-core'
import Link from 'next/link'
import { listDocsForLibrary, listTrashedDocs, listTrucks, rateConByLoad } from '@/lib/loads'
import { DocLibrary, DocTrash, DocUpload } from '@/components/docs'
import { ByDispatcher, ByDriver, ByWeek, loadsTabTiles, Paid, Unpaid } from './finance-tabs'
import { FileText, Package, ScanText, Trash2, Truck, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { Info } from '@/components/info'
import { Stat } from '@/components/stat'
import { companyScope, getCurrentUser } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import { getLocale } from '@/lib/i18n-server'
import { t, type Locale, type MsgKey } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

/** Вкладки с деньгами — их видно только с правом «Финансы». */
const MONEY_TABS = ['unpaid', 'paid', 'weeks', 'dispatchers', 'drivers'] as const
type MoneyTab = (typeof MONEY_TABS)[number]
type Tabs = 'loads' | 'fleet' | 'trash' | MoneyTab

const isMoney = (tab: string): tab is MoneyTab => (MONEY_TABS as readonly string[]).includes(tab)

const SUBTITLE: Record<Tabs, MsgKey> = {
  loads: 'docs.sub.loads',
  fleet: 'docs.sub.fleet',
  trash: 'docs.sub.trash',
  unpaid: 'finances.tabDesc.unpaid',
  paid: 'finances.tabDesc.paid',
  weeks: 'finances.tabDesc.weeks',
  dispatchers: 'finances.tabDesc.dispatchers',
  drivers: 'finances.tabDesc.drivers',
}

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; stage?: string }> }) {
  const { tab: tabParam, q, stage } = await searchParams
  const user = await getCurrentUser()
  const canFinances = await can(user, 'finances')
  // «По диспетчерам» — своё право (по умолчанию включено): заработок ВСЕХ диспетчеров.
  const canReport = await can(user, 'dispatcher_report')
  const companyId = await companyScope()
  const locale = await getLocale()

  const tab = pickTab(tabParam, canFinances, canReport)

  const sections: { key: string; href: string; label: string; icon: ReactNode; active: boolean }[] = [
    { key: 'loads', href: '/docs', label: t(locale, 'docs.tab.loads'), icon: <Package size={16} />, active: tab === 'loads' },
    { key: 'fleet', href: '/docs?tab=fleet', label: t(locale, 'docs.tab.fleet'), icon: <Truck size={16} />, active: tab === 'fleet' },
    ...(canFinances
      ? [{ key: 'money', href: '/docs?tab=unpaid', label: t(locale, 'docs.tab.money'), icon: <Wallet size={16} />, active: isMoney(tab) }]
      : []),
    { key: 'trash', href: '/docs?tab=trash', label: t(locale, 'docs.tab.trash'), icon: <Trash2 size={16} />, active: tab === 'trash' },
  ]

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      {/* Шапка: слева что это за раздел и что на вкладке, справа — главное действие.
          С бумаги начинается груз, поэтому «Распознать Rate Con» — кнопка шапки, а не
          плитка, которая съедала полстроки над числами. */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            {t(locale, 'docs.title')}
            <Info side="bottom" text={t(locale, 'docs.info')} />
          </h1>
          <p className="mt-0.5 text-base text-t2">{t(locale, SUBTITLE[tab])}</p>
        </div>
        <Link
          href="/loads/new"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-haul-500 px-4 text-base font-semibold text-white shadow-[0_8px_24px_-10px_rgba(124,108,255,0.8)] transition-colors hover:bg-haul-400 max-sm:w-full max-sm:justify-center"
        >
          <ScanText size={17} strokeWidth={2.25} />
          {t(locale, 'docs.recognize.btn')}
        </Link>
      </header>

      {/* Разделы — одним переключателем-сегментом: груз, трак, деньги, корзина.
          На телефоне четыре равные ячейки со значком над словом — влезают в ширину. */}
      <nav
        aria-label={t(locale, 'docs.title')}
        className="panel mb-4 grid auto-cols-fr grid-flow-col gap-1 p-1 sm:inline-grid"
      >
        {sections.map((s) => (
          <Link
            key={s.key}
            href={s.href}
            aria-current={s.active ? 'page' : undefined}
            className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-base font-medium transition-colors max-sm:flex-col max-sm:gap-0.5 max-sm:px-1 max-sm:py-1.5 max-sm:text-sm ${
              s.active
                ? 'bg-haul-500 text-white shadow-[0_6px_18px_-8px_rgba(124,108,255,0.9)]'
                : 'text-t2 hover:bg-white/6 hover:text-t1'
            }`}
          >
            {s.icon}
            {s.label}
          </Link>
        ))}
      </nav>

      {isMoney(tab) && (
        <div className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip href="/docs?tab=unpaid" active={tab === 'unpaid'} label={t(locale, 'finances.tab.unpaid')} />
          <Chip href="/docs?tab=paid" active={tab === 'paid'} label={t(locale, 'finances.tab.paid')} />
          <Chip href="/docs?tab=weeks" active={tab === 'weeks'} label={t(locale, 'finances.tab.weeks')} />
          {canReport && (
            <Chip href="/docs?tab=dispatchers" active={tab === 'dispatchers'} label={t(locale, 'finances.tab.dispatchers')} />
          )}
          <Chip href="/docs?tab=drivers" active={tab === 'drivers'} label={t(locale, 'finances.tab.drivers')} />
        </div>
      )}

      {tab === 'loads' ? (
        <Loads companyId={companyId} locale={locale} query={q ?? ''} stage={stage ?? ''} money={canFinances} />
      ) : tab === 'fleet' ? (
        <Fleet companyId={companyId} locale={locale} />
      ) : tab === 'trash' ? (
        <Trash companyId={companyId} />
      ) : (
        <Money tab={tab} companyId={companyId} locale={locale} />
      )}
    </main>
  )
}

/** Адрес → вкладка, с оглядкой на права. Старые ссылки (/docs?tab=trash и все
 * /invoices?tab=…) ведут туда же, куда вели: их вкладки никуда не делись. */
function pickTab(param: string | undefined, canFinances: boolean, canReport: boolean): Tabs {
  const tab = param === 'library' ? 'loads' : (param ?? 'loads')
  if (tab === 'fleet' || tab === 'trash') return tab
  if (isMoney(tab)) {
    if (!canFinances) return 'loads'
    return tab === 'dispatchers' && !canReport ? 'unpaid' : tab
  }
  return 'loads'
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'border-haul-400/50 bg-haul-500/20 text-t1'
          : 'border-white/8 bg-white/4 text-t2 hover:border-white/16 hover:text-t1'
      }`}
    >
      {label}
    </Link>
  )
}

async function Loads({
  companyId,
  locale,
  query,
  stage,
  money,
}: {
  companyId: 'default' | 'demo'
  locale: Locale
  query: string
  stage: string
  money: boolean
}) {
  const widgets: Widget[] = await loadsTabTiles({ companyId, locale, query, stage, money })
  const grid = await tileGrid('docs', DOCS_TILES, locale)

  return (
    <WidgetGrid {...grid} widgets={widgets} />
  )
}

/** Бумаги без груза: страховка, регистрация, чеки за ремонт, фото — по тракам. */
async function Fleet({ companyId, locale }: { companyId: 'default' | 'demo'; locale: Locale }) {
  const [rows, trucks] = await Promise.all([listDocsForLibrary(companyId), listTrucks(companyId)])
  const groups = trucks.map((tr) => ({ id: tr.id, label: tr.number ?? tr.name, driver: tr.driverName ?? '' }))
  // Бумаги груза живут в строке своего груза на вкладке «Грузы» — здесь их нет,
  // иначе это снова один общий список, в котором и искали через раз.
  const fleetRows = rows.filter((r) => r.loadId == null)

  // Сколько бумаг и по скольким тракам — своими маленькими плитками: в шапке
  // библиотеки этих чисел не было вовсе, а спрашивают их первыми.
  const widgets: Widget[] = [
    {
      id: 'docs-count',
      node: (
        <Stat surface="panel" label={t(locale, 'docs.tiles.papers')} value={String(fleetRows.length)} icon={<FileText size={13} strokeWidth={2.5} />} />
      ),
    },
    {
      id: 'docs-trucks',
      node: (
        <Stat
          surface="panel"
          label={t(locale, 'docs.tiles.trucks')}
          value={String(new Set(fleetRows.map((r) => r.groupTruckId).filter((id) => id != null)).size)}
          icon={<Truck size={13} strokeWidth={2.5} />}
        />
      ),
    },
    {
      id: 'upload',
      node: (
        <div className="panel h-full p-4">
          <DocUpload trucks={groups.map((g) => ({ id: g.id, label: g.driver ? `${g.label} · ${g.driver}` : g.label }))} />
        </div>
      ),
    },
    {
      id: 'library',
      node: (
        <div className="panel h-full p-4">
          <DocLibrary rows={fleetRows} trucks={groups} />
        </div>
      ),
    },
  ]
  const grid = await tileGrid('docs-fleet', DOCS_FLEET_TILES, locale)

  return (
    <WidgetGrid {...grid} widgets={widgets} />
  )
}

async function Trash({ companyId }: { companyId: 'default' | 'demo' }) {
  const trash = await listTrashedDocs(companyId)
  return (
    <div className="panel p-4">
      <DocTrash rows={trash} />
    </div>
  )
}

async function Money({ tab, companyId, locale }: { tab: MoneyTab; companyId: 'default' | 'demo'; locale: Locale }) {
  const rateCons = await rateConByLoad(companyId)
  switch (tab) {
    case 'unpaid':
      return <Unpaid companyId={companyId} rateCons={rateCons} locale={locale} />
    case 'paid':
      return <Paid companyId={companyId} rateCons={rateCons} locale={locale} />
    case 'weeks':
      return <ByWeek companyId={companyId} rateCons={rateCons} locale={locale} />
    case 'dispatchers':
      return <ByDispatcher companyId={companyId} locale={locale} />
    case 'drivers':
      return <ByDriver companyId={companyId} locale={locale} />
  }
}
