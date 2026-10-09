import { NEW_TRUCK, TruckForm } from '@/components/truck-form'
import { BackButton } from '@/components/back-button'
import { PageHeader } from '@/components/page-header'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

export default async function Page() {
  const locale = await getLocale()
  return (
    // Ширина и шапка — общие для всех страниц (план «Порядок в TMS», 10/09/26).
    <main className="page">
      <BackButton href="/trucks" label={t(locale, 'trucks.page.title')} />
      <div className="mt-3">
        <PageHeader
          title={t(locale, 'trucks.new.title')}
          subtitle={<span className="block max-w-2xl">{t(locale, 'trucks.new.description')}</span>}
        />
      </div>
      <TruckForm id={null} initial={NEW_TRUCK} locale={locale} />
    </main>
  )
}
