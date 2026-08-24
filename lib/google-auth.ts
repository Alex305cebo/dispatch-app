// Вход через аккаунт Google.
//
// Кнопку рисует сам Google (Google Identity Services), браузер получает от него
// подписанный ID-токен и отдаёт его сюда. Мы токен проверяем и по email находим
// человека среди своих пользователей.
//
// Почему ID-токен, а не обычный OAuth с обменом кода: тому нужен client secret,
// то есть ещё один секрет на каждой установке. Здесь наружу уходит только
// client_id — он не тайна и лежит в HTML любого сайта с такой кнопкой.

import 'server-only'

export type GoogleUser = { sub: string; email: string; name: string }

/**
 * Проверка токена — запросом к самому Google (oauth2/v3/tokeninfo).
 *
 * ponytail: проверка на его стороне, а не своя сверка подписи по JWKS. Своя — это
 * ~60 строк с RS256 и кэшем ключей ради экономии одного HTTPS-запроса на вход;
 * входов у нас единицы в день. Потолок известен: если Google будет отвечать
 * медленно или ограничит частоту, тогда и переезжаем на локальную проверку.
 *
 * Что обязательно сверяется здесь, а не «на глаз»:
 * • aud — токен выписан ИМЕННО нашему приложению. Без этой проверки годился бы
 *   любой токен Google от любого сайта, и вход стал бы открытым для всех.
 * • email_verified — Google подтвердил владение адресом. Наши права привязаны к
 *   email, и неподтверждённый пустил бы чужого человека в чужую компанию.
 */
export async function verifyGoogleToken(idToken: string, clientId: string): Promise<GoogleUser | null> {
  if (!idToken || !clientId) return null
  try {
    const res = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const d = (await res.json()) as {
      aud?: string
      sub?: string
      email?: string
      email_verified?: string | boolean
      name?: string
      iss?: string
      exp?: string
    }
    if (d.aud !== clientId) return null
    if (d.iss !== 'accounts.google.com' && d.iss !== 'https://accounts.google.com') return null
    if (String(d.email_verified) !== 'true') return null
    if (!d.email || !d.sub) return null
    // tokeninfo не отдаёт просроченные токены, но перепроверяем: цена — одно сравнение.
    if (d.exp && Number(d.exp) * 1000 < Date.now()) return null
    return { sub: d.sub, email: d.email.toLowerCase(), name: (d.name ?? d.email).trim() }
  } catch {
    return null
  }
}

/** Client ID установки. Пусто — кнопки Google на входе просто нет, и всё работает
 * по-старому: пароль. Читается на сервере и передаётся в форму пропом, а не через
 * NEXT_PUBLIC_*: те вшиваются в момент сборки, и смена настройки требовала бы
 * пересборки вместо перезапуска. */
export function googleClientId(): string {
  return (process.env.GOOGLE_CLIENT_ID ?? '').trim()
}
