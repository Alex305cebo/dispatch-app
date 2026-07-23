import { listTrucks } from '@/lib/loads'
import { QrClient } from './qr-client'
import { BackButton } from '@/components/back-button'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

// Reads the DB — without this it prerenders at build time and serves that snapshot forever.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const trucks = await listTrucks(await companyScope())
  const locale = await getLocale()
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <BackButton href="/loads" label={t(locale, 'loads.page.title')} />
      <h1 className="mb-1 mt-3 text-[17px] font-semibold">{t(locale, 'loadQr.title')}</h1>
      <p className="mb-6 text-[13px] text-white/65">{t(locale, 'loadQr.subtitle')}</p>
      <QrClient trucks={trucks} />
    </main>
  )
}
