import type { NextConfig } from 'next'

// Метка сборки. Проставляется в момент сборки и отдаётся из /api/health, чтобы на
// вопрос «доехала правка на боевой сайт или нет» можно было ответить одним curl, а
// не гаданием по внешнему виду страницы. Именно этого не хватало: правки уезжали в
// main, автосборка Hostinger могла не пройти, и снаружи это выглядело как «ИИ ничего
// не сделал».
const BUILD_STAMP = new Date().toISOString()

const config: NextConfig = {
  env: { BUILD_STAMP },
  // Two dev servers on this same folder both write `.next` and clobber each other's
  // build manifests — that is the "Internal Server Error / ENOENT app-build-manifest"
  // we kept hitting. Set NEXT_DIST_DIR to give a second instance its own output dir.
  // Unset everywhere else, so ordinary dev and the deploy build are untouched.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // The floating "N" pill bottom-left is Next.js's own dev-mode route indicator —
  // not part of this app's UI, just development tooling chrome. Off entirely.
  devIndicators: false,
  // schema.sql читается с диска во время работы (lib/install.ts — установка на
  // пустую базу), а Hostinger разворачивает не репозиторий, а обрезанную сборку:
  // в развёрнутом lib/ лежат два файла из шестидесяти. Сейчас schema.sql среди них
  // оказался сам, но полагаться на удачу трассировщика нельзя — путь собирается
  // из process.cwd() и статически не виден. Эта строка включает файл в сборку явно.
  outputFileTracingIncludes: {
    '/login': ['./lib/schema.sql'],
  },
  experimental: {
    // Сколько браузер держит уже открытый раздел. По умолчанию 0: любой возврат на
    // вкладку, где был минуту назад, — новый рендер на сервере и «Загрузка…» заново.
    // 30 с — вернуться на «Грузы» с карточки или переключиться туда-обратно мгновенно,
    // и при этом цифры не залёживаются: любое изменение (серверное действие) и так
    // сбрасывает этот кэш, а GPS обновляется своим таймером через router.refresh().
    staleTimes: { dynamic: 30, static: 30 },
    serverActions: {
      // Document upload goes through a server action; default cap is 1MB and a
      // scanned rate con or a photo is bigger. Hard cap enforced again in the action.
      bodySizeLimit: '10mb',
    },
  },
  // Старые адреса денег. До 10/09/26 деньги были вкладками «Документов» (/docs?tab=unpaid…),
  // а ещё раньше — страницей /invoices. Перевод здесь, а не в самой странице: redirect() из
  // страницы уходит уже потоком (после app/loading.tsx), и роутер Next при первом открытии
  // падал с React #310 «Rendered more hooks», прежде чем перейти. Отсюда — обычный ответ
  // 307 до всякой отрисовки, а остальные параметры адреса (tab, week, q) едут следом сами.
  // Имена вкладок — те же, что в lib/money-tabs.ts.
  async redirects() {
    const money = [{ type: 'query' as const, key: 'tab', value: '(unpaid|paid|weeks|dispatchers|drivers)' }]
    return [
      { source: '/docs', has: money, destination: '/money', permanent: false },
      { source: '/invoices', has: money, destination: '/money', permanent: false },
      // Без вкладки /invoices была «Оплата · факторинг» — теперь это «Грузы» в «Документах».
      { source: '/invoices', destination: '/docs', permanent: false },
    ]
  },
  // Заголовки, которых не было вовсе.
  //
  // frame-ancestors: без него любую страницу можно положить в прозрачный <iframe> на
  // чужом сайте и подставить под клик — а тут кликом удаляют документы и меняют
  // статусы грузов. Встраивать приложение никуда не нужно, поэтому запрет полный.
  //
  // nosniff: браузер иначе сам угадывает тип содержимого вопреки заголовку, и файл,
  // отданный как поток байтов, может быть исполнен как страница.
  //
  // Referrer-Policy: в адресах есть номера грузов и траков — чужому сайту, на который
  // ушли по ссылке, полный адрес видеть незачем.
  //
  // Полноценный CSP со script-src здесь пока не ставится: в приложении есть свои
  // встроенные скрипты (тема) и подпись Next, и запрет без их разбора просто уронил бы
  // страницы. Это следующий шаг, а не этот.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), interest-cohort=()' },
        ],
      },
    ]
  },
}

export default config
