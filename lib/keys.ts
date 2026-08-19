// Where the third-party API keys come from.
//
// The app is sold and installed per customer, so a key baked into OUR environment is
// the wrong default: it would sit in a panel the customer controls and can read, and
// Google's free quota is counted per project, meaning one customer's morning rate cons
// would exhaust another customer's day. Each install therefore uses ITS OWN key, and
// the admin pastes it in the app — the same shape the Telegram credentials already use
// (lib/telegram.ts writes tg_api_id/tg_api_hash into `settings`).
//
// Order is settings row → environment variable, deliberately. The customer's own key
// wins; the env var stays as an escape hatch for our own install and for local dev
// without touching the database.
//
// Paying more needs no code: the key belongs to the customer's Google account, so the
// moment they enable billing there the same key gets the paid limits and this app
// never notices.

import 'server-only'
import { getSetting } from './settings.ts'

async function keyFrom(settingKey: string, envValue: string | undefined): Promise<string> {
  const stored = await getSetting(settingKey)
  return (stored ?? '').trim() || (envValue ?? '').trim()
}

/** Google AI key — rate-con parsing and document classification. '' when unset, which
 * every call site already handles by degrading instead of throwing. */
export function geminiKey(): Promise<string> {
  return keyFrom('gemini_api_key', process.env.GEMINI_API_KEY)
}

/** FMCSA WebKey — broker authority lookups. Free, issued instantly. */
export function fmcsaKey(): Promise<string> {
  return keyFrom('fmcsa_webkey', process.env.FMCSA_WEBKEY)
}

/** Which end of the model ladder to start from.
 *
 * 'saving' (default) leads with the high-daily-limit lite model — right for the free
 * tier, where the request COUNT is the scarce resource. 'quality' leads with the
 * stronger model, which is only sensible once the customer has billing enabled and
 * the daily cap stops being the binding constraint. Stored per install; the fallback
 * chain is unchanged either way, so a wrong choice costs nothing but ordering. */
export async function aiModelPref(): Promise<'saving' | 'quality'> {
  return (await getSetting('ai_model_pref')) === 'quality' ? 'quality' : 'saving'
}

/** HERE Routing v8 — платные дороги. Бесплатный уровень платформы HERE покрывает
 * парк такого размера с многократным запасом; без ключа раздел «Платные дороги»
 * честно говорит, что считать нечем, вместо того чтобы выдумывать цифры. */
export function hereKey(): Promise<string> {
  return keyFrom('here_api_key', process.env.HERE_API_KEY)
}
