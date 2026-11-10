import { after, NextResponse, type NextRequest } from 'next/server'
import { geminiKey, aiModelPref } from '@/lib/keys'
import { getLocale } from '@/lib/i18n-server'
import { companyScope, getCurrentUser } from '@/lib/session'
import { t } from '@/lib/i18n'
import { buildParts, claimJob, createJob, documentFile, jobState, runJob, type JobInput, type ReadInput } from '@/lib/ratecon-read'

export const dynamic = 'force-dynamic'

// Чтение Rate Con — фоновой задачей (lib/ratecon-read.ts объясняет почему):
//   POST {docId, text?} | {text} | {pdfBase64, mime, text?} → {job}   (сразу)
//   GET  ?job=N → {status:'working'} | {ok:true, fields, model} | {error}
// Ни один запрос браузера не длится дольше пары секунд, поэтому прокси хостинга
// больше не успевает оборвать его своей HTML-страницей.
//
// Sits behind the auth middleware — но одного middleware мало: с открытым доступом он
// пропускает и без входа, а демо открыто всем. Ключ Gemini у компании один, поэтому
// своя проверка: читать документы может только вошедший и не в демо.
type Body = { text?: string; pdfBase64?: string; mime?: string; docId?: number }

async function guard(): Promise<NextResponse | null> {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: t(await getLocale(), 'actions.signInRequired') }, { status: 401 })
  if (user.isDemo) return NextResponse.json({ error: t(await getLocale(), 'actions.demoAiOff') }, { status: 403 })
  if (user.isWorkspace) return NextResponse.json({ error: t(await getLocale(), 'actions.workspaceAiOff') }, { status: 403 })
  return null
}

export async function POST(req: NextRequest) {
  const denied = await guard()
  if (denied) return denied

  const key = await geminiKey()
  if (!key) return NextResponse.json({ error: 'no_key' }, { status: 503 })

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }

  const companyId = await companyScope()
  const input = await inputFor({ docId: body.docId, text: body.text }, companyId)
  if (input === 'not_found') return NextResponse.json({ error: 'doc_not_found' }, { status: 404 })
  if (body.pdfBase64 && !body.docId) {
    input.fileBase64 = body.pdfBase64
    input.mime = body.mime
  }
  if (!buildParts(input)) return NextResponse.json({ error: 'empty' }, { status: 400 })

  // Всё, что зависит от запроса (вход, язык, настройки), — до ответа: после ответа
  // cookies уже не прочитать.
  const opts = { key, locale: await getLocale(), quality: (await aiModelPref()) === 'quality' }
  // Подхватить задачу другим процессом можно, только если всё нужное лежит в базе:
  // файл, присланный строкой (без docId), туда не пишется — тогда и текст не храним,
  // иначе подхват прочёл бы один текстовый слой вместо скана.
  const job = await createJob(companyId, body.docId ? { docId: body.docId, text: body.text } : body.pdfBase64 ? {} : { text: body.text })
  after(() => runJob(job, input, opts))
  return NextResponse.json({ job })
}

/** Что читать: документ из базы (по docId, только своей компании) и/или текст. */
async function inputFor(j: JobInput, companyId: string): Promise<ReadInput | 'not_found'> {
  const input: ReadInput = { text: j.text }
  if (j.docId) {
    const doc = await documentFile(Number(j.docId), companyId)
    if (!doc) return 'not_found'
    input.fileBase64 = doc.b64
    input.mime = doc.mime
  }
  return input
}

export async function GET(req: NextRequest) {
  const denied = await guard()
  if (denied) return denied
  const job = Number(req.nextUrl.searchParams.get('job'))
  if (!job) return NextResponse.json({ error: 'no_job' }, { status: 400 })
  const companyId = await companyScope()
  const state = await jobState(job, companyId)
  if (!state) return NextResponse.json({ error: 'job_not_found' }, { status: 404 })
  // Процесс с задачей умер (пульс молчит) — этот опрос забирает её себе и читает заново.
  if (state.orphan && (await claimJob(job))) {
    const key = await geminiKey()
    const input = key ? await inputFor(state.orphan, companyId) : 'not_found'
    if (key && input !== 'not_found') {
      const opts = { key, locale: await getLocale(), quality: (await aiModelPref()) === 'quality' }
      after(() => runJob(job, input, opts))
    }
  }
  if (state.status === 'working') return NextResponse.json({ status: 'working' })
  if (state.status === 'done') return NextResponse.json({ ok: true, fields: state.fields, model: state.model })
  const locale = await getLocale()
  return NextResponse.json(
    { error: state.error === 'stale' ? t(locale, 'rateconAi.stale') : state.error },
    { status: 502 },
  )
}
