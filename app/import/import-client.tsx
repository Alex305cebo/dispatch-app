'use client'

import { DocLink } from '@/components/doc-link'

import { Button } from '@/components/button'
import { useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { TruckRecord } from '@/lib/map'
import { extractPdf, looksScanned } from '@/lib/pdf-text'
import { formatDriverInfo, missingFields, toQrLoad, type RateConFields } from '@/lib/ratecon'
import { aiParseRateCon, fileToBase64 } from '@/lib/ratecon-ai'
import { uploadDocument } from '@/app/actions'
import { notify } from '@/lib/notify'
import { LoadForm } from '@/components/load-form'
import { BrokerCheckPanel } from '@/components/broker-check'
import { Info } from '@/components/info'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale } from '@/lib/i18n'

/** Where the fields on screen came from — shown as a badge over Driver Information.
 * Only the AI ever fills the screen now — no regex draft, not even as a fallback:
 * a wrong guess (pickup address copied into delivery, a blank load ID) shown as if
 * it were real data did more damage than an honest "try again" ever would. */
type AiState = 'idle' | 'loading' | 'done'

// Only the single-value fields. pickupStop/deliveryStop/importantNotes are whole
// text blocks shown inside Driver Information / broker notes; pickup/deliveryAddress
// only feed the map pin, not a form field.
type FoundKey = Exclude<
  keyof RateConFields,
  'pickupStop' | 'deliveryStop' | 'importantNotes' | 'pickupAddress' | 'deliveryAddress'
>

function labelsFor(locale: Locale): Record<FoundKey, string> {
  return {
    rate: t(locale, 'import.label.rate'),
    loadedMiles: t(locale, 'import.label.loadedMiles'),
    payVia: t(locale, 'import.label.payVia'),
    origin: t(locale, 'import.label.origin'),
    destination: t(locale, 'import.label.destination'),
    // Not "broker's MC": real rate cons carry the CARRIER's MC (yours) just as often.
    mcNumber: t(locale, 'import.label.mcNumber'),
    brokerName: t(locale, 'import.label.brokerName'),
    brokerPhone: t(locale, 'import.label.brokerPhone'),
    brokerEmail: t(locale, 'import.label.brokerEmail'),
    referenceId: t(locale, 'import.label.referenceId'),
    pickupDate: t(locale, 'import.label.pickupDate'),
    deliveryDate: t(locale, 'import.label.deliveryDate'),
    commodity: t(locale, 'import.label.commodity'),
    weight: t(locale, 'import.label.weight'),
  }
}

