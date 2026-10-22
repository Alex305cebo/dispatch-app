import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { previewWeeklyReport } from '@/lib/weekly-report'

export const dynamic = 'force-dynamic'

// Письмо отчёта как страница — посмотреть перед отправкой. Только админу: там деньги парка.
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin' || user.isWorkspace) return NextResponse.redirect(new URL('/', req.url))
  // За прокси хостинга req.url — внутренний адрес; ссылки в письме — по настоящему домену.
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const origin = host ? `${req.headers.get('x-forwarded-proto') ?? 'https'}://${host}` : new URL(req.url).origin
  const html = await previewWeeklyReport(undefined, origin)
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
