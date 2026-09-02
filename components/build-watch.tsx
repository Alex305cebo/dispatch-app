'use client'

import { useEffect } from 'react'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

/**
 * Сторож устаревшей вкладки.
 *
 * После каждого деплоя у сервер-экшенов новые идентификаторы. Вкладка, открытая
 * до деплоя, на любое действие — загрузить документ, сохранить груз — получает
 * «404 Server action not found», а видит это как «An unexpected response was
 * received from the server». В день с десятью деплоями это выглядело как
 * «постоянно проблемы с загрузкой документов», хотя сломана была не загрузка,
 * а сама вкладка — до первого Ctrl+F5.
 *
 * Метка сборки вшивается в клиентский код при сборке (BUILD_STAMP в next.config);
 * та же метка живёт в /api/health. Разошлись — значит на сервере новая версия.
 * Если человек ничего не печатает — перезагружаем сразу, набранное терять нечего;
 * если печатает — говорим и ждём момента, когда вкладку снова откроют.
 */
const EVERY_MS = 60_000

/** Метку сборки передаёт СЕРВЕРНЫЙ layout пропом: в клиентский чанк
 * process.env.BUILD_STAMP не вшивается (проверено на боевой сборке — в чанке
 * её не было, и сторож был слеп). На сервере переменная есть всегда. */
export function BuildWatch({ mine }: { mine: string }) {
  const locale = useLocale()
  useEffect(() => {
    const MINE = mine
    if (!MINE) return
    let stale = false
    let told = false
    const typing = () => {
      const el = document.activeElement
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)
    }
    const act = () => {
      if (!stale) return
      if (!typing()) {
        location.reload()
        return
      }
      if (!told) {
        told = true
        notify('warn', t(locale, 'common.staleBuild'))
      }
    }
    const check = async () => {
      if (document.visibilityState !== 'visible' || stale) return
      try {
        const r = await fetch('/api/health', { cache: 'no-store' })
        const j = (await r.json()) as { build?: string | null }
        if (j.build && j.build !== MINE) {
          stale = true
          act()
        }
      } catch {
        /* сеть моргнула — проверим в следующий раз */
      }
    }
    const id = setInterval(check, EVERY_MS)
    // Вернулись на вкладку — самый естественный момент перезагрузиться.
    const onVis = () => {
      if (document.visibilityState === 'visible') void check().then(act)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [locale, mine])
  return null
}

/** Так выглядит устаревшая вкладка изнутри любого catch — подменяем на человеческое. */
export function staleBuildMessage(msg: string, locale: Parameters<typeof t>[0]): string {
  return /unexpected response|Server action not found|Failed to find Server Action/i.test(msg)
    ? t(locale, 'common.staleBuild')
    : msg
}
