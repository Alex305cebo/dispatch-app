'use server'

import { revalidatePath } from 'next/cache'
import { confirmLogin, disconnectTelegram, startLogin, tgSend } from '@/lib/telegram'
import { intakeDriverMedia, remindMissingPods } from '@/lib/tg-intake'

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function tgStartLogin(
  apiId: string,
  apiHash: string,
  phone: string,
): Promise<{ token: string; deliveryHint: string } | { error: string }> {
  const id = Number(apiId.trim())
  if (!id || !apiHash.trim() || !phone.trim())
    return { error: 'Нужны api_id, api_hash и телефон.' }
  try {
    return await startLogin(id, apiHash.trim(), phone.trim())
  } catch (e) {
    return { error: `Не отправился код: ${msg(e)}` }
  }
}

export async function tgConfirmLogin(
  token: string,
  code: string,
  password?: string,
): Promise<{ ok: true } | { need2fa: true } | { error: string }> {
  try {
    const res = await confirmLogin(token, code.trim(), password || undefined)
    if ('ok' in res) revalidatePath('/telegram')
    return res
  } catch (e) {
    return { error: `Вход не удался: ${msg(e)}` }
  }
}

/** Manual trigger for the same work /api/tg-poll does on a schedule — lets the
 * dispatcher pull in a driver's photos right after connecting, without waiting on
 * the external cron ping to be set up. */
export async function tgCheckNow(): Promise<
  { attached: number; skipped: number; nudged: number } | { error: string }
> {
  const [intake, reminders] = await Promise.all([intakeDriverMedia(), remindMissingPods()])
  if ('error' in intake) return { error: intake.error }
  if ('error' in reminders) return { error: reminders.error }
  revalidatePath('/telegram')
  revalidatePath('/loads')
  return { attached: intake.attached, skipped: intake.skipped, nudged: reminders.nudged }
}

/** Wrong account connected — drop the session so the connect form comes back up. */
export async function tgDisconnectAccount(): Promise<void> {
  await disconnectTelegram()
  revalidatePath('/telegram')
}

export async function tgSendMessage(
  chatId: string,
  text: string,
): Promise<{ error: string } | void> {
  if (!text.trim()) return { error: 'Пустое сообщение.' }
  try {
    await tgSend(chatId, text.trim())
    revalidatePath('/telegram')
  } catch (e) {
    return { error: `Не отправилось: ${msg(e)}` }
  }
}
