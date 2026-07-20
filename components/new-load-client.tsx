'use client'

// New-load page: a compact "scan rate con" bar on top of the manual form. Drop a
// PDF/photo → the same pipeline the /import page uses (Gemini reads it) fills the
// form below. Manual entry still works if you skip the scan.
// ponytail: the scan orchestration mirrors ImportClient.handle — both lean on the
// shared lib fns (extractPdf/aiParseRateCon), so the real logic isn't duplicated,
// only the ~30 lines of glue.

import { useRef, useState } from 'react'
import type { TruckRecord } from '@/lib/map'
import { extractPdf, looksScanned } from '@/lib/pdf-text'
import { missingFields, toQrLoad, type RateConFields } from '@/lib/ratecon'
import { aiParseRateCon, fileToBase64 } from '@/lib/ratecon-ai'
import { uploadDocument } from '@/app/actions'
import { notify } from '@/lib/notify'
import { LoadForm } from '@/components/load-form'
import { Info } from '@/components/info'

export function NewLoadClient({
  trucks,
  defaultTruckId,
}: {
  trucks: TruckRecord[]
  defaultTruckId?: number
}) {
  const [fields, setFields] = useState<RateConFields | null>(null)
  const [docId, setDocId] = useState<number | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [ai, setAi] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [scanKey, setScanKey] = useState(0) // remount the form to load a fresh scan
  const reqId = useRef(0)

  async function handle(file: File | undefined) {
    if (!file) return
    const my = ++reqId.current
    setError(null)
    setBusy(true)
    setAi('idle')
    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
      const isImage = file.type.startsWith('image/')
      if (!isPdf && !isImage) throw new Error('Нужен PDF или фото rate confirmation.')

      // Nothing shows until the AI answers — text PDFs still extract their text
      // first (cheaper to send than the raw file), scans/photos send the file itself.
      let text = ''
      if (isPdf) {
        text = (await extractPdf(file)).text
        if (reqId.current !== my) return
      }
      const hasText = isPdf && !looksScanned(text)

      // Save the RC as a document — attached to the load on save.
      setDocId(undefined)
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', 'ratecon')
      void uploadDocument(fd).then((r) => {
        if (reqId.current === my && 'id' in r) setDocId(r.id)
      })

      setAi('loading')
      const input = hasText
        ? { text }
        : { pdfBase64: await fileToBase64(file), mime: isImage ? file.type : 'application/pdf' }
      const res = await aiParseRateCon(input)
      if (reqId.current !== my) return

      if (res.ok) {
        setFields(res.fields)
        setScanKey((k) => k + 1)
        setAi('done')
        notify('ok', 'Rate con распознан — проверь поля', file.name)
      } else {
        throw new Error(
          res.reason === 'no_key'
            ? 'ИИ не настроен — добавь GEMINI_API_KEY на сервер.'
            : `Не распознался: ${res.detail ?? 'ИИ недоступен'}. Попробуй ещё раз.`,
        )
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      notify('error', `Не прочитался: ${msg}`, file.name)
    } finally {
      if (reqId.current === my) setBusy(false)
    }
  }

  function reset() {
    reqId.current++
    setFields(null)
    setDocId(undefined)
    setAi('idle')
    setError(null)
    setScanKey((k) => k + 1)
  }

  const badge =
    ai === 'loading' ? (
      <span className="animate-pulse rounded-full bg-haul-500/15 px-2 py-0.5 text-[10px] font-medium text-haul-400">
        ИИ читает…
      </span>
    ) : ai === 'done' ? (
      <span className="rounded-full bg-good-500/15 px-2 py-0.5 text-[10px] font-medium text-good-400">
        ✓ Распознано ИИ
      </span>
    ) : null

  return (
    <>
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          handle(e.dataTransfer.files[0])
        }}
        className={`mb-4 flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-colors ${
          drag ? 'border-haul-500/50 bg-haul-500/[0.07]' : 'border-haul-500/30 bg-haul-500/[0.06] hover:bg-haul-500/10'
        }`}
      >
        <input
          type="file"
          accept="application/pdf,.pdf,image/*"
          className="hidden"
          onChange={(e) => handle(e.target.files?.[0])}
        />
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-haul-500/20 text-[20px]">
          {busy ? '⏳' : '📷'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[14px] font-semibold text-haul-200">
            {busy ? 'Читаю rate con…' : 'Сканировать rate con — заполнить автоматически'}
            {badge}
          </div>
          <div className="text-[12px] text-white/60">
            Перетащи или выбери PDF/фото от брокера — ИИ распознает и заполнит поля ниже. Сканы
            тоже читаются.
          </div>
        </div>
        <Info text="Тот же распознаватель, что на странице «Rate con»: Google Gemini читает документ и заполняет форму. Работает с любым шаблоном и со сканами. Документ отправляется в Gemini." />
      </label>

      {error && <p className="mb-3 text-[13px] text-bad-400">{error}</p>}
      {fields && (
        <div className="mb-3 flex items-center gap-3 text-[12px] text-white/60">
          <span>Форма заполнена из rate con — проверь и сохрани.</span>
          <button onClick={reset} className="text-white/55 hover:text-white/85">
            очистить / другой файл
          </button>
        </div>
      )}

      <LoadForm
        key={scanKey}
        trucks={trucks}
        defaultTruckId={defaultTruckId}
        initial={fields ? toQrLoad(fields) : undefined}
        source={fields ? 'qr' : 'manual'}
        needsAttention={fields ? missingFields(fields) : []}
        docId={docId}
      />
    </>
  )
}
