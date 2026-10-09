// Раздел «Документы» — все бумаги парка.
//
//   Грузы   — строка груза: плитки бумаг (открыть/догрузить) + путь денег до оплаты;
//   Траки   — бумаги, у которых груза нет: страховка, регистрация, чеки, фото;
//   Корзина — удалённые бумаги, откуда их возвращают.
//
// Деньги (отчёты: кто должен, что оплачено, недели, диспетчеры, водители) с 10/09/26 —
// своим разделом app/money: раньше это была первая вкладка здесь, и раздел бумаг
// открывался на деньгах. Старые ссылки /docs?tab=unpaid и /invoices переводит туда
// next.config.ts (redirects).

import { WidgetGrid, type Widget } from '@/components/widget-grid'
import { tileGrid } from '@/lib/tiles'
import { DOCS_FLEET_TILES, DOCS_TILES } from '@/lib/tiles-core'
import Link from 'next/link'
import { listDocsForLibrary, listTrashedDocs, listTrucks } from '@/lib/loads'
import { DocLibrary, DocTrash, DocUpload } from '@/components/docs'
import { loadsTabTiles } from './finance-tabs'
import { SectionNav, type NavItem } from './tab-nav'
import { FileText, Package, ScanText, Trash2, Truck } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Stat } from '@/components/stat'
import { companyScope, getCurrentUser } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import { getLocale } from '@/lib/i18n-server'
import { t, type Locale, type MsgKey } from '@/lib/i18n'
import type { CompanyId } from '@/lib/company'

export const dynamic = 'force-dynamic'

type Tabs = 'loads' | 'fleet' | 'trash'

const SUBTITLE: Record<Tabs, MsgKey> = {
  loads: 'docs.sub.loads',
  fleet: 'docs.sub.fleet',
  trash: 'docs.sub.trash',
}

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; stage?: string }> }) {
  const { tab: tabParam, q, stage } = await searchParams
  const user = await getCurrentUser()
  const canFinances = await can(user, 'finances')
  const companyId = await companyScope()
  const locale = await getLocale()

  const tab: Tabs = tabParam === 'fleet' || tabParam === 'trash' ? tabParam : 'loads'

  const sections: NavItem[] = [
    { key: 'loads', href: '/docs?tab=loads', label: t(locale, 'docs.tab.loads'), icon: <Package size={16} />, active: tab === 'loads' },
    { key: 'fleet', href: '/docs?tab=fleet', label: t(locale, 'docs.tab.fleet'), icon: <Truck size={16} />, active: tab === 'fleet' },
    { key: 'trash', href: '/docs?tab=trash', label: t(locale, 'docs.tab.trash'), icon: <Trash2 size={16} />, active: tab === 'trash' },
  ]

  return (
    <main className="page">
      {/* С бумаги начинается груз, поэтому «Распознать Rate Con» — кнопка шапки, а не
          плитка, которая съедала полстроки над числами. */}
      <PageHeader
        title={t(locale, 'docs.title')}
        info={t(locale, 'docs.info')}
        subtitle={t(locale, SUBTITLE[tab])}
        actions={
          <Link
            href="/loads/new"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-haul-500 px-4 text-base font-semibold text-white shadow-[0_8px_24px_-10px_rgba(124,108,255,0.8)] transition-colors hover:bg-haul-400"
          >
            <ScanText size={17} strokeWidth={2.25} />
            {t(locale, 'docs.recognize.btn')}
          </Link>
        }
      />

      {/* Разделы — одним переключателем-сегментом: груз, трак, корзина. */}
      <SectionNav items={sections} label={t(locale, 'docs.title')} />

      {tab === 'loads' ? (
        <Loads companyId={companyId} locale={locale} query={q ?? ''} stage={stage ?? ''} money={canFinances} />
      ) : tab === 'fleet' ? (
        <Fleet companyId={companyId} locale={locale} />
      ) : (
        <Trash companyId={companyId} />
      )}
    </main>
  )
}

async function Loads({
  companyId,
  locale,
  query,
  stage,
  money,
}: {
  companyId: CompanyId
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

/** Бумаги по тракам и водителям: страховка, регистрация, чеки, фото и бумаги их грузов. */
async function Fleet({ companyId, locale }: { companyId: CompanyId; locale: Locale }) {
  const [rows, trucks] = await Promise.all([listDocsForLibrary(companyId), listTrucks(companyId)])
  const groups = trucks.map((tr) => ({ id: tr.id, label: tr.number ?? tr.name, driver: tr.driverName ?? '' }))
  // Все бумаги водителя под его траком — и свои (страховка, регистрация), и бумаги
  // его грузов (Rate Con, BOL, POD). Раньше грузовые отсюда вычёркивались, и у
  // водителя, у которого бумаги почти все грузовые, пропадала целая карточка
  // (26.09.2026: «у Juan больше всех документов, а его нет в списке»). Тип бумаги
  // фильтруется пилюлями, а строка грузовой бумаги показывает маршрут.
  const fleetRows = rows

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

async function Trash({ companyId }: { companyId: CompanyId }) {
  const trash = await listTrashedDocs(companyId)
  return (
    <div className="panel p-4">
      <DocTrash rows={trash} />
    </div>
  )
}
