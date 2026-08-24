// Почему ИИ не ответил — словами, а не кодом HTTP.
//
// На экран приходило «Не распознался: gemini-3-flash-preview: HTTP 429», и по этой
// строке нельзя сделать ровно ничего: непонятно, сломалось приложение, кончился
// бесплатный лимит или ключ вообще отозвали. Три разные беды с тремя разными
// действиями выглядели одинаково.

import { t, type Locale } from './i18n.ts'

export type AiFail =
  /** Кончился бесплатный дневной лимит модели. Лечится временем или платным ключом. */
  | 'quota'
  /** Google отозвал ключ — обычно потому, что он утёк в публичный доступ. */
  | 'revoked'
  /** Ключа нет либо он неверный. */
  | 'badkey'
  /** Модель перегружена или временно недоступна. Помогает просто повтор. */
  | 'busy'
  | 'other'

/** Разбирает ответ Google. Тело нужно, потому что 403 бывает и «ключ отозван», и
 * «этой модели нет доступа» — разные беды с одинаковым кодом. */
export function aiFailKind(status: number, body?: string): AiFail {
  const b = (body ?? '').toLowerCase()
  if (status === 429) return 'quota'
  if (status === 403) return b.includes('leak') || b.includes('revok') ? 'revoked' : 'badkey'
  if (status === 400 && b.includes('api key')) return 'badkey'
  if (status === 401) return 'badkey'
  if (status === 503 || status === 500 || status === 502) return 'busy'
  return 'other'
}

/** Одна строка для диспетчера: что случилось и что делать. */
export function aiFailMessage(kind: AiFail, locale: Locale, detail?: string): string {
  switch (kind) {
    case 'quota':
      return t(locale, 'ai.err.quota')
    case 'revoked':
      return t(locale, 'ai.err.revoked')
    case 'badkey':
      return t(locale, 'ai.err.badkey')
    case 'busy':
      return t(locale, 'ai.err.busy')
    default:
      return detail ? `${t(locale, 'ai.err.other')} (${detail})` : t(locale, 'ai.err.other')
  }
}

/** Из нескольких неудач подряд выбирается самая объясняющая: отозванный ключ важнее
 * исчерпанной квоты, квота важнее «модель занята». Иначе в сообщение попадала беда
 * последней модели в списке, а не та, из-за которой всё встало. */
const RANK: Record<AiFail, number> = { revoked: 4, badkey: 3, quota: 2, busy: 1, other: 0 }

export function worstFail(a: AiFail | null, b: AiFail): AiFail {
  if (!a) return b
  return RANK[b] > RANK[a] ? b : a
}
