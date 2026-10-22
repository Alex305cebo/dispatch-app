// Воскресный отчёт по тракам на почту — запускает .github/workflows/weekly-report.yml.
// Вся работа в lib/weekly-report.ts (та же, что у кнопки «Отправить сейчас» в Админке).
//
//   node --conditions=react-server scripts/weekly-report.mts [--force]
//
// --conditions=react-server — чтобы 'server-only' в lib/db.ts пропустил запуск вне Next.
// Логи репозитория публичные: печатаем неделю и счётчики, ни адресов, ни ошибок SMTP целиком.

import { reportStatus, sendWeeklyReport } from '../lib/weekly-report.ts'

const force = process.argv.includes('--force')
// Без пароля Gmail письмо шлёт сам сервер сайта своей почтой (lib/weekly-report.ts,
// maybeSendWeeklyReport): у GitHub такой почты нет, и неудачная попытка отсюда только
// отложила бы серверную на 6 часов.
if (!(await reportStatus()).passSet) {
  console.log('no Gmail app password: the site server sends the report itself')
  process.exit(0)
}
const res = await sendWeeklyReport({ force })
if (res.ok) console.log(`week ${res.week}: sent to ${res.to} recipient(s), ${res.files} file(s)`)
else if ('skipped' in res) console.log(`week ${res.week}: ${res.reason}, nothing to do`)
else console.log(`week ${res.week}: NOT sent (${res.error.startsWith('Не заданы') || res.error.startsWith('Нет адресов') ? 'no settings in Admin' : res.error.includes('не принял') ? 'gmail auth' : 'error'})`)
process.exit(res.ok || 'skipped' in res ? 0 : 1)
