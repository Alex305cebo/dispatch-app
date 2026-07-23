import { listTrucks } from '@/lib/loads'
import { ImportClient } from './import-client'
import { BackButton } from '@/components/back-button'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const trucks = await listTrucks(await companyScope())
  const locale = await getLocale()
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <BackButton href="/loads" label={t(locale, 'loads.page.title')} />
      <h1 className="mb-1 mt-3 text-[17px] font-semibold">
        Rate confirmation <span className="text-[13px] font-normal text-white/50">{t(locale, 'import.titleSuffix')}</span>
      </h1>
      <p className="mb-6 max-w-2xl text-[13px] leading-relaxed text-white/65">{t(locale, 'import.subtitle')}</p>
      <ImportClient trucks={trucks} />
    </main>
  )
}
