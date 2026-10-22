// Раздел «Аналитика» (10/22/26). Владелец прислал компонент analytics-bento с 21st.dev —
// четыре живые карточки-графика (components/ui/analytics-bento.tsx). Здесь они на
// НАСТОЯЩИХ грузах: выручка за 30 дней линией, пикапы и доставки по дням недели,
// выручка по штатам пикапа плитками, сезонность по месяцам. Сервер достаёт грузы,
// а считает браузер (lib/analytics-core.ts): кнопки периода, трака, брокера и цифры-ключи
// перерисовывают графики сразу, без запроса.
//
// Не дублирует «Сегодня» (что ждёт действия) и «Деньги» (кто сколько должен, недели
// водителей): тут картина за месяц и год. Закрыт тем же правом «Финансы», что и «Деньги».

import Link from 'next/link'
import { listLoads, listTrucks, loadPapers } from '@/lib/loads'
import { todayEt } from '@/lib/payments'
import { PageHeader } from '@/components/page-header'
import { AnalyticsView } from './view'
import { companyScope, getCurrentUser } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const user = await getCurrentUser()
  const locale = await getLocale()
  const title = t(locale, 'nav.analytics')
  if (!(await can(user, 'finances')))
    return (
      <main className="page">
        <PageHeader title={title} />
        <div className="panel p-5 text-base text-t2">
          {t(locale, 'money.noAccess')}{' '}
          <Link href="/" className="font-medium text-haul-300 hover:underline">
            {t(locale, 'nav.overview')} →
          </Link>
        </div>
      </main>
    )

  const companyId = await companyScope()
  const [loads, trucks, { rateCons }] = await Promise.all([listLoads(companyId), listTrucks(companyId), loadPapers(companyId)])
  return <AnalyticsView loads={loads} trucks={trucks} today={todayEt()} locale={locale} title={title} rateCons={[...rateCons]} />
}
