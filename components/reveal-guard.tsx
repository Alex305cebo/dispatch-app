'use client'

import { useEffect } from 'react'

/**
 * Страховка от застрявшего стриминга React (Next 15.5 / React canary).
 *
 * Отложенные Suspense-куски (секция карты, парк траков) приезжают в скрытые
 * <div id="S:n" hidden> в конце body, а на место их переносит колбек,
 * запланированный через requestAnimationFrame. Если первая пара очереди пришла,
 * пока вкладка была в фоне (телефон, свёрнутый на секунду во время загрузки),
 * показ так и не случается — страница живёт «без карты», наблюдалось вживую и
 * на проде: $RB держал 6 узлов, скрытые S:-блоки висели в конце body.
 *
 * Чинить чужую очередь руками нельзя (проверено: контент встаёт не туда и не
 * гидратируется). Надёжный выход один: заметить застревание — скрытые S:-блоки
 * всё ещё в body спустя пару секунд при видимой вкладке — и один раз тихо
 * перезагрузить страницу. Повторная загрузка в видимой вкладке проходит всегда.
 * Один раз за загрузку: если застряло по другой причине, не зацикливаемся.
 */
export function RevealGuard() {
  useEffect(() => {
    let reloaded = false
    const stuck = () =>
      document.querySelectorAll('body > div[hidden][id^="S:"]').length > 0
    const check = () => {
      if (reloaded || document.visibilityState !== 'visible') return
      if (!stuck()) {
        // Раскрылось нормально — амнистия: следующий сбой на этой странице
        // снова заслужит одну перезагрузку.
        try {
          sessionStorage.removeItem('reveal_reload')
        } catch {}
        return
      }
      // Дать родному rAF-показу целый кадр и ещё немного — вдруг он просто ещё
      // не успел. Застрял и после этого — перезагрузка.
      setTimeout(() => {
        if (reloaded || !stuck() || document.visibilityState !== 'visible') return
        try {
          if (sessionStorage.getItem('reveal_reload') === location.pathname) return
          sessionStorage.setItem('reveal_reload', location.pathname)
        } catch {
          /* приватный режим без sessionStorage — перезагрузим и так, но однажды */
        }
        reloaded = true
        location.reload()
      }, 700)
    }
    // Через 2.5 с после гидратации и при каждом возвращении на вкладку.
    const t = setTimeout(check, 2500)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearTimeout(t)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return null
}
