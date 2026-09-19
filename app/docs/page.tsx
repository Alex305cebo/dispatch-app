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

import Link from 'next/link'
import { listDocsForLibrary, listTrashedDocs, listTrucks, rateConByLoad } from '@/lib/loads'
import { DocLibrary, DocTrash, DocUpload } from '@/components/docs'
import { ByDispatcher, ByDriver, ByWeek, LoadsTab, Paid, Unpaid } from './finance-tabs'
import { Tab } from '@/components/tab-link'
import { Info } from '@/components/info'
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
        <p className="text-[13px] text-t2">{t(locale, SUBTITLE[tab])}</p>
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
        <Fleet companyId={companyId} />
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
      className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
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
  return (
    <>
      {/* Распознавание рейт-кона — быстрый путь: с бумаги начинается груз. */}
      <Link
        href="/loads/new"
        className="mb-3 flex items-center gap-3 rounded-2xl border border-haul-500/30 bg-haul-500/10 px-4 py-3 transition-colors hover:bg-haul-500/15"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-haul-500/20 text-[18px]">
          ⚡
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold text-haul-300">{t(locale, 'docs.recognize.title')}</span>
          <span className="block text-[12px] text-t2">{t(locale, 'docs.recognize.sub')}</span>
        </span>
        <span className="ml-auto shrink-0 text-t3">→</span>
      </Link>
      <LoadsTab companyId={companyId} locale={locale} query={query} money={money} />
    </>
  )
}

/** Бумаги без груза: страховка, регистрация, чеки за ремонт, фото — по тракам. */
async function Fleet({ companyId }: { companyId: 'default' | 'demo' }) {
  const [rows, trucks] = await Promise.all([listDocsForLibrary(companyId), listTrucks(companyId)])
  const groups = trucks.map((tr) => ({ id: tr.id, label: tr.number ?? tr.name, driver: tr.driverName ?? '' }))
  // Бумаги груза живут в строке своего груза на вкладке «Грузы» — здесь их нет,
  // иначе это снова один общий список, в котором и искали через раз.
  const fleetRows = rows.filter((r) => r.loadId == null)

  return (
    <>
      <div className="panel mb-4 p-4">
        <DocUpload trucks={groups.map((g) => ({ id: g.id, label: g.driver ? `${g.label} · ${g.driver}` : g.label }))} />
      </div>
      <div className="panel p-4">
        <DocLibrary rows={fleetRows} trucks={groups} />
      </div>
    </>
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
