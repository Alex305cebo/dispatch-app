import 'server-only'

// Running tally of Gemini token spend, kept in the settings table. Every RC parse
// bumps it. This is our own convenience counter (from the day it was added) — the
// complete, authoritative usage is in Google AI Studio / Cloud Console.
// ponytail: read-modify-write on one settings row races under concurrent calls and
// can drop a bump. Fine at RC-scan volume; move to an atomic SQL counter if it ever
// needs to be exact.

import { getSetting, setSetting } from './settings.ts'

export type GeminiUsage = { tokens: number; calls: number; since: string | null }

export async function getGeminiUsage(): Promise<GeminiUsage> {
  const raw = await getSetting('gemini_usage')
  if (!raw) return { tokens: 0, calls: 0, since: null }
  try {
    return JSON.parse(raw) as GeminiUsage
  } catch {
    return { tokens: 0, calls: 0, since: null }
  }
}

export async function bumpGeminiUsage(tokens: number): Promise<void> {
  if (!Number.isFinite(tokens) || tokens <= 0) return
  try {
    const u = await getGeminiUsage()
    await setSetting(
      'gemini_usage',
      JSON.stringify({
        tokens: u.tokens + tokens,
        calls: u.calls + 1,
        since: u.since ?? new Date().toISOString(),
      }),
    )
  } catch {
    // best-effort — never let accounting break a parse
  }
}
