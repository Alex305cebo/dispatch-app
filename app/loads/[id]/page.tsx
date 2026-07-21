import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLoad, listDocs, truckForLoad } from '@/lib/loads'
import { truckLabel } from '@/lib/map'
import { calcLoad } from '@/lib/profit'
import { getCompany } from '@/lib/invoice'
import { fleetStatusByUnit } from '@/lib/maintenance'
import { loadMapData } from '@/lib/load-map'
import { FleetMap } from '@/components/fleet-map'
import { Analysis } from '@/components/analysis'
import { LoadEditNumbers } from '@/components/load-edit-numbers'
import { BrokerNotes } from '@/components/broker-notes'
import { TruckForm } from '@/components/truck-form'
import { DocList, DocUpload } from '@/components/docs'
import { InvoiceBox } from '@/components/invoice-actions'
import { RateConButton } from '@/components/ratecon-button'
import { BackButton } from '@/components/back-button'
import { Info } from '@/components/info'
import { StatusPicker } from './status-picker'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const load = await getLoad(Number(id))
  if (!load) notFound()
  // The load's OWN truck — money is computed with the economics of the truck that
  // hauls it, not some global default.
  const truck = await truckForLoad(load)

  // Never throws: the DB CHECKs mirror calcLoad's throw conditions, so every stored
  // row is a valid input by construction.
  const r = calcLoad(load, truck)
  const docs = await listDocs({ loadId: load.id })
  const invoiceDoc = docs.find((d) => d.kind === 'invoice')
  const rateConDoc = docs.find((d) => d.kind === 'ratecon')
  // Needed to tell the dispatcher up front if an invoice can even be built.
  const company = await getCompany()

  // This load's own map — truck → pickup → delivery for THIS load specifically,
  // not just whatever the truck page happens to call its "current" assignment.
  const fleet = await fleetStatusByUnit()
  const fs = truck.number ? fleet.get(truck.number) : undefined
  const { markers: mapMarkers, routes: mapRoutes, etaText } = await loadMapData(load, truck, fs)

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <BackButton href="/loads" label="Грузы" />

      {/* ===== HERO: route, truck, status and the rate — one card, not four loose pieces ===== */}
      <section className="relative mt-3 overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-b from-ink-800/80 to-ink-950 p-5 sm:p-8">
        <h1 className="text-[22px] font-semibold sm:text-[26px]">
          {load.origin ?? '—'} → {load.destination ?? '—'}
        </h1>
        <p className="mt-1.5 text-[13px] text-white/65">
          <Link href={`/trucks/${truck.id}`} className="text-haul-400 hover:underline">
            {truckLabel(truck)}
          </Link>
          {' · '}
          {load.source === 'qr' ? 'Пришёл с DAT по QR' : 'Добавлен вручную'}
          {load.referenceId && ` · Ref ${load.referenceId}`}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusPicker id={load.id} current={load.status} />
          {rateConDoc ? (
            <RateConButton docId={rateConDoc.id} />
          ) : (
            <span className="text-[12px] text-white/45">
              Rate con не прикреплён — загрузи его ниже, в документах груза.
            </span>
          )}
        </div>

        <div className="mt-5 border-t border-white/8 pt-5">
          <h2 className="mb-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            Ставка за груз
            <Info text="Сверху — общая ставка за груз. Ниже строкой — что остаётся чистыми и минимальная ставка. Все расходы (топливо по MPG и цене дизеля, водитель, платёж за трак, страховка, ELD/пермиты, обслуживание, факторинг, диспетч) спрятаны под «Нажмите, чтобы увидеть все расходы»." />
          </h2>
          <Analysis r={r} mpg={truck.mpg} spotRpm={load.spotRpm} />
        </div>
      </section>

      {/* This load's assignment on the map — truck's live GPS, pickup (while still
          booked), delivery, and the road route between them. */}
      {mapMarkers.length > 0 && (
        <section className="panel mt-4 p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            На карте
            <Info text="Где сейчас трак и куда ему ехать по этому грузу: пикап (пока груз не забран) и доставка, маршрут по дорогам между ними." />
            {etaText && <span className="ml-auto text-[11px] font-normal normal-case text-white/55">{etaText}</span>}
          </h2>
          <FleetMap markers={mapMarkers} routes={mapRoutes} height={280} />
        </section>
      )}

      {/* Broker's must-read instructions — below the map, above the load's own
          details, expanded by default while unread so it can't be missed. */}
      <div className="mt-4">
        <BrokerNotes
          loadId={load.id}
          notes={load.brokerNotes}
          readAt={load.notesReadAt}
          hasRc={!!rateConDoc}
        />
      </div>

      <section className="panel mt-4 p-5">
        <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          Детали
        </h2>
        <LoadEditNumbers
          load={{
            id: load.id,
            rate: load.rate,
            loadedMiles: load.loadedMiles,
            deadheadMiles: load.deadheadMiles,
            transitDays: load.transitDays,
            spotRpm: load.spotRpm,
            brokerMc: load.brokerMc,
            brokerPhone: load.brokerPhone,
            brokerEmail: load.brokerEmail,
            truckLocation: load.truckLocation,
            pickupDate: load.pickupDate,
            deliveryDate: load.deliveryDate,
          }}
        />
      </section>

      {/* The truck economics that drive every cost line above — editable inline. */}
      <details className="group mt-4">
        <summary className="panel flex cursor-pointer list-none items-center gap-1.5 p-4 text-[13px] font-semibold text-white/72 transition-colors hover:text-white">
          <span className="text-white/40 transition-transform group-open:rotate-90">▸</span>
          Расходы трака — из чего считаются строки выше
          <Info text="Топливо, водитель, обслуживание, фикс и факторинг у каждого груза этого трака считаются из этих настроек × мили и дни. Меняешь — все расчёты пересчитываются. Это настройки трака, они действуют на все его грузы." />
        </summary>
        <div className="mt-2">
          <TruckForm
            id={truck.id}
            initial={{
              number: truck.number ?? '',
              driverName: truck.driverName ?? '',
              mpg: truck.mpg,
              fuelPricePerGallon: truck.fuelPricePerGallon,
              driverPay: truck.driverPay,
              truckPaymentPerDay: truck.truckPaymentPerDay,
              insurancePerDay: truck.insurancePerDay,
              eldPermitsPerDay: truck.eldPermitsPerDay,
              maintenanceCostPerMile: truck.maintenanceCostPerMile,
              factoringPercent: truck.factoringPercent,
              dispatchPercent: truck.dispatchPercent,
            }}
          />
        </div>
      </details>

      <section className="panel mt-4 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            Инвойс брокеру
            <Info text="Собирает счёт брокеру: инвойс + rate con + POD в один PDF-пакет, готовый к отправке или факторингу. Нужен загруженный POD (без него брокер не платит). После — отметь «Оплачено», когда деньги пришли; неоплаченные видны в разделе Финансы." />
          </h2>
          {load.paidAt && (
            <span className="rounded-full bg-good-500/15 px-2 py-0.5 text-[11px] font-medium text-good-400">
              оплачен {load.paidAt.slice(0, 10)}
            </span>
          )}
        </div>
        <InvoiceBox
          loadId={load.id}
          invoiceNumber={load.invoiceNumber}
          invoiceDocId={invoiceDoc?.id ?? null}
          paid={!!load.paidAt}
          companyReady={!!(company.name && company.mcdot)}
        />
        <p className="mt-2 text-[12px] text-white/50">
          Пакет = инвойс + rate con + POD одним PDF. Нужен загруженный POD.
        </p>
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          Документы груза
          <Info text="Все бумаги по этому грузу: rate con, BOL, POD, инвойс. Загружай PDF или фото. POD, присланный водителем в Telegram, прилетает сюда автоматически. Клик по документу — открыть/скачать." />
        </h2>
        <DocUpload loadId={load.id} />
        <DocList docs={docs} />
      </section>
    </main>
  )
}
