// Полные снимки всех страниц демо на телефоне и десктопе — для ревью вёрстки.
// Пишет в scratch-папку (не в репозиторий): node scripts/shot-all.mjs <outDir>
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.GUIDE_BASE || 'https://app.mayalogisticsinc.com'
const OUT = process.argv[2] || 'shots'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })

for (const [tag, vp] of [
  ['m', { width: 390, height: 844 }],
  ['d', { width: 1366, height: 900 }],
]) {
  const ctx = await browser.newContext({ viewport: vp, locale: 'ru', deviceScaleFactor: 1 })
  await ctx.addCookies([{ name: 'locale', value: 'ru', domain: new URL(BASE).hostname, path: '/' }])
  await ctx.addInitScript(() => {
    sessionStorage.setItem('tour:pos', 'closed')
    localStorage.setItem('tour:pos', 'closed')
  })
  const page = await ctx.newPage()
  await page.goto(BASE + '/demo', { waitUntil: 'networkidle', timeout: 90000 })
  await page.goto(BASE + '/trucks', { waitUntil: 'networkidle' })
  const trucks = await page.$$eval('a[href^="/trucks/"]', (as) =>
    [...new Set(as.map((a) => a.getAttribute('href')))].filter((h) => /^\/trucks\/\d+$/.test(h)),
  )
  await page.goto(BASE + '/loads', { waitUntil: 'networkidle' })
  const loads = await page.$$eval('a[href^="/loads/"]', (as) =>
    [...new Set(as.map((a) => a.getAttribute('href')))].filter((h) => /^\/loads\/\d+$/.test(h)),
  )
  const pages = ['/', '/loads', loads[0], '/loads/new', '/trucks', trucks[0], '/docs', '/invoices', '/brokers', '/tolls', '/telegram']
  for (const url of pages) {
    if (!url) continue
    await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 90000 })
    await page.waitForTimeout(2500)
    await page.addStyleTag({ content: '.z-\\[190\\]{display:none!important}' })
    const name = url === '/' ? 'overview' : url.replace(/^\//, '').replace(/[/?=]/g, '-')
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: true })
    console.log(tag, url)
  }
  await ctx.close()
}
await browser.close()
