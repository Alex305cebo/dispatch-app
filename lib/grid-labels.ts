// Подписи переставляемой сетки, собранные на сервере.
//
// Сетка — клиентский компонент, а функцию перевода в клиентский компонент со
// страницы-сервера передать нельзя: Next отвечает «Functions cannot be passed
// directly to Client Components» прямо в браузер, и страница не открывается вовсе.
// Поэтому страницы зовут это и передают готовые строки.

import { t, type Locale } from './i18n.ts'
import type { TileSize } from './tiles-core.ts'

export type GridLabels = {
  rearrange: string
  done: string
  reset: string
  hintTouch: string
  hintPointer: string
  shared: string
  size: string
  sizeNames: Record<TileSize, string>
  saveFailed: string
  /** Что говорим, когда кнопку нажали, а перестановка выключена в настройках. */
  locked: string
}

export function gridLabels(locale: Locale): GridLabels {
  return {
    rearrange: t(locale, 'grid.rearrange'),
    done: t(locale, 'grid.done'),
    reset: t(locale, 'grid.reset'),
    hintTouch: t(locale, 'grid.hintTouch'),
    hintPointer: t(locale, 'grid.hintPointer'),
    shared: t(locale, 'grid.shared'),
    size: t(locale, 'grid.size'),
    sizeNames: {
      s: t(locale, 'grid.size.s'),
      w: t(locale, 'grid.size.w'),
      l: t(locale, 'grid.size.l'),
    },
    saveFailed: t(locale, 'grid.saveFailed'),
    locked: t(locale, 'grid.locked'),
  }
}
