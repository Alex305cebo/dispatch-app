'use client'

// A quiet, no-frills GPS refresh for spots that don't need RefreshFleetButton's full
// "live"/auto-poll treatment (that one polls every 30s on its own — fine for the one
// /tracking page, too much GPS-vendor traffic to repeat on every truck page opened).

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { refreshFleetStatus } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

/** Общий вид кнопки обновления карты — здесь и у RefreshFleetButton на /tracking.
 *
 * Была голая иконка ↻ на прозрачном фоне: диспетчер её не находил и перезагружал
 * страницу целиком. Теперь заливка, подпись словом и рабочий размер — карта без
 * кнопки обновления показывает вчерашнюю позицию, и цена ненайденной кнопки выше,
 * чем цена лишнего пятна в шапке.
 *
 * Одна строка на оба места намеренно: две кнопки с одним смыслом и разным видом —
 * это ровно то, из-за чего одну из них перестают замечать. */
export const REFRESH_BTN =
  'flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.07] px-2.5 py-1 text-[11px] font-semibold normal-case text-white/85 transition-colors hover:border-white/30 hover:bg-white/[0.12] hover:text-white disabled:opacity-50'

export function SmallRefreshButton({
  /** Только перечитать страницу, БЕЗ опроса GPS-провайдера. Для публичной ссылки
   * /track/[id]: она открыта без логина, и дать оттуда кнопку, опрашивающую весь парк,
   * значит отдать постороннему расход нашего лимита у вендора. Позицию всё равно
   * обновляет автоопрос из приложения — здесь показываем свежайшее, что уже в базе. */
  local = false,
}: { local?: boolean } = {}) {
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()

  function refresh(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    start(async () => {
      if (local) return router.refresh()
      const res = await refreshFleetStatus()
      if (res.errors.length) notify('warn', res.errors.join(' · '))
      else
        notify(
          'ok',
          res.updated > 0
            ? `${t(locale, 'tracking.updatedTrucksPrefix')}${res.updated}`
            : t(locale, 'tracking.noNewData'),
        )
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={refresh}
      title={t(locale, 'tracking.refreshGpsTitle')}
      className={REFRESH_BTN}
    >
      <span className={pending ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
      {pending ? t(locale, 'tracking.updating') : t(locale, 'tracking.refresh')}
    </button>
  )
}
