import { listTrucks } from '@/lib/loads'
import { truckMetas } from '@/lib/maintenance'
import { QrClient } from './qr-client'
import { BackButton } from '@/components/back-button'
import { PageHeader } from '@/components/page-header'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

// Reads the DB — without this it prerenders at build time and serves that snapshot forever.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const companyId = await companyScope()
  const [trucks, metas] = await Promise.all([listTrucks(companyId), truckMetas(companyId)])
  const locale = await getLocale()
  return (
    // Ширина и шапка — общие для всех страниц (план «Порядок в TMS», 10/09/26).
    <main className="page">
      <BackButton href="/loads" label={t(locale, 'loads.page.title')} />
      <div className="mt-3">
        <PageHeader title={t(locale, 'loadQr.title')} subtitle={t(locale, 'loadQr.subtitle')} />
      </div>
      <QrClient trucks={trucks} metaByTruck={Object.fromEntries(metas)} />
    </main>
  )
}