export function ImportClient({ trucks }: { trucks: TruckRecord[] }) {
  const locale = useLocale()
  const LABELS = labelsFor(locale)
  const [fields, setFields] = useState<RateConFields | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [copied, setCopied] = useState(false)
  const [ai, setAi] = useState<AiState>('idle')
  // The imported RC is saved as a document and attached to the load on save.
  const [docId, setDocId] = useState<number | undefined>(undefined)
  // "другой файл" mid-flight must not let a stale AI answer resurrect old fields.
  const reqId = useRef(0)
  // Kept so "Повторить" can re-run the same file without asking to re-pick it —
  // the doc is already uploaded either way, only the AI call needs retrying.
  const [lastFile, setLastFile] = useState<File | undefined>(undefined)

  /** One automatic retry before ever bothering the dispatcher — a slow scan is
   * usually just a slow scan, not a real failure, and a second attempt clears most
   * of them without anyone having to click anything. */
  async function parseWithRetry(input: Parameters<typeof aiParseRateCon>[0]) {
    const first = await aiParseRateCon(input, locale)
    if (first.ok) return first
    await new Promise((r) => setTimeout(r, 1500))
    return aiParseRateCon(input, locale)
  }

  async function copyDriverInfo(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
      notify('ok', t(locale, 'import.driverInfoCopied'))
    } catch {
      // Clipboard needs HTTPS or localhost; over plain http on the LAN it throws.
      notify('warn', t(locale, 'import.clipboardDenied'))
    }
  }

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
      if (!isPdf && !isImage) {
        throw new Error(t(locale, 'newLoad.needPdfOrPhoto'))
      }

      // Text PDFs feed Gemini their extracted text (cheap); scans/photos send the
      // file itself — the AI reads it directly. Either way nothing shows on screen
      // until the AI actually answers.
      let text = ''
      if (isPdf) {
        text = (await extractPdf(file)).text
        if (reqId.current !== my) return
      }
      const hasText = isPdf && !looksScanned(text)

      // Save the RC itself as a document in parallel — on load save it gets attached,
      // so the paperwork lives next to the money.
      setDocId(undefined)
      const docFd = new FormData()
      docFd.append('file', file)
      docFd.append('kind', 'ratecon')
      void uploadDocument(docFd).then((r) => {
        if (reqId.current === my && 'id' in r) setDocId(r.id)
      })

      setAi('loading')
      const input = hasText
        ? { text }
        : { pdfBase64: await fileToBase64(file), mime: isImage ? file.type : 'application/pdf' }
      const res = await parseWithRetry(input)
      if (reqId.current !== my) return

      if (res.ok) {
        setFields(res.fields)
        setAi('done')
        notify('ok', t(locale, 'import.recognizedToast'), file.name)
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

  if (fields) {
    const driverInfo = formatDriverInfo(fields)
    return (
      <>
        {/* The uploaded rate con itself — open it or save a copy to the computer.
            It's already stored on the server; this is a local copy. */}
        {docId && (
          <div className="panel mb-4 flex flex-wrap items-center gap-2 p-3">
            <span className="text-[12px] text-white/55">{t(locale, 'import.rateConLabel')}</span>
            <DocLink
              docId={docId}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-semibold text-white/85 hover:bg-white/5"
            >
              {t(locale, 'import.open')}
            </DocLink>
            <a
              href={`/api/docs/${docId}?download=1`}
              download
              className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-semibold text-white/85 hover:bg-white/5"
            >
              {t(locale, 'docView.saveToComputer')}
            </a>
          </div>
        )}
        <BrokerCheckPanel fields={fields} />
        {/* The point of the whole feature: paperwork in, driver's message out. */}
        <div className="panel mb-4 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
                Driver Information
                <Info text={t(locale, 'import.driverInfoInfo')} />
              </h2>
              {ai === 'loading' && (
                <span className="animate-pulse rounded-full bg-haul-500/15 px-2 py-0.5 text-[10px] font-medium text-haul-400">
                  {t(locale, 'newLoad.aiReading')}
                </span>
              )}
              {ai === 'done' && (
                <span className="rounded-full bg-good-500/15 px-2 py-0.5 text-[10px] font-medium text-good-400">
                  {t(locale, 'import.aiChecked')}
                </span>
              )}
            </div>
            <button
              onClick={() => copyDriverInfo(driverInfo)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                copied ? 'bg-good-500/20 text-good-400' : 'bg-haul-500 text-white hover:bg-haul-400'
              }`}
            >
              {copied ? t(locale, 'import.copied') : t(locale, 'import.copy')}
            </button>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-ink-900/60 p-3 font-mono text-[12px] leading-relaxed text-white/85">
            {driverInfo}
          </pre>
          <p className="mt-2 text-[12px] text-white/62">{t(locale, 'import.readyToSend')}</p>
        </div>

        <div className="panel mb-4 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
              {t(locale, 'import.whatWasRead')}
              <Info text={t(locale, 'import.whatWasReadInfo')} />
            </h2>
            <button
              onClick={() => {
                reqId.current++
                setFields(null)
                setAi('idle')
              }}
              className="text-[12px] text-white/62 transition-colors hover:text-white/85"
            >
              {t(locale, 'import.differentFile')}
            </button>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(Object.keys(LABELS) as FoundKey[]).map((k) => {
              const f = fields[k]
              return (
                <div
                  key={k}
                  className={`rounded-lg border px-2.5 py-1.5 ${
                    f ? 'border-white/8 bg-white/[0.02]' : 'border-amber-400/25 bg-amber-400/[0.04]'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] text-white/62">{LABELS[k]}</span>
                    <span className={`nums text-[13px] ${f ? 'text-white/85' : 'text-amber-300/70'}`}>
                      {f ? String(f.value) : t(locale, 'import.notFound')}
                    </span>
                  </div>
                  {/* The quoted source line — so a number is checkable, not just trusted. */}
                  {f && (
                    <p className="mt-0.5 truncate text-[10px] text-white/52" title={f.evidence}>
                      {f.evidence}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-white/62">{t(locale, 'import.nothingGuessed')}</p>
        </div>

        <LoadForm
          trucks={trucks}
          initial={toQrLoad(fields)}
          source="qr"
          needsAttention={missingFields(fields)}
          docId={docId}
          driverInfo={driverInfo}
        />
      </>
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
      className={`panel flex cursor-pointer flex-col items-center justify-center px-6 py-16 text-center transition-colors ${
        drag ? 'border-haul-500/50 bg-haul-500/5' : ''
      }`}
    >
      <input
        type="file"
        accept="application/pdf,.pdf,image/*"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mb-3 size-8 text-white/52"
        aria-hidden
      >
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M12 12v6M9 15l3-3 3 3" />
      </svg>
      <p className="flex items-center justify-center gap-1.5 text-[15px] font-medium">
        {busy ? t(locale, 'import.readingDocument') : t(locale, 'import.dropRateCon')}
        {!busy && <Info text={t(locale, 'import.dropInfo')} />}
      </p>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-white/65">{t(locale, 'import.dropSubtext')}</p>
      {error && (
        <div className="mt-3 max-w-sm">
          <p className="text-[13px] text-bad-400">{error}</p>
          <Button variant="primary" size="sm" className="mt-2" type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handle(lastFile)
            }}>
            {t(locale, 'import.retryScan')}
          </Button>
        </div>
      )}
    </motion.label>
  )
}
