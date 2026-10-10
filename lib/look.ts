// Вид приложения: тема, цвет акцента и карточки. Три атрибута на <html> —
// data-theme / data-accent / data-surface; цвета по ним перекрашивает app/globals.css,
// компонентам делать ничего не надо. Выбирают кнопкой «Вид» в ряду аккаунта
// (components/look-picker.tsx), выбор лежит в localStorage этого браузера.
//
// По умолчанию — как на образце SmartHop, который прислал владелец 10/10/26 («наш TMS
// должен выглядеть примерно так же»): светлая, оранжевая, плоские белые карточки.
// Прежнее «Жидкое стекло» (19.09.2026) — те же кнопки: «Фиолетовый» и «Стекло».

export const ACCENTS = ['orange', 'violet', 'blue'] as const
export type Accent = (typeof ACCENTS)[number]

export type Theme = 'light' | 'dark'
export type Surface = 'flat' | 'glass'
export type Look = { theme: Theme; accent: Accent; surface: Surface }

export const DEFAULT_LOOK: Look = { theme: 'light', accent: 'orange', surface: 'flat' }

export const isAccent = (v: unknown): v is Accent => (ACCENTS as readonly unknown[]).includes(v)

/** Вид из атрибутов <html> (их уже поставил LOOK_INIT) — с подстановкой умолчаний. */
export function lookOf(d: DOMStringMap): Look {
  return {
    theme: d.theme === 'dark' ? 'dark' : 'light',
    accent: isAccent(d.accent) ? d.accent : DEFAULT_LOOK.accent,
    surface: d.surface === 'glass' ? 'glass' : 'flat',
  }
}

/** Скрипт в <head>: ставит все три атрибута до первой отрисовки, чтобы страница не
 *  мигнула чужими цветами. Без сохранённого выбора — DEFAULT_LOOK. Приватный режим, где
 *  localStorage бросает исключение, — тоже умолчания. */
export const LOOK_INIT = `(function(){var d=document.documentElement.dataset;function g(k){try{return localStorage.getItem(k)}catch(e){return null}}var t=g('theme'),a=g('accent'),s=g('surface');d.theme=t==='dark'?'dark':'light';d.accent=${JSON.stringify(ACCENTS)}.indexOf(a)>=0?a:'${DEFAULT_LOOK.accent}';d.surface=s==='glass'?'glass':'flat'})()`
