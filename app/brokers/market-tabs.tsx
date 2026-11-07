// Вкладки раздела «Рынок» (11/07/26): «Ставки» — куда отправить трак по рынку DAT — и
// «Толлы». Справочник брокеров и складов больше не здесь: он стал своим разделом
// «Брокеры» (группа «База»): планирование и контакты — разные задачи. Адрес /tolls
// прежний, план живёт на /market.

import { BarChart3, Milestone } from 'lucide-react'
import { SectionNav } from '@/app/docs/tab-nav'
import { t, type Locale } from '@/lib/i18n'

export function MarketTabs({ active, locale }: { active: 'rates' | 'tolls'; locale: Locale }) {
  return (
    <SectionNav
      label={t(locale, 'nav.market')}
      items={[
        {
          key: 'rates',
          href: '/market',
          label: t(locale, 'market.tab.rates'),
          icon: <BarChart3 size={16} />,
          active: active === 'rates',
        },
        { key: 'tolls', href: '/tolls', label: t(locale, 'nav.tolls'), icon: <Milestone size={16} />, active: active === 'tolls' },
      ]}
    />
  )
}
