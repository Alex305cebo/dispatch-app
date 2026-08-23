import { cookies } from 'next/headers'
import { sql } from '@/lib/db'
import { ensureSchema, schemaInstalled } from '@/lib/install'
import { getSettings } from '@/lib/settings'
import { LOCALE_COOKIE, resolveLocale, t } from '@/lib/i18n'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  // Свежая установка, в которой переменную ещё не вписали. Спрашиваем окружение, а
  // не базу: без DATABASE_URL первый же запрос бросает исключение, и посетитель
  // видит пятисотку Next вместо ответа на вопрос «что делать дальше». Это самый
  // первый экран любой новой установки — он обязан объяснять себя сам.
  if (!process.env.DATABASE_URL) {
    // На двух языках сразу, и это не избыточность: язык выбирают на следующем
    // экране, а этот показывается ДО него — кука ещё не поставлена, и resolveLocale
    // молча отвечает «en» тому, кто английского не знает. Тот же приём, что на
    // экране выбора языка: вопрос, который нельзя задать на одном языке.
    const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value)
    const other = locale === 'ru' ? 'en' : 'ru'
    return (
      <main className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950 px-4">
        <div className="panel w-full max-w-md p-6">
          <h1 className="text-[15px] font-semibold">
            {t(locale, 'login.nodb_title')} · {t(other, 'login.nodb_title')}
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-white/72">{t(locale, 'login.nodb_text')}</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/45">{t(other, 'login.nodb_text')}</p>
          <code className="mt-3 block rounded-lg border border-white/8 bg-ink-900/80 px-3 py-2 text-[12.5px] text-white/85">
            DATABASE_URL=postgresql://…
          </code>
        </div>
      </main>
    )
  }

  // First run (no accounts yet) gets the "create the admin" form instead of sign-in
  // — the only door in is the one the owner walks through themselves.
  // is_demo excluded — the seeded public-demo account (lib/demo.ts) always exists,
  // and must never make a fresh install think an admin has already been created.
  //
  // Сначала — есть ли вообще схема. На свежей базе таблицы users нет, и прежний
  // запрос ронял эту страницу целиком: клиент вписывал DATABASE_URL и получал 500
  // вместо установки. Исключение отсюда наверх пускаем как есть — «база лежит» не
  // то же самое, что «база пустая», и молча предлагать установку поверх живой базы
  // было бы хуже ошибки.
  const installed = await schemaInstalled()
  // Код обновился — база дотягивается сама (lib/install.ts). Здесь, потому что
  // экран входа — первое, что открывают после любого деплоя.
  if (installed) await ensureSchema()
  const rows = installed ? await sql`SELECT 1 FROM users WHERE is_demo = FALSE LIMIT 1` : []

  // Чьё это приложение — крупно, на самом входе. Не украшение: установок теперь
  // несколько, каждой в панели хостинга вписывают СВОЮ строку подключения, и
  // единственная ошибка, которую иначе никто не заметит, — чужая база. Приложение
  // не может знать, что строка «не та»: база рабочая, схема на месте, аккаунты
  // есть, вход открывается как ни в чём не бывало — и на домене клиента оказывается
  // чужая компания. Имя компании из базы ловит это за секунду, до первого входа.
  //
  // Публичное демо на входе — нормально для нашей витрины и неуместно у клиента:
  // это дверь, в которую с его домена входит кто угодно, и данные демо занимают
  // место в ЕГО базе (у Neon бесплатно полгигабайта). Ключа нет — демо включено,
  // так что старые установки не замечают правки вовсе; форма установки пишет '0',
  // и у каждой новой копии двери нет с первого дня.
  const conf = installed
    ? await getSettings(['co_name', 'demo_public', 'demo_url'])
    : new Map<string, string>()
  const companyName = conf.get('co_name') ?? ''
  // Демо ДО входа — первое, что должен иметь возможность сделать человек, который
  // приложение ещё не купил. Два разных источника:
  //
  // demo_url — отдельная установка-витрина. Её база не имеет к этой никакого
  // отношения, поэтому у клиента показывать демо безопасно: гость гуляет по чужому
  // серверу, а не по его грузам.
  //
  // demo_public — демо ЭТОЙ установки (наша витрина). У клиента выключено формой
  // установки: там демо-данные легли бы в его же базу.
  const demoUrl = conf.get('demo_url') ?? ''
  const showDemo = conf.get('demo_public') !== '0'

  // Whether to ask for a language is decided here, server-side, because
  // resolveLocale() answers "en" for anyone who has never chosen — a silent default
  // that a Russian speaker never gets asked about. Reading the cookie here instead of
  // in a client effect also keeps the first paint honest: no flash of the wrong
  // language, and nothing for hydration to disagree about.
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value

  return (
    <LoginForm
      bootstrap={rows.length === 0}
      companyName={companyName}
      showDemo={showDemo}
      demoUrl={demoUrl}
      needsSchema={!installed}
      askLocale={!cookie}
      initialLocale={resolveLocale(cookie)}
    />
  )
}
