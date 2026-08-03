import { CardClient } from './card-client'
import { BackButton } from '@/components/back-button'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

// Read-only card for a load that arrived from the Telegram bot: everything the
// dispatcher needs on one screen — analysis, route map, the driver text and the
// broker email. The load itself lives in the URL hash and never reaches us, so
// this shell is static and the client component does the reading.
export default async function Page() {
  const locale = await getLocale()
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <BackButton href="/loads" label={t(locale, 'loads.page.title')} />
      <h1 className="mb-1 mt-3 text-xl font-bold tracking-tight">{t(locale, 'loadCard.title')}</h1>
      <p className="mb-6 text-[13px] text-white/65">{t(locale, 'loadCard.subtitle')}</p>
      <CardClient />
    </main>
  )
}
