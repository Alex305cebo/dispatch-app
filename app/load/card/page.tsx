import { CardClient } from './card-client'
import { BackButton } from '@/components/back-button'
import { PageHeader } from '@/components/page-header'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

// Read-only card for a load that arrived from the Telegram bot: everything the
// dispatcher needs on one screen — analysis, route map, the driver text and the
// broker email. The load itself lives in the URL hash and never reaches us, so
// this shell is static and the client component does the reading.
export default async function Page() {
  const locale = await getLocale()
  return (
    // Ширина и шапка — общие для всех страниц (план «Порядок в TMS», 10/09/26).
    <main className="page">
      <BackButton href="/loads" label={t(locale, 'loads.page.title')} />
      <div className="mt-3">
        <PageHeader title={t(locale, 'loadCard.title')} subtitle={t(locale, 'loadCard.subtitle')} />
      </div>
      <CardClient />
    </main>
  )
}
