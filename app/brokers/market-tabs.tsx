// Вкладки раздела «Рынок»: брокеры со ставками и складами — и «Толлы». У толлов с
// 10/09/26 нет своего пункта меню (план «Порядок в TMS»): это инструмент того же рода,
// что «Куда отправить трак», — посчитать дорогу, а не вести работу. Адрес /tolls прежний.

import { Handshake, Milestone } from 'lucide-react'
import { SectionNav } from '@/app/docs/tab-nav'
import { t, type Locale } from '@/lib/i18n'

export function MarketTabs({ active, locale }: { active: 'brokers' | 'tolls'; locale: Locale }) {
  return (
    <SectionNav
      label={t(locale, 'nav.brokers')}
      items={[
        {
          key: 'brokers',
          href: '/brokers',
          label: t(locale, 'brokers.pageTitle'),
          icon: <Handshake size={16} />,
          active: active === 'brokers',
        },
        { key: 'tolls', href: '/tolls', label: t(locale, 'nav.tolls'), icon: <Milestone size={16} />, active: active === 'tolls' },
      ]}
    />
  )
}
