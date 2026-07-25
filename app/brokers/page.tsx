import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { listOurBrokers } from '@/lib/brokers'
import { TOP_BROKERS } from '@/lib/brokers-top'
import { BrokersClient } from './brokers-client'

export const dynamic = 'force-dynamic'

export default async function BrokersPage() {
  const companyId = await companyScope()
  const locale = await getLocale()
  const ourBrokers = await listOurBrokers(companyId)

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <h1 className="text-xl font-bold tracking-tight">{t(locale, 'brokers.pageTitle')}</h1>
      <p className="mb-6 text-[13px] text-white/65">{t(locale, 'brokers.pageSubtitle')}</p>
      <BrokersClient ourBrokers={ourBrokers} topBrokers={TOP_BROKERS} />
    </main>
  )
}
