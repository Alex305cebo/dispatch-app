// Отчёт по тракам на почту из GitHub — .github/workflows/weekly-report.yml.
// Вся работа в lib/weekly-report.ts (та же, что у сервера и кнопки «Отправить сейчас»).
//
//   node --conditions=react-server scripts/weekly-report.mts [--force]
//
// --conditions=react-server — чтобы 'server-only' в lib/db.ts пропустил запуск вне Next.
// Логи репозитория публичные: печатаем неделю и счётчики, ни адресов, ни ошибок SMTP целиком.

import { maybeSendWeeklyReport, reportStatus, sendWeeklyReport } from '../lib/weekly-report.ts'

const force = process.argv.includes('--force')
// Без пароля Gmail письмо шлёт сам сервер сайта своей почтой: у GitHub такой почты нет,
// и неудачная попытка отсюда только отложила бы серверную на 6 часов.
const before = await reportStatus()
// История отправок — без адресов (в ошибке они заменяются на «@»).
const hide = (t?: string) => (t ?? '').replace(/[^\s<>"']+@[^\s<>"']+/g, '@').slice(0, 120)
for (const e of before.log.slice(0, 6)) {
  console.log(`log: week ${e.week} at ${e.at} ${e.ok ? 'OK' : 'FAIL'} ${e.manual ? 'manual' : 'auto'} files=${e.files} ${hide(e.error)}`)
}
console.log(`schedule: ${before.enabled ? 'on' : 'off'} day=${before.day} hour=${before.hour} recipients=${before.to.split(/[,;\s]+/).filter(Boolean).length}`)
if (!before.passSet) {
  console.log('no Gmail app password: the site server sends the report itself')
  process.exit(0)
}
if (force) {
  const res = await sendWeeklyReport({ force })
  console.log(`week ${res.week}: ${res.ok ? `sent, ${res.files} file(s)` : 'NOT sent'}`)
  process.exit(res.ok ? 0 : 1)
}
// День, час и «выключено» — из Админки; здесь только «пора ли».
await maybeSendWeeklyReport()
const after = await reportStatus()
const fresh = after.log[0] && after.log[0].at !== before.log[0]?.at ? after.log[0] : null
console.log(fresh ? `week ${fresh.week}: ${fresh.ok ? `sent, ${fresh.files} file(s)` : 'NOT sent'}` : 'not due or already sent')
process.exit(fresh && !fresh.ok ? 1 : 0)
