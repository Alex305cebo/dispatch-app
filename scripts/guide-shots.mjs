// Снимки для вводной экскурсии (public/guide/<язык>/*.jpg) — не страницы целиком, а
// ТОТ блок, о котором шаг: карта — карту, форма — форму. Целая страница в
// карточке 700px нечитаема; секция — читаема.
//
// Снимается НА КАЖДОМ языке интерфейса: экскурсия на английском со снимками
// по-русски — это не инструкция, а ребус. Блоки находятся по заголовку из того же
// словаря, что и интерфейс (lib/i18n), а не по координатам: вёрстка поедет —
// снимок останется точным; переведут заголовок — снимок найдёт новый.
// Снимаются с ДЕМО-данных: там заполненный парк. Админские экраны гостю демо
// недоступны — для них нужна сессия администратора (GUIDE_SESSION).
//
// Запуск (playwright-core в зависимости не входит — нужен только здесь):
//   npm i --no-save playwright-core
//   node scripts/guide-shots.mjs                       # все языки
//   GUIDE_LOCALES=en,es node scripts/guide-shots.mjs   # только эти языки
//   GUIDE_ONLY=invoices node scripts/guide-shots.mjs    # только эти кадры
//   GUIDE_BASE=https://… GUIDE_SESSION=<dispatch_session> node scripts/guide-shots.mjs --admin
// Нужен установленный Chrome: скрипт берёт его, а не качает свой браузер.
// Словарь — .ts; Node 24 читает его сам (type stripping), сборка не нужна.

import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { t } from '../lib/i18n.ts'

const BASE = process.env.GUIDE_BASE || 'https://app.mayalogisticsinc.com'
const ROOT = fileURLToPath(new URL('../public/guide/', import.meta.url))
const ADMIN = process.argv.includes('--admin')
const LOCALES = (process.env.GUIDE_LOCALES || 'ru,en,es,uk,ro,kk').split(',')
const PAD = 14
// GUIDE_ONLY=invoices,docs — переснять только эти кадры.
const ONLY = process.env.GUIDE_ONLY ? process.env.GUIDE_ONLY.split(',') : null

const host = new URL(BASE).hostname
const browser = await chromium.launch({ channel: 'chrome', headless: true })

