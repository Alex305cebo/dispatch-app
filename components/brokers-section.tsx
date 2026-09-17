import { Tab } from '@/components/tab-link'
import { t, type Locale } from '@/lib/i18n'

/**
 * «Брокеры» и «Склады» — один раздел меню (решение пользователя 16.09.2026): общий заголовок
 * и вкладки. Адреса /brokers и /facilities прежние — ссылка «Мы здесь уже были» из карточки
 * груза и закладки диспетчеров не ломаются.
 */
export function BrokersSection({ active, locale }: { active: 'brokers' | 'facilities'; locale: Locale }) {
  return (
    <>
      <h1 className="text-xl font-bold tracking-tight">{t(locale, 'nav.brokers')}</h1>
      <div className="mb-3 mt-2 flex flex-wrap gap-1.5 border-b border-white/8">
        <Tab href="/brokers" active={active === 'brokers'}>
          {t(locale, 'brokers.pageTitle')}
        </Tab>
        <Tab href="/facilities" active={active === 'facilities'}>
          {t(locale, 'facilities.title')}
        </Tab>
      </div>
    </>
  )
}
