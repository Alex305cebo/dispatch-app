import { NextResponse, type NextRequest } from 'next/server'

// Two probes on one route.
//
// GET /api/health — cheap LIVENESS for an external uptime monitor. Returns 200 without
// touching the DB or a session, so it answers instantly even under load, and it's
// excluded from the auth middleware (see middleware.ts matcher) so it never does the
// per-request session lookup. A monitor hitting this every few minutes tells us the app
// is down within a minute, instead of finding out from a user staring at a 503.
//
// GET /api/health?ready=<CRON_SECRET> — READINESS, which is a different question: not
// "is the process up" but "was this install finished correctly". The app is sold per
// company and set up by hand, and every field below is a step that has actually been
// forgotten: schema never applied, first admin never created, company profile left
// blank so invoicing refuses, no AI key so document parsing silently does nothing, no
// CRON_SECRET so live tracking never polls. One curl instead of a checklist.
//
// Gated on CRON_SECRET because this route sits outside auth — and the secret has to be
// set at install time anyway. Unset means the branch answers 401, which is itself the
// correct signal: that step wasn't done either. Booleans and counts only; a readiness
// probe must never echo a key back.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ready = req.nextUrl.searchParams.get('ready')
  // build — когда собралась ТА версия, что сейчас отвечает. Отдаётся и без секрета:
  // это не тайна, а единственный способ снаружи проверить, доехал ли деплой.
  if (ready === null)
    return NextResponse.json({ ok: true, ts: Date.now(), build: process.env.BUILD_STAMP ?? null })

  const secret = process.env.CRON_SECRET
  if (!secret || ready !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Imported lazily so the liveness path above stays free of the DB module entirely.
  const [{ sql }, { geminiKey, fmcsaKey, hereKey }, { getSetting }, { hereUsage }] =
    await Promise.all([
      import('@/lib/db'),
      import('@/lib/keys'),
      import('@/lib/settings'),
      import('@/lib/tolls-here'),
    ])

  try {
    const [admins, trucks, co, gemini, fmcsa, here, hereMonth, schemaVersion] = await Promise.all([
      sql`SELECT count(*)::int AS n FROM users WHERE is_demo = FALSE AND role = 'admin'`,
      sql`SELECT count(*)::int AS n FROM trucks WHERE company_id = 'default'`,
      sql`SELECT key, value FROM settings WHERE key IN ('co_name', 'co_mcdot')`,
      geminiKey(),
      fmcsaKey(),
      hereKey(),
      hereUsage(),
      getSetting('schema_version'),
    ])
    const coMap = Object.fromEntries((co as { key: string; value: string }[]).map((r) => [r.key, r.value]))
    return NextResponse.json({
      db: true,
      schemaVersion: schemaVersion ?? null,
      admins: (admins as { n: number }[])[0]!.n,
      trucks: (trucks as { n: number }[])[0]!.n,
      company: { name: !!coMap.co_name, mcdot: !!coMap.co_mcdot },
      keys: {
        gemini: gemini !== '',
        fmcsa: fmcsa !== '',
        here: here !== '',
        eld: !!process.env.ELD_USERNAME && !!process.env.ELD_PASSWORD,
        cron: true, // reaching this branch at all proves CRON_SECRET is set and matched
      },
      // Расход платных дорог за текущий месяц против нашего же потолка. Бесплатный
      // объём Routing у HERE — 5000/мес, потолок ниже впятеро, и это видно цифрой,
      // а не на слово.
      tolls: { usedThisMonth: hereMonth.used, cap: hereMonth.cap },
    })
  } catch (e) {
    // A failure here is almost always "schema never applied" — say so rather than
    // returning a 500 the installer has to go and interpret in the logs.
    return NextResponse.json(
      { db: false, error: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    )
  }
}
