import { NextResponse } from 'next/server'
import { maybeSendWeeklyReport, reportStatus } from '@/lib/weekly-report'

export const dynamic = 'force-dynamic'

// Будильник недельного отчёта. Сервер шлёт письмо сам, но только когда его кто-то
// разбудил: пингер /api/eld-poll (на проде не настроен) или открытие «Сегодня».
// 11/06/26 отчёт ждал больше 20 минут, пока кто-нибудь откроет сайт, — теперь его
// будит .github/workflows/weekly-report.yml раз в три часа.
//
// Без ключа: maybeSendWeeklyReport шлёт неделю один раз, когда пора, и только на адреса
// из Админки; лишний вызов ничего не делает. Ответ — только неделя и «да/нет».
export async function POST() {
  await maybeSendWeeklyReport()
  const st = await reportStatus()
  const e = st.log[0]
  return NextResponse.json(e ? { week: e.week, ok: e.ok, at: e.at } : { week: null })
}
