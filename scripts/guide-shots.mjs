// Снимки экранов для вводной экскурсии (public/guide/*.jpg).
//
// Снимаются с ДЕМО-данных — там заполненный парк, а не пустые таблицы. Админские
// экраны (ключи, реквизиты, люди) гостю демо недоступны: для них передайте адрес
// установки, где вы вошли администратором, и куки сессии через переменные
// окружения (см. ниже). Баннер «ДЕМО-режим» срезается сверху.
//
// Запуск (playwright-core в зависимости не входит — он нужен только здесь):
//   npm i --no-save playwright-core
//   node scripts/guide-shots.mjs                       # демо на kgzapp.online
//   GUIDE_BASE=https://... GUIDE_SESSION=<dispatch_session> node scripts/guide-shots.mjs --admin
//
// Нужен установленный Chrome: скрипт берёт его, а не качает свой браузер.

import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.GUIDE_BASE || 'https://kgzapp.online'
const OUT = new URL('../public/guide/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const ADMIN = process.argv.includes('--admin')
const BANNER = 30 // высота полосы «ДЕМО-режим»

mkdirSync(OUT, { recursive: true })
const host = new URL(BASE).hostname
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: 'ru-RU' })
const cookies = [{ name: 'locale', value: 'ru', domain: host, path: '/' }]
if (ADMIN && process.env.GUIDE_SESSION)
  cookies.push({ name: 'dispatch_session', value: process.env.GUIDE_SESSION, domain: host, path: '/' })
await ctx.addCookies(cookies)
const page = await ctx.newPage()

async function shot(name, url, wait = 1000) {
  await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForTimeout(wait)
  const crop = ADMIN ? 0 : BANNER
  await page.screenshot({
    path: `${OUT}${name}.jpg`,
    type: 'jpeg',
    quality: 80,
    clip: { x: 0, y: crop, width: 1280, height: 820 - crop },
  })
  console.log('shot', name, page.url())
}

if (ADMIN) {
  await shot('admin-keys', '/admin#keys', 1500)
  await shot('admin-company', '/admin#company', 1500)
  await shot('admin-users', '/admin', 1500)
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
  await shot('overview', '/', 1500)
  await shot('trucks', '/trucks')
  await shot('truck-new', '/trucks/new')
  if (trucks[1]) await shot('truck-detail', trucks[1], 2500)
  await shot('loads', '/loads')
  await shot('load-new', '/loads/new')
  if (loads[0]) await shot('load-detail', loads[0], 2000)
  await shot('tracking', '/tracking', 3500)
  await shot('docs', '/docs')
  await shot('invoices', '/invoices')
  await shot('brokers', '/brokers')
  await shot('tolls', '/tolls', 2500)
}

await browser.close()
console.log('done ->', OUT)
