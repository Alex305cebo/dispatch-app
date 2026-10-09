'use client'

// Низ карточки трака — вкладками «Грузы | Документы | Обслуживание» (план «Порядок в
// TMS», 10/09/26). До этого грузы и бумаги стояли рядом, а под ними — обслуживание,
// ремонты и экономика трака на два экрана вниз.
//
// Все три вкладки приходят с сервера готовыми и остаются в странице (скрыты, а не
// выброшены): начатая запись в «Нужно починить» не теряется при переходе на «Грузы».
// Ссылки «#care» (колокольчик, «Сегодня», плашка ремонтов) открывают «Обслуживание».

import { useEffect, useState, type ReactNode } from 'react'
import { FileText, Package, Wrench } from 'lucide-react'
import { Segmented } from './segmented'

type Tab = 'loads' | 'docs' | 'care'

const DOT = { bad: 'bg-bad-400', warn: 'bg-warn-400' } as const
// Как у вида «Грузов»: на телефоне значок над подписью, на компьютере — рядом.
const ICON = { size: 17, strokeWidth: 2.25 }

export function TruckTabs({
  loads,
  docs,
  care,
  labels,
  careTone,
  label,
}: {
  loads: ReactNode
  docs: ReactNode
  care: ReactNode
  labels: Record<Tab, string>
  /** Что-то в обслуживании горит: масло, срок документа, ремонт. Точка у вкладки. */
  careTone: 'bad' | 'warn' | null
  label: string
}) {
  const [tab, setTab] = useState<Tab>('loads')

  useEffect(() => {
    const sync = () => {
      if (window.location.hash === '#care') setTab('care')
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const pick = (next: Tab) => {
    setTab(next)
    // Ушли с «Обслуживания» — «#care» из адреса убираем, иначе повторное нажатие на
    // плашку ремонтов не сменит адрес и вкладку не откроет.
    if (next !== 'care' && window.location.hash === '#care')
      history.replaceState(null, '', window.location.pathname + window.location.search)
  }

  return (
    <div id="care" className="flex scroll-mt-4 flex-col gap-2.5">
      <Segmented
        label={label}
        value={tab}
        onChange={pick}
        items={[
          { key: 'loads', label: labels.loads, icon: <Package {...ICON} /> },
          { key: 'docs', label: labels.docs, icon: <FileText {...ICON} /> },
          {
            key: 'care',
            label: labels.care,
            // Горит что-то — точка на ключе, как счётчик на колокольчике.
            icon: (
              <span className="relative inline-flex">
                <Wrench {...ICON} />
                {careTone && <span aria-hidden className={`absolute -top-1 -right-1.5 size-2.5 rounded-full ${DOT[careTone]}`} />}
              </span>
            ),
          },
        ]}
      />
      <div hidden={tab !== 'loads'}>{loads}</div>
      <div hidden={tab !== 'docs'}>{docs}</div>
      <div hidden={tab !== 'care'}>{care}</div>
    </div>
  )
}
