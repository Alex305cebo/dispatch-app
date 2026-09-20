'use server'

import { hashPassword, normalizeRecoveryCode } from '@/lib/auth'
import { getCurrentUser } from '@/lib/session'
import { sql } from '@/lib/db'
import { setSetting } from '@/lib/settings'
import { TILE_PATHS, TILES_ENABLED_KEY } from '@/lib/tiles-core'
import { revalidatePath } from 'next/cache'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

/** Self-service — any signed-in user changes their own password, no admin needed. */
export async function changeMyPassword(newPassword: string): Promise<{ error: string } | void> {
  const user = await getCurrentUser()
  const locale = await getLocale()
  if (!user) return { error: t(locale, 'admin.err.notAuthorized') }
  // The demo account is SHARED by every visitor, and resetDemoData() rebuilds loads,
  // trucks and documents but deliberately never touches `users` — so a password set
  // here was the one demo change that survived forever, on a row everybody uses. The
  // banner promises nothing persists; this is the only action that broke that promise.
  if (user.isDemo) return { error: t(locale, 'admin.err.demoReadOnly') }
  if (newPassword.length < 8) return { error: t(locale, 'admin.err.passwordMin8') }
  await sql`UPDATE users SET password_hash = ${await hashPassword(newPassword)} WHERE id = ${user.id}`
}

/** Дата рождения для «Забыли пароль?» — задать или поменять. Хранится только
 * хешем, как пароль: прочитать её из базы потом нельзя, лишь заменить. Нужна
 * прежде всего аккаунтам, созданным до того, как дата появилась в регистрации. */
export async function setRecoveryBirthday(birthday: string): Promise<{ error: string } | void> {
  const user = await getCurrentUser()
  const locale = await getLocale()
  if (!user) return { error: t(locale, 'admin.err.notAuthorized') }
  if (user.isDemo) return { error: t(locale, 'admin.err.demoReadOnly') }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return { error: t(locale, 'login.error.badBirthday') }
  await sql`UPDATE users SET recovery_hash = ${await hashPassword(normalizeRecoveryCode(birthday))} WHERE id = ${user.id}`
}

/** Перестановка плиток: разрешено ли вообще двигать блоки по разделам.
 *
 * Здесь, а не в панели администратора: владелец сказал «сделай для всех, не только
 * для админов». Сам порядок плиток при этом общий на всю компанию — кто переставил,
 * увидели все, — поэтому выключатель и его подпись про это говорят.
 *
 * По умолчанию выключено: ключа в базе нет, пока его не поставят отсюда. */
export async function setTilesRearrange(enabled: boolean): Promise<{ error: string } | void> {
  const user = await getCurrentUser()
  const locale = await getLocale()
  if (!user) return { error: t(locale, 'admin.err.notAuthorized') }
  // В демо общий аккаунт на всех посетителей: настройка компании оттуда не меняется.
  if (user.isDemo) return { error: t(locale, 'admin.err.demoReadOnly') }
  await setSetting(TILES_ENABLED_KEY, enabled ? '1' : '0')
  // Кнопка «Переставить» отпирается и запирается сразу на всех разделах, а не после
  // захода заново. Меню аккаунта живёт в общем макете, поэтому и его обновляем.
  revalidatePath('/', 'layout')
  for (const path of new Set(Object.values(TILE_PATHS))) {
    if (path.includes('[')) revalidatePath(path, 'page')
    else revalidatePath(path)
  }
}
