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
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const rows = await sql`
    SELECT title, mime, encode(data, 'base64') AS b64 FROM documents
    WHERE id = ${Number(id)} AND company_id = ${await companyScope()}`
  const doc = rows[0] as { title: string; mime: string; b64: string } | undefined
  if (!doc) return new NextResponse('Not found', { status: 404 })

  // ?download=1 → force a save-to-computer; otherwise open inline in the browser tab.
  const download = new URL(_req.url).searchParams.has('download')
  const mime = (doc.mime || '').split(';')[0]!.trim().toLowerCase()
  const inline = !download && INLINE_OK.has(mime)
  return new NextResponse(Buffer.from(doc.b64, 'base64'), {
    headers: {
      // Тип из белого списка — либо поток байтов. SVG сюда намеренно не входит:
      // это XML, который умеет выполнять скрипт, и как картинку его отдать нельзя.
      'content-type': inline ? mime : 'application/octet-stream',
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(doc.title)}"`,
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
      // Даже если что-то из списка окажется исполняемым, выполнять ему будет нечего:
      // ни скриптов, ни запросов наружу, ни встраивания в чужую страницу.
      'content-security-policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'none'; sandbox",
    },
  })
}
