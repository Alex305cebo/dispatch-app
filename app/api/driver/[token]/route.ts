import { retitleDocuments } from '@/lib/doc-title'
import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { clientIp, truckForDriverRequest } from '@/lib/driver-link'
import { listLoads } from '@/lib/loads'
import { activeLoadsByTruck } from '@/lib/map'
import { eventSeq, nextOpenStop, stopsFrom } from '@/lib/stops'
import { autoInvoiceIfReady } from '@/lib/invoice'
import { addLoadEvent, listLoadEvents } from '@/lib/load-events'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 8 * 1024 * 1024
// Потолок одного запроса: не больше 10 файлов и ~40 МБ всего тела. Без него адрес без
// входа принимал бы сколько угодно — и всё это ложилось в базу.
// На деле тело сейчас режет ещё раньше middleware (Next 15.5 в среде Node): больше
// 10 МБ он дальше не передаёт, и такой запрос не разбирается. Поэтому страница
// водителя шлёт пачки фото частями до 9 МБ (driver-client.tsx), а этот потолок — на
// случай, если лимит middleware когда-нибудь поднимут.
const MAX_FILES = 10
const MAX_TOTAL_BYTES = 40 * 1024 * 1024
// Запас на разметку multipart (границы, заголовки частей) поверх самих файлов.
const MAX_BODY_BYTES = MAX_TOTAL_BYTES + 1024 * 1024

