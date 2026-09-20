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
import { Tab } from '@/components/tab-link'
import { Info } from '@/components/info'
import { CountTile } from '@/components/count-tile'
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

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tab: tabParam, q } = await searchParams
  const user = await getCurrentUser()
  const canFinances = await can(user, 'finances')
  // «По диспетчерам» — своё право (по умолчанию включено): заработок ВСЕХ диспетчеров.
  const canReport = await can(user, 'dispatcher_report')
  const companyId = await companyScope()
  const locale = await getLocale()

  const tab = pickTab(tabParam, canFinances, canReport)

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          {t(locale, 'docs.title')}
          <Info side="bottom" text={t(locale, 'docs.info')} />
        </h1>
        <p className="text-base text-t2">{t(locale, SUBTITLE[tab])}</p>
      </header>

      {/* Четыре входа: груз, трак, деньги, корзина. Денежные отчёты разворачиваются
          вторым рядом — одним рядом из восьми вкладок раздел читать нельзя. */}
      <div className="mb-4 flex flex-wrap gap-1.5 border-b border-white/8">
        <Tab href="/docs" active={tab === 'loads'}>
          {t(locale, 'docs.tab.loads')}
        </Tab>
        <Tab href="/docs?tab=fleet" active={tab === 'fleet'}>
          {t(locale, 'docs.tab.fleet')}
        </Tab>
        {canFinances && (
          <Tab href="/docs?tab=unpaid" active={isMoney(tab)}>
            {t(locale, 'docs.tab.money')}
          </Tab>
        )}
        <Tab href="/docs?tab=trash" active={tab === 'trash'}>
          {t(locale, 'docs.tab.trash')}
        </Tab>
      </div>

      {isMoney(tab) && (
        <div className="mb-5 flex flex-wrap gap-1.5">
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
        <Loads companyId={companyId} locale={locale} query={q ?? ''} money={canFinances} />
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
      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
        active ? 'bg-haul-500 text-white' : 'bg-white/6 text-t2 hover:bg-white/10 hover:text-t1'
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
  money,
}: {
  companyId: 'default' | 'demo'
  locale: Locale
  query: string
  money: boolean
}) {
  const widgets: Widget[] = [
    {
      id: 'recognize',
      // Распознавание рейт-кона — быстрый путь: с бумаги начинается груз.
      node: (
        <Link
          href="/loads/new"
          className="flex h-full items-center gap-3 rounded-2xl border border-haul-500/30 bg-haul-500/10 px-4 py-3 transition-colors hover:bg-haul-500/15"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-haul-500/20 text-xl">
            ⚡
          </span>
          <span className="min-w-0">
            <span className="block text-md font-semibold text-haul-300">{t(locale, 'docs.recognize.title')}</span>
            <span className="block text-sm text-t2">{t(locale, 'docs.recognize.sub')}</span>
          </span>
          <span className="ml-auto shrink-0 text-t3">→</span>
        </Link>
      ),
    },
    ...(await loadsTabTiles({ companyId, locale, query, money })),
  ]
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
    { id: 'docs-count', node: <CountTile value={fleetRows.length} label={t(locale, 'docs.tiles.papers')} /> },
    {
      id: 'docs-trucks',
      node: <CountTile value={new Set(fleetRows.map((r) => r.groupTruckId).filter((id) => id != null)).size} label={t(locale, 'docs.tiles.trucks')} />,
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
