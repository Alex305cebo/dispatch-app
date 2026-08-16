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
}

export default config
