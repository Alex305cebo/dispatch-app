'use client'

// Drop a rate con on the TRUCK page: parse (AI) → auto-create a load on THIS truck →
// attach the RC → show Driver Info + warnings, all without a manual form. The star
// of the "everything in one place, fewer clicks" redesign.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import Link from 'next/link'
import { extractPdf, looksScanned } from '@/lib/pdf-text'
import { formatDriverInfo, toQrLoad, type RateConFields } from '@/lib/ratecon'
import { aiParseRateCon, fileToBase64 } from '@/lib/ratecon-ai'
import { rcWarnings, type RcWarning } from '@/lib/rc-warnings'
import { createLoadFromRc, uploadDocument } from '@/app/actions'
import { notify } from '@/lib/notify'
import { BrokerCheckPanel } from '@/components/broker-check'

type Result = {
  loadId: number
  fields: RateConFields
  warnings: RcWarning[]
  docId?: number
  fileName: string
}

const WTONE = {
  danger: 'bg-bad-500/12 text-bad-400',
  warn: 'bg-warn-400/12 text-warn-400',
  info: 'bg-white/6 text-white/70',
}

export function TruckRcDrop({ truckId }: { truckId: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [drag, setDrag] = useState(false)
  const [res, setRes] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startCopy] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  // Kept so "Повторить" can re-run the same file without asking to re-pick it.
  const [lastFile, setLastFile] = useState<File | undefined>(undefined)

  // A scanned rate con through Gemini really can take 60-90s. Without a visible,
  // ticking sign of life the page looks frozen — and a reload mid-flight loses the
  // load (the document is already saved by then, the load isn't created yet).
  useEffect(() => {
    if (!busy) return
    setElapsed(0)
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [busy])

  async function handle(file: File | undefined) {
    if (!file) return
    setLastFile(file)
    setError(null)
    setBusy(true)
    setStage('Читаю файл…')
    setRes(null)
    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
      const isImage = file.type.startsWith('image/')
      if (!isPdf && !isImage) throw new Error('Нужен PDF или фото rate confirmation.')

      // 1) text (for warnings + cheap AI input) when it's a text PDF
      let text = ''
      if (isPdf) text = (await extractPdf(file)).text
      const hasText = isPdf && !looksScanned(text)

      // 2) save the RC as a document on this truck
      setStage('Сохраняю документ…')
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', 'ratecon')
      fd.append('truckId', String(truckId))
      const up = await uploadDocument(fd)
      const docId = 'id' in up ? up.id : undefined

      // 3) AI read (text for text-PDF, the file itself for scans/photos) — the only
      // recognizer that ever creates a load here; no regex fallback (a wrong guess
      // shouldn't get to auto-create a load, only a checked one should).
      setStage(hasText ? 'Распознаю ИИ…' : 'Распознаю скан через ИИ — это до полутора минут…')
      const aiInput = hasText
        ? { text }
        : { pdfBase64: await fileToBase64(file), mime: isImage ? file.type : 'application/pdf' }
      // One automatic retry before bothering the dispatcher — a slow scan is usually
      // just slow, not a real failure, and this clears most of them silently.
      let ai = await aiParseRateCon(aiInput)
      if (!ai.ok) {
        setStage('Не получилось с первого раза — пробую ещё раз…')
        await new Promise((r) => setTimeout(r, 1500))
        ai = await aiParseRateCon(aiInput)
      }
      if (!ai.ok) {
        throw new Error(ai.reason === 'no_key' ? 'ИИ временно недоступен — обратись к администратору.' : `Не распознался: ${ai.detail ?? 'ИИ недоступен'}. Попробуй ещё раз.`)
      }

      // 4) create the load on THIS truck, attach the RC
      setStage('Создаю груз…')
      const made = await createLoadFromRc(truckId, toQrLoad(ai.fields), docId)
      if ('error' in made) throw new Error(made.error)

      setRes({
        loadId: made.loadId,
        fields: ai.fields,
        warnings: rcWarnings(ai.fields, text),
        docId,
        fileName: file.name,
      })
      notify('ok', 'Груз создан из rate con', file.name)
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      notify('error', `Не прочитался: ${msg}`)
    } finally {
      setBusy(false)
      setStage('')
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (res) {
    const driverInfo = formatDriverInfo(res.fields)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-good-400">
            ✓ Груз создан · проверено ИИ
          </span>
          <div className="flex gap-2">
            <Link
              href={`/loads/${res.loadId}`}
              className="rounded-lg bg-haul-500 px-3 py-1.5 text-[12px] font-semibold hover:bg-haul-400"
            >
              Открыть груз
            </Link>
            <button
              onClick={() => setRes(null)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-white/75 hover:bg-white/5"
            >
              ещё RC
            </button>
          </div>
        </div>

        {/* The rate con itself: view it, or save a copy to the computer. It's already
            stored on the server with the load; this is a local copy. */}
        {res.docId && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-white/55">Rate confirmation:</span>
            <a
              href={`/view/${res.docId}`}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-semibold text-white/85 hover:bg-white/5"
            >
              Открыть
            </a>
            <a
              href={`/api/docs/${res.docId}?download=1`}
              download={res.fileName || 'rate-con.pdf'}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-semibold text-white/85 hover:bg-white/5"
            >
              Сохранить на компьютер
            </a>
          </div>
        )}

        {res.warnings.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
              Проверь по грузу
            </p>
            <ul className="flex flex-col gap-1.5">
              {res.warnings.map((w, i) => (
                <li key={i} className={`rounded-lg px-3 py-2 text-[13px] ${WTONE[w.level]}`}>
                  {w.level === 'danger' ? '⛔ ' : w.level === 'warn' ? '⚠ ' : 'ℹ '}
                  {w.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        <BrokerCheckPanel fields={res.fields} />

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/62">
              Driver Information
            </p>
            <button
              onClick={() =>
                startCopy(async () => {
                  try {
                    await navigator.clipboard.writeText(driverInfo)
                    notify('ok', 'Скопировано — можно слать водителю')
                  } catch {
                    notify('warn', 'Браузер не дал буфер — выдели вручную')
                  }
                })
              }
              className="rounded-lg bg-haul-500 px-3 py-1 text-[12px] font-semibold hover:bg-haul-400"
            >
              Копировать
            </button>
          </div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-ink-900/60 p-3 font-mono text-[12px] leading-relaxed text-white/85">
            {driverInfo}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <motion.label
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
      animate={{ scale: drag ? 1.01 : 1 }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${
        drag ? 'border-haul-500/60 bg-haul-500/10' : 'border-white/15 hover:border-white/30'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf,image/*"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      {busy ? (
        <>
          <span className="flex items-center gap-2 text-[14px] font-medium">
            <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-white/25 border-t-haul-400" />
            {stage}
            <span className="nums text-white/55">{elapsed}с</span>
          </span>
          <span className="mt-1 text-[12px] font-medium text-warn-400">
            Не закрывай и не обновляй страницу — груз создастся в конце.
          </span>
        </>
      ) : (
        <>
          <span className="text-[14px] font-medium">＋ Rate con → сразу груз на этот трак</span>
          <span className="mt-0.5 text-[12px] text-white/55">
            PDF или фото. ИИ распознает, создаст груз и покажет, что проверить.
          </span>
        </>
      )}
      {error && (
        <span className="mt-2 flex flex-col items-center gap-1.5">
          <span className="text-[12px] text-bad-400">{error}</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handle(lastFile)
            }}
            className="rounded-lg bg-haul-500 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-haul-400"
          >
            ↻ Повторить сканирование
          </button>
        </span>
      )}
    </motion.label>
  )
}
