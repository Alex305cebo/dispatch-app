import { NEW_TRUCK, TruckForm } from '@/components/truck-form'
import { BackButton } from '@/components/back-button'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

export default async function Page() {
  const locale = await getLocale()
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <BackButton href="/trucks" label={t(locale, 'trucks.page.title')} />
      <h1 className="mb-1 mt-2 text-xl font-bold tracking-tight">{t(locale, 'trucks.new.title')}</h1>
      <p className="mb-6 max-w-2xl text-[13px] leading-relaxed text-white/65">
        {t(locale, 'trucks.new.description')}
      </p>
      <TruckForm id={null} initial={NEW_TRUCK} locale={locale} />
    </main>
  )
}
