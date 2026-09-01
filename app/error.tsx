'use client'

// Что видит человек, когда страница всё-таки упала.
//
// Без этого файла Next показывает свой полноэкранный экран ошибки: чёрный фон,
// английский текст и ни одной кнопки — приложение выглядит сломанным целиком, хотя
// не работает одна страница. Диспетчер в этот момент теряет и меню, и путь назад.
//
// Здесь остаётся вся обвязка приложения (этот экран рисуется ВНУТРИ макета, меню на
// месте), сказано человеческим языком, что случилось, и есть две кнопки: повторить и
// вернуться на обзор. Повтор — это reset() из Next: он пересобирает ту же страницу,
// и большинство сбоев из-за чужой службы лечится именно им.

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/button'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { logClientError } from '@/app/actions'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const locale = useLocale()

  useEffect(() => {
    // В консоль — с меткой digest: по ней ошибку видно в логах сервера, а без неё
    // сообщение на боевом сервере скрыто (Next намеренно не отдаёт текст наружу).
    console.error('page error', error.digest ?? '', error)
    // И на сервер: логов хостинга у нас нет, а без записи «стало чаще ломаться»
    // остаётся ощущением, которое не проверить. Пишем путь, текст и digest.
    void logClientError({
      path: typeof location !== 'undefined' ? location.pathname : '',
      message: error.message || String(error),
      digest: error.digest,
      agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    })
  }, [error])

  return (
    <main className="mx-auto max-w-2xl px-4 pb-20 pt-10 sm:px-6">
      <section className="panel p-6">
        <h1 className="text-[17px] font-bold">{t(locale, 'error.heading')}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-white/70">{t(locale, 'error.body')}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => reset()}>
            {t(locale, 'error.retry')}
          </Button>
          <Link
            href="/"
            className="rounded-xl border border-white/10 px-4 py-2 text-[13px] font-semibold text-white/80 transition-colors hover:bg-white/5"
          >
            {t(locale, 'error.toOverview')}
          </Link>
        </div>

        {/* Метка нужна, только если придётся искать след в логах — поэтому мелким и
            последней строкой, а не первым, что бросается в глаза. */}
        {error.digest && (
          <p className="nums mt-4 text-[11px] text-white/35">
            {t(locale, 'error.code')} {error.digest}
          </p>
        )}
      </section>
    </main>
  )
}
