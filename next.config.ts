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
  experimental: {
    serverActions: {
      // Document upload goes through a server action; default cap is 1MB and a
      // scanned rate con or a photo is bigger. Hard cap enforced again in the action.
      bodySizeLimit: '10mb',
    },
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