/**
 * Действия со страницы водителя (app/d/[token]). Не серверный экшен, а обычный
 * POST с токеном в адресе: у водителя нет сессии, а экшены берут личность из неё.
 * Токен — единственный ключ, и он даёт права только на ОДИН трак: отметить шаг
 * рейса (приехал / загрузился / приехал / выгрузился), написать диспетчеру и
 * подшить фото к своему грузу. Ни ставок, ни других траков, ни удаления.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const truck = await truckForDriverRequest(token, clientIp(req.headers))
  if (truck === 'limited') return NextResponse.json({ error: 'too many attempts' }, { status: 429 })
  if (!truck) return NextResponse.json({ error: 'bad token' }, { status: 404 })
  if (truck.companyId === 'demo') return NextResponse.json({ error: 'demo' }, { status: 403 })

  const fd = await cappedFormData(req)
  if (fd === 'too_large') return NextResponse.json({ error: 'too large' }, { status: 413 })
  if (fd === 'bad') return NextResponse.json({ error: 'bad form' }, { status: 400 })
  const loads = await listLoads(truck.companyId, { truckId: truck.id })
  const action = String(fd.get('action') || '')
  // Текущий груз и партиалы; страница называет, какого груза и какой остановки
  // касается нажатие. Токен всё равно даёт доступ только к грузам ЭТОГО трака.
  const active = activeLoadsByTruck(loads).get(truck.id) ?? []
  const wantId = Number(fd.get('loadId')) || null
  const load = (wantId ? active.find((l) => l.id === wantId) : null) ?? active[0] ?? null
  const stops = load ? stopsFrom(load) : []
  const stopSeq = Number(fd.get('stopSeq')) || null
  const stop = stopSeq ? (stops.find((s) => s.seq === stopSeq) ?? null) : null

  // «Приехал» на остановку — только отметка времени, статус не меняется. Это
  // время и есть доказательство детеншена. Без номера остановки (старая страница)
  // — по статусу: booked = погрузка, in_transit = выгрузка.
  if (action === 'arrived') {
    if (!load) return NextResponse.json({ error: 'no load' }, { status: 409 })
    const kind = stop
      ? stop.role === 'pickup'
        ? 'arrived_pickup'
        : 'arrived_delivery'
      : load.status === 'booked'
        ? 'arrived_pickup'
        : load.status === 'in_transit'
          ? 'arrived_delivery'
          : null
    if (!kind) return NextResponse.json({ error: 'bad state' }, { status: 409 })
    await addLoadEvent(truck.companyId, load.id, truck.id, kind, null, stop?.seq ?? eventSeq({ kind, at: '' }, stops))
    revalidate(truck.id, load.id)
    return NextResponse.json({ ok: true })
  }

  // «Загрузился» / «Выгрузился» на остановке. Статус груза: «в пути» после первой
  // погрузки, «доставлен» — когда пройдены ВСЕ остановки, не после первой выгрузки.
  if (action === 'status') {
    if (!load) return NextResponse.json({ error: 'no load' }, { status: 409 })
    if (stop) {
      if (load.status !== 'booked' && load.status !== 'in_transit')
        return NextResponse.json({ error: 'bad transition' }, { status: 409 })
      const kind = stop.role === 'pickup' ? 'loaded' : 'delivered'
      await addLoadEvent(truck.companyId, load.id, truck.id, kind, null, stop.seq)
      const events = await listLoadEvents(truck.companyId, load.id)
      const to =
        stop.role === 'pickup' && load.status === 'booked'
          ? 'in_transit'
          : stop.role === 'delivery' && nextOpenStop(stops, events) === null
            ? 'delivered'
            : null
      if (to) await sql`UPDATE loads SET status = ${to} WHERE id = ${load.id} AND company_id = ${truck.companyId}`
      revalidate(truck.id, load.id)
      return NextResponse.json({ ok: true, status: to ?? load.status })
    }
    const to = String(fd.get('to') || '')
    // Старая страница без остановок: только шаг вперёд, booked → in_transit → delivered.
    const ok = (load.status === 'booked' && to === 'in_transit') || (load.status === 'in_transit' && to === 'delivered')
    if (!ok) return NextResponse.json({ error: 'bad transition' }, { status: 409 })
    await sql`UPDATE loads SET status = ${to} WHERE id = ${load.id} AND company_id = ${truck.companyId}`
    const kind = to === 'in_transit' ? 'loaded' : 'delivered'
    await addLoadEvent(truck.companyId, load.id, truck.id, kind, null, eventSeq({ kind, at: '' }, stops))
    revalidate(truck.id, load.id)
    return NextResponse.json({ ok: true, status: to })
  }

  // Сообщение диспетчеру: сломался, задержка, вопрос. Водитель пишет сам — это не
  // автоматическое сообщение. Диспетчер видит его на грузе и в уведомлениях.
  if (action === 'note') {
    const text = String(fd.get('text') || '')
      .trim()
      .slice(0, 500)
    if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 })
    await addLoadEvent(truck.companyId, load?.id ?? null, truck.id, 'note', text)
    revalidate(truck.id, load?.id ?? null)
    return NextResponse.json({ ok: true })
  }

  if (action === 'photo') {
    const kind = String(fd.get('kind') || 'photo')
    // Пломбу водитель снимает на том же пикапе, что и BOL, — она из того же списка.
    if (!['bol', 'seal', 'pod', 'photo'].includes(kind))
      return NextResponse.json({ error: 'bad kind' }, { status: 400 })
    const files = fd.getAll('file').filter((f): f is File => f instanceof File && f.size > 0)
    if (!files.length) return NextResponse.json({ error: 'no file' }, { status: 400 })
    if (files.length > MAX_FILES) return NextResponse.json({ error: 'too many files' }, { status: 413 })
    if (files.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_BYTES)
      return NextResponse.json({ error: 'too large' }, { status: 413 })
    let saved = 0
    for (const file of files) {
      if (file.size > MAX_BYTES) continue
      const hex = Buffer.from(await file.arrayBuffer()).toString('hex')
      // Название — от водителя: «BOL · 1590 · 2026-09-05.jpg», чтобы в списке было
      // видно, откуда пришло, а не «IMG_2041.jpg».
      const title = `${kind.toUpperCase()} · ${truck.number ?? truck.id} · ${new Date().toISOString().slice(0, 10)}${ext(file)}`
      const ins = await sql`
        INSERT INTO documents (truck_id, load_id, kind, title, mime, size_bytes, data, company_id)
        VALUES (${truck.id}, ${load?.id ?? null}, ${kind}, ${title},
                ${file.type || 'application/octet-stream'}, ${file.size}, UNHEX(${hex}), ${truck.companyId})`
      if (ins.insertId) await retitleDocuments({ ids: [ins.insertId] })
      saved++
    }
    if (saved)
      await addLoadEvent(truck.companyId, load?.id ?? null, truck.id, 'photo', `${kind.toUpperCase()} × ${saved}`)
    if (load && kind === 'pod') await autoInvoiceIfReady(truck.companyId, load.id)
    revalidate(truck.id, load?.id ?? null)
    return NextResponse.json({ ok: true, saved })
  }

  return NextResponse.json({ error: 'bad action' }, { status: 400 })
}

/**
 * Тело запроса не больше MAX_BODY_BYTES — по заявленному Content-Length, ДО чтения.
 * Заявке можно верить: HTTP-сервер Node не отдаёт телу больше байт, чем в ней
 * написано. Без длины (chunked — так может переслать прокси хостинга) не отказываем:
 * такое тело всё равно обрезает middleware на 10 МБ, а отказ сломал бы водителю
 * кнопки «Приехал» и «Загрузился».
 * 'too_large' / 'bad' — ответить 413 / 400.
 */
async function cappedFormData(req: NextRequest): Promise<FormData | 'too_large' | 'bad'> {
  const declared = Number(req.headers.get('content-length'))
  if (declared > MAX_BODY_BYTES) return 'too_large'
  try {
    return await req.formData()
  } catch {
    return 'bad'
  }
}

function ext(f: File): string {
  const m = /\.[a-z0-9]{2,5}$/i.exec(f.name)
  if (m) return m[0].toLowerCase()
  return f.type === 'application/pdf' ? '.pdf' : f.type.startsWith('image/') ? '.jpg' : ''
}

function revalidate(truckId: number, loadId: number | null) {
  revalidatePath(`/trucks/${truckId}`)
  if (loadId) revalidatePath(`/loads/${loadId}`)
  revalidatePath('/loads')
  revalidatePath('/docs')
  revalidatePath('/')
}
