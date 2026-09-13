import { NextResponse, type NextRequest } from 'next/server'
import { sql } from '@/lib/db'
import { companyScope } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Streams a stored document. Behind the session gate (middleware) — the browser
// sends the auth cookie on normal navigation, so links "just work" for a signed-in
// user. Scoped by company so a demo session can never fetch a real document (or vice
// versa) just by guessing its id.
//
// Тип содержимого ОТДАЁТСЯ ТОЛЬКО ИЗ БЕЛОГО СПИСКА, и это не придирка. Тип файла
// приходит из браузера при загрузке (file.type) и лежит в базе как есть: загрузив
// «накладную» с типом text/html, любой, у кого есть доступ, получал страницу,
// которая открывается ПО НАШЕМУ адресу и выполняет свой скрипт от имени того, кто её
// открыл, — то есть от имени диспетчера или админа. Отсюда до создания нового
// администратора один запрос. Всё, что не в списке, отдаётся вложением, а не
// страницей; nosniff запрещает браузеру угадывать тип вопреки заголовку.
const INLINE_OK = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'text/plain',
])
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const q = new URL(_req.url).searchParams
  const scope = await companyScope()

  // ?thumb=1 → миниатюра для списка документов: фото груза по несколько МБ, а в
  // списке их десяток. Миниатюра считается ОДИН раз и хранится в documents.thumb:
  // тянуть полный файл из базы ради 160px — это и секунды на телефоне, и сетевой
  // трафик Neon, которого на бесплатном плане 5 ГБ в месяц. Не картинка или не
  // вышло — 404, список покажет иконку.
  if (q.has('thumb')) {
    const t = (await sql`
      SELECT mime, encode(thumb, 'base64') AS thumb FROM documents
      WHERE id = ${Number(id)} AND company_id = ${scope}`) as { mime: string; thumb: string | null }[]
    const meta = t[0]
    if (!meta) return new NextResponse('Not found', { status: 404 })
    if (!(meta.mime || '').toLowerCase().startsWith('image/')) return new NextResponse('Not an image', { status: 404 })
    try {
      let out: Buffer
      if (meta.thumb) out = Buffer.from(meta.thumb, 'base64')
      else {
        const full = (await sql`SELECT encode(data, 'base64') AS b64 FROM documents WHERE id = ${Number(id)}`) as { b64: string }[]
        const sharp = (await import('sharp')).default
        out = await sharp(Buffer.from(full[0]!.b64, 'base64'))
          .rotate()
          .resize(160, 160, { fit: 'cover' })
          .jpeg({ quality: 70 })
          .toBuffer()
        await sql`UPDATE documents SET thumb = decode(${out.toString('hex')}, 'hex') WHERE id = ${Number(id)}`
      }
      return new NextResponse(new Uint8Array(out), {
        headers: {
          'content-type': 'image/jpeg',
          // Файл под этим id не меняется никогда — кэш на месяц.
          'cache-control': 'private, max-age=2592000, immutable',
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; sandbox",
        },
      })
    } catch {
      return new NextResponse('Thumb failed', { status: 404 })
    }
  }
  const rows = await sql`
    SELECT title, mime, encode(data, 'base64') AS b64 FROM documents
    WHERE id = ${Number(id)} AND company_id = ${scope}`
  const doc = rows[0] as { title: string; mime: string; b64: string } | undefined
  if (!doc) return new NextResponse('Not found', { status: 404 })

  // ?download=1 → force a save-to-computer; otherwise open inline in the browser tab.
  const download = q.has('download')
  const mime = (doc.mime || '').split(';')[0]!.trim().toLowerCase()
  const inline = !download && INLINE_OK.has(mime)
  return new NextResponse(Buffer.from(doc.b64, 'base64'), {
    headers: {
      // Тип из белого списка — либо поток байтов. SVG сюда намеренно не входит:
      // это XML, который умеет выполнять скрипт, и как картинку его отдать нельзя.
      'content-type': inline ? mime : 'application/octet-stream',
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(doc.title)}"`,
      'cache-control': 'private, max-age=2592000, immutable',
      'x-content-type-options': 'nosniff',
      // Даже если что-то из списка окажется исполняемым, выполнять ему будет нечего:
      // ни скриптов, ни запросов наружу, ни встраивания в чужую страницу.
      'content-security-policy':
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'none'; sandbox",
    },
  })
}
