import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { truckByDriverToken } from '@/lib/driver-link'
import { listLoads } from '@/lib/loads'
import { currentLoadsByTruck } from '@/lib/map'
import { autoInvoiceIfReady } from '@/lib/invoice'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 8 * 1024 * 1024

/**
 * Действия со страницы водителя (app/d/[token]). Не серверный экшен, а обычный
 * POST с токеном в адресе: у водителя нет сессии, а экшены берут личность из неё.
 * Токен — единственный ключ, и он даёт ровно два права на ОДИН трак: сменить статус
 * его текущего груза (забукирован → в пути → доставлен) и подшить к нему фото.
 * Ни ставок, ни других траков, ни удаления.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const truck = await truckByDriverToken(token)
  if (!truck) return NextResponse.json({ error: 'bad token' }, { status: 404 })
  if (truck.companyId === 'demo') return NextResponse.json({ error: 'demo' }, { status: 403 })

  const loads = await listLoads(truck.companyId, { truckId: truck.id })
  const load = currentLoadsByTruck(loads).get(truck.id) ?? null

  const fd = await req.formData()
  const action = String(fd.get('action') || '')

  if (action === 'status') {
    if (!load) return NextResponse.json({ error: 'no load' }, { status: 409 })
    const to = String(fd.get('to') || '')
    // Только шаг вперёд по своему грузу: booked → in_transit → delivered.
    const ok = (load.status === 'booked' && to === 'in_transit') || (load.status === 'in_transit' && to === 'delivered')
    if (!ok) return NextResponse.json({ error: 'bad transition' }, { status: 409 })
    await sql`UPDATE loads SET status = ${to} WHERE id = ${load.id} AND company_id = ${truck.companyId}`
    revalidate(truck.id, load.id)
    return NextResponse.json({ ok: true, status: to })
  }

  if (action === 'photo') {
    const kind = String(fd.get('kind') || 'photo')
    if (!['bol', 'pod', 'photo'].includes(kind)) return NextResponse.json({ error: 'bad kind' }, { status: 400 })
    const files = fd.getAll('file').filter((f): f is File => f instanceof File && f.size > 0)
    if (!files.length) return NextResponse.json({ error: 'no file' }, { status: 400 })
    let saved = 0
    for (const file of files) {
      if (file.size > MAX_BYTES) continue
      const hex = Buffer.from(await file.arrayBuffer()).toString('hex')
      // Название — от водителя: «BOL · 1590 · 2026-09-05.jpg», чтобы в списке было
      // видно, откуда пришло, а не «IMG_2041.jpg».
      const title = `${kind.toUpperCase()} · ${truck.number ?? truck.id} · ${new Date().toISOString().slice(0, 10)}${ext(file)}`
      await sql`
        INSERT INTO documents (truck_id, load_id, kind, title, mime, size_bytes, data, company_id)
        VALUES (${truck.id}, ${load?.id ?? null}, ${kind}, ${title},
                ${file.type || 'application/octet-stream'}, ${file.size}, decode(${hex}, 'hex'), ${truck.companyId})`
      saved++
    }
    if (load && kind === 'pod') await autoInvoiceIfReady(truck.companyId, load.id)
    revalidate(truck.id, load?.id ?? null)
    return NextResponse.json({ ok: true, saved })
  }

  return NextResponse.json({ error: 'bad action' }, { status: 400 })
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
