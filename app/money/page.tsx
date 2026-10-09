// Раздел «Деньги» — своим пунктом меню с 10/09/26. До этого он был первой вкладкой
// «Документов», и раздел бумаг открывался на деньгах: искали файл — попадали в отчёты.
//
// Вкладки и их содержимое прежние (app/docs/finance-tabs.tsx, app/docs/drivers-tab.tsx):
// сначала работа недели (водители, недели, диспетчеры), потом кто сколько должен и что
// уже пришло. Старые адреса /docs?tab=drivers|weeks|… и /invoices?tab=… переводит сюда
// next.config.ts (redirects).
//
// Весь раздел закрыт правом «Финансы». Без него — короткая записка со ссылкой на
// «Документы», а не redirect(): тот уходит потоком, и роутер Next при первом открытии
// падал с React #310 (см. next.config.ts).

import Link from 'next/link'
import { rateConByLoad } from '@/lib/loads'
import { ByDispatcher, ByWeek, Paid, Unpaid } from '@/app/docs/finance-tabs'
import { ByDriver } from '@/app/docs/drivers-tab'
import { ChipNav, type NavItem } from '@/app/docs/tab-nav'
import { PageHeader } from '@/components/page-header'
import { companyScope, getCurrentUser } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import { getLocale } from '@/lib/i18n-server'
import { t, type Locale, type MsgKey } from '@/lib/i18n'
import type { CompanyId } from '@/lib/company'
import { isMoneyTab, type MoneyTab } from '@/lib/money-tabs'

export const dynamic = 'force-dynamic'

const SUBTITLE: Record<MoneyTab, MsgKey> = {
  unpaid: 'finances.tabDesc.unpaid',
  paid: 'finances.tabDesc.paid',
  weeks: 'finances.tabDesc.weeks',
  dispatchers: 'finances.tabDesc.dispatchers',
  drivers: 'finances.tabDesc.drivers',
}

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string; week?: string }> }) {
  const { tab: tabParam, week } = await searchParams
  const user = await getCurrentUser()
  const locale = await getLocale()
  if (!(await can(user, 'finances')))
    return (
      <main className="page">
        <PageHeader title={t(locale, 'nav.money')} />
        <div className="panel p-5 text-base text-t2">
          {t(locale, 'money.noAccess')}{' '}
          <Link href="/docs" className="font-medium text-haul-300 hover:underline">
            {t(locale, 'nav.docs')} →
          </Link>
        </div>
      </main>
    )
  // «По диспетчерам» — своё право (по умолчанию включено): заработок ВСЕХ диспетчеров.
  const canReport = await can(user, 'dispatcher_report')
  const companyId = await companyScope()

  // Без вкладки — неделя водителей: «это должно быть главным» (владелец, 29.09.2026).
  const picked: MoneyTab = isMoneyTab(tabParam) ? tabParam : 'drivers'
  const tab: MoneyTab = picked === 'dispatchers' && !canReport ? 'drivers' : picked

  const tabs: NavItem[] = [
    { key: 'drivers', href: '/money?tab=drivers', label: t(locale, 'finances.tab.drivers'), active: tab === 'drivers' },
    { key: 'weeks', href: '/money?tab=weeks', label: t(locale, 'finances.tab.weeks'), active: tab === 'weeks' },
    ...(canReport
      ? [{ key: 'dispatchers', href: '/money?tab=dispatchers', label: t(locale, 'finances.tab.dispatchers'), active: tab === 'dispatchers' }]
      : []),
    { key: 'unpaid', href: '/money?tab=unpaid', label: t(locale, 'finances.tab.unpaid'), active: tab === 'unpaid' },
    { key: 'paid', href: '/money?tab=paid', label: t(locale, 'finances.tab.paid'), active: tab === 'paid' },
  ]

  return (
    <main className="page">
      <PageHeader title={t(locale, 'nav.money')} subtitle={t(locale, SUBTITLE[tab])} />
      <ChipNav items={tabs} className="mb-5" />
      <Money tab={tab} companyId={companyId} locale={locale} week={week} />
    </main>
  )
}

async function Money({ tab, companyId, locale, week }: { tab: MoneyTab; companyId: CompanyId; locale: Locale; week?: string }) {
  switch (tab) {
    case 'unpaid':
      return <Unpaid companyId={companyId} rateCons={await rateConByLoad(companyId)} locale={locale} />
    case 'paid':
      return <Paid companyId={companyId} rateCons={await rateConByLoad(companyId)} locale={locale} />
    case 'weeks':
      return <ByWeek companyId={companyId} locale={locale} />
    case 'dispatchers':
      return <ByDispatcher companyId={companyId} locale={locale} week={week} />
    case 'drivers':
      return <ByDriver companyId={companyId} locale={locale} week={week} />
  }
}
