'use client'

// Любая ссылка на документ, открывающая его окном поверх страницы.
//
// Раньше каждое такое место вело на /view/[id] отдельной страницей: диспетчер уходил
// со своего экрана посмотреть бумагу и возвращался кнопкой «назад», теряя прокрутку,
// открытые секции и выбранную вкладку. Мест таких много — список документов груза и
// трака, чеки в обслуживании, инвойс, только что распознанный рейт-кон, — поэтому
// обёртка одна, а не по копии на каждое.
//
// Рендерит <button>, а не <a>: половина этих ссылок стоит внутри строк, которые сами
// являются ссылками, а вложенный <a> в <a> — невалидная разметка.

import { useState } from 'react'
import { DocModal } from '@/components/doc-modal'

export function DocLink({
  docId,
  className,
  title,
  children,
}: {
  docId: number
  className?: string
  title?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        title={title}
        onClick={(e) => {
          // Строка вокруг часто сама кликабельна (или это <summary>) — открытие
          // документа не должно заодно разворачивать/сворачивать её.
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        className={className}
      >
        {children}
      </button>
      {open && <DocModal docId={docId} onClose={() => setOpen(false)} />}
    </>
  )
}