for (const locale of LOCALES) {
  const OUT = `${ROOT}${locale}/`
  mkdirSync(OUT, { recursive: true })
  /** Заголовок блока на этом языке: до первого « — » / « · » и без {n}. */
  const h = (key) => t(locale, key).split(/ [—·]/)[0].replace(/\{\w+\}/g, '').trim()

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1600 }, locale })
  const cookies = [{ name: 'locale', value: locale, domain: host, path: '/' }]
  if (ADMIN && process.env.GUIDE_SESSION)
    cookies.push({ name: 'dispatch_session', value: process.env.GUIDE_SESSION, domain: host, path: '/' })
  await ctx.addCookies(cookies)
  // Экскурсия открывается на первом же экране и попала бы в каждый кадр — снимаем
  // с закрытой. Она сама себя фотографировать не должна.
  await ctx.addInitScript(() => {
    sessionStorage.setItem('tour:pos', 'closed')
    localStorage.setItem('tour:pos', 'closed')
  })
  const page = await ctx.newPage()

  /** Блок по заголовку: ближайшая секция/панель, внутри которой этот текст. */
  const block = (text) => page.locator('section, .panel, details, form').filter({ hasText: text }).first()

  /**
   * Снимок области, накрывающей все переданные блоки (объединение рамок), с полями.
   * maxH режет слишком высокие блоки снизу: карточке трака хватает шапки.
   * Вьюпорт высокий (1600), а не fullPage: в полностраничном режиме рамки блоков и
   * координаты кадра расходились, и у снимков оказывался срезан левый край.
   */
  async function shot(name, url, locators, { wait = 1200, maxH = 620 } = {}) {
    if (ONLY && !ONLY.includes(name)) return
    await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 90000 })
    await page.waitForTimeout(wait)
    await page.evaluate(() => window.scrollTo(0, 0))
    // Ярлык свёрнутой экскурсии висит поверх страницы — в инструкции ему не место.
    await page.addStyleTag({ content: '.z-\\[190\\]{display:none!important}' })
    const boxes = []
    for (const l of locators) {
      const b = await l.boundingBox().catch(() => null)
      if (b) boxes.push(b)
    }
    if (!boxes.length) {
      console.warn('SKIP', locale, name, '— блок не найден')
      return
    }
    const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - PAD)
    const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - PAD)
    const r = Math.max(...boxes.map((b) => b.x + b.width)) + PAD
    const bot = Math.max(...boxes.map((b) => b.y + b.height)) + PAD
    await page.screenshot({
      path: `${OUT}${name}.jpg`,
      type: 'jpeg',
      quality: 82,
      clip: { x, y, width: r - x, height: Math.min(bot - y, maxH) },
    })
    console.log('shot', locale, name, `${Math.round(r - x)}x${Math.round(Math.min(bot - y, maxH))}`)
  }

  if (ADMIN) {
    await shot('admin-keys', '/admin', [block(h('admin.keysHeading'))], { maxH: 560 })
    await shot('admin-company', '/admin', [block(h('admin.companyHeading'))], { maxH: 560 })
    await shot('admin-users', '/admin', [block(h('admin.usersHeading'))], { maxH: 480 })
  } else {
    await page.goto(BASE + '/demo', { waitUntil: 'networkidle', timeout: 90000 })
    // Адреса трака и груза в демо меняются при пересеве — берём из списков.
    await page.goto(BASE + '/trucks', { waitUntil: 'networkidle' })
    const trucks = await page.$$eval('a[href^="/trucks/"]', (as) =>
      [...new Set(as.map((a) => a.getAttribute('href')))].filter((h) => /^\/trucks\/\d+$/.test(h)),
    )
    await page.goto(BASE + '/loads', { waitUntil: 'networkidle' })
    const loads = await page.$$eval('a[href^="/loads/"]', (as) =>
      [...new Set(as.map((a) => a.getAttribute('href')))].filter((h) => /^\/loads\/\d+$/.test(h)),
    )

    // Обзор: плитки цифр и лента «Загрузка парка» — два соседних блока.
    await shot('overview', '/', [block(h('overview.rateTotal')), block(h('trucks.heatmap.title'))], { wait: 1800 })
    // Новый трак: сама форма.
    await shot('truck-new', '/trucks/new', [block(h('trucks.form.truckHeading'))], { maxH: 700 })
    // Карточка трака: шапка с машиной, плитками и текущим заданием.
    if (trucks[1]) await shot('truck-detail', trucks[1], [page.locator('main section').first()], { wait: 2500, maxH: 760 })
    // Новый груз: блок скана и форма с расчётом справа.
    await shot('load-new', '/loads/new', [page.getByText(h('newLoad.scanCta')).first(), block(h('loadDetail.rateHeading')), block(h('loadForm.heading'))], { maxH: 700 })
    // Карточка груза: шапка со статусами.
    if (loads[0]) await shot('load-detail', loads[0], [page.locator('main section').first()], { wait: 2000, maxH: 640 })
    // Трекинг: карта и цифры под ней.
    await shot('tracking', '/tracking', [page.locator('.fleet-map').first(), block(h('tracking.pickOnMap'))], { wait: 4000 })
    // Файлы: вкладки видов документов и список.
    await shot('docs', '/docs', [page.locator('main .panel').first(), page.locator('main .panel').nth(1)], { maxH: 560 })
    // Финансы: плитки «ждём» и список счетов.
    // В демо просроченных может не быть — берём плитки и первый список под ними.
    await shot('invoices', '/invoices', [page.locator('main .grid').first(), page.locator('main details.panel').first()], { maxH: 600 })
    // Брокеры: проверка по MC и свой список.
    await shot('brokers', '/brokers', [block(h('brokers.checkHeading')), block(h('brokers.dbHeading'))], { maxH: 600 })
    // Толлы: форма маршрута и результат под ней.
    await shot('tolls', '/tolls', [page.locator('main section').first(), page.locator('main section').nth(1)], { wait: 3000, maxH: 620 })
  }
  await ctx.close()
}

await browser.close()
console.log('done ->', ROOT)
