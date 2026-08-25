'use client'

import { Button } from '@/components/button'
// New-load page: a compact "scan rate con" bar on top of the manual form. Drop a
// PDF/фото → распознавание (Gemini) → заполненная форма ниже. Без скана форма
// работает как обычная ручная.
//
// Это единственный оркестратор разбора в приложении: у страницы импорта была своя
// копия этих же тридцати строк склейки, и оба экрана делали одно и то же. Копия
// удалена, адрес /import уводит сюда. Настоящая работа всё так же в общих функциях
// (extractPdf/aiParseRateCon), здесь только склейка.

import { useRef, useState } from 'react'
import type { TruckRecord } from '@/lib/map'
import { extractPdf, looksScanned } from '@/lib/pdf-text'
import { missingFields, toQrLoad, type RateConFields } from '@/lib/ratecon'
import type { QrLoad } from '@/lib/qr-load'
import { aiParseRateCon, fileToBase64 } from '@/lib/ratecon-ai'
import { uploadDocument } from '@/app/actions'
import { notify } from '@/lib/notify'
import { LoadForm } from '@/components/load-form'
import { RcEvidence } from '@/components/rc-evidence'
import { Info } from '@/components/info'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function NewLoadClient({
  trucks,
  placeByTruck,
  defaultTruckId,
  repeat,
}: {
  trucks: TruckRecord[]
  placeByTruck?: Record<number, string>
  defaultTruckId?: number
  /** Заполнение по прошлому рейсу («Повторить груз»). Скан документа его перебивает:
   * если человек всё-таки принёс рейт-кон, бумага главнее памяти. */
  repeat?: QrLoad
}) {
  const locale = useLocale()
  const [fields, setFields] = useState<RateConFields | null>(null)
  const [docId, setDocId] = useState<number | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [ai, setAi] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [scanKey, setScanKey] = useState(0) // remount the form to load a fresh scan
  const reqId = useRef(0)
  // Kept so "Повторить" can re-run the same file without asking to re-pick it.
  const [lastFile, setLastFile] = useState<File | undefined>(undefined)

  async function handle(file: File | undefined) {
    if (!file) return
    const my = ++reqId.current
    setLastFile(file)
    setError(null)
    setBusy(true)
    setAi('idle')
    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
      const isImage = file.type.startsWith('image/')
      if (!isPdf && !isImage) throw new Error(t(locale, 'newLoad.needPdfOrPhoto'))

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
      // One automatic retry before bothering the dispatcher — a slow scan is usually
      // just slow, not a real failure.
      let res = await aiParseRateCon(input, locale)
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 1500))
        res = await aiParseRateCon(input, locale)
      }
      if (reqId.current !== my) return

      if (res.ok) {
        setFields(res.fields)
        setScanKey((k) => k + 1)
        setAi('done')
        notify('ok', t(locale, 'newLoad.recognizedToast'), file.name)
      } else {
        throw new Error(
          res.reason === 'no_key'
            ? t(locale, 'newLoad.aiUnavailable')
            : t(locale, 'newLoad.notRecognized')
                .replace('{detail}', res.detail ?? t(locale, 'newLoad.aiUnavailableShort')),
        )
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      notify('error', t(locale, 'newLoad.notReadToast').replace('{msg}', msg), file.name)
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
        {t(locale, 'newLoad.aiReading')}
      </span>
    ) : ai === 'done' ? (
      <span className="rounded-full bg-good-500/15 px-2 py-0.5 text-[10px] font-medium text-good-400">
        {t(locale, 'newLoad.aiRecognized')}
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
            {busy ? t(locale, 'newLoad.readingRateCon') : t(locale, 'newLoad.scanCta')}
            {badge}
          </div>
          <div className="text-[12px] text-white/60">{t(locale, 'newLoad.scanHint')}</div>
        </div>
        <Info text={t(locale, 'newLoad.scanInfo')} />
      </label>

      {error && (
        <div className="mb-3 flex items-center gap-3">
          <p className="text-[13px] text-bad-400">{error}</p>
          <Button variant="primary" size="sm" className="shrink-0" type="button"
            onClick={() => handle(lastFile)}>
            {t(locale, 'newLoad.retry')}
          </Button>
        </div>
      )}
      {fields && (
        <div className="mb-3 flex items-center gap-3 text-[12px] text-white/60">
          <span>{t(locale, 'newLoad.formFilled')}</span>
          <button onClick={reset} className="text-white/55 hover:text-white/85">
            {t(locale, 'newLoad.clearOtherFile')}
          </button>
        </div>
      )}

      {/* Что именно прочитано и из какой строки документа. Переехало со страницы
          импорта: она делала ровно то же самое, что и этот экран. */}
      {fields && <RcEvidence fields={fields} />}

      <LoadForm
        key={scanKey}
        trucks={trucks}
        placeByTruck={placeByTruck}
        defaultTruckId={defaultTruckId}
        initial={fields ? toQrLoad(fields) : repeat}
        source={fields ? 'qr' : 'manual'}
        needsAttention={fields ? missingFields(fields) : []}
        docId={docId}
      />
    </>
  )
}
