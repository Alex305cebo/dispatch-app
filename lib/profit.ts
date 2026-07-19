// Load economics for US truckload. All money in USD, all rates per mile.
// ponytail: plain floats, not integer cents — this is a go/no-go estimate on
// a broker's quoted rate, not a settlement ledger. Move to cents when this
// math starts feeding driver pay or invoices.

export type DriverPay =
  | { mode: 'cpm'; centsPerMile: number }
  | { mode: 'percent'; percentOfGross: number }

export type TruckSettings = {
  mpg: number
  fuelPricePerGallon: number
  /** Paid on ALL miles (loaded + deadhead) in cpm mode. */
  driverPay: DriverPay
  /** Truck note/lease — per day on the road. ~$1,200–2,400/mo for a used Class 8. */
  truckPaymentPerDay: number
  /** Primary liability + cargo + physical damage — per day. ~$900–1,600/mo for an owner-operator with their own authority. */
  insurancePerDay: number
  /** ELD subscription + IRP/IFTA/state permits + plates — per day. ~$220–340/mo combined. */
  eldPermitsPerDay: number
  /** Tires, oil, brakes, the eventual in-frame. ~$0.15–0.25 is realistic. */
  maintenanceCostPerMile: number
  factoringPercent: number
  dispatchPercent: number
}

export type Load = {
  rate: number
  loadedMiles: number
  deadheadMiles: number
  transitDays: number
}

export type Breakdown = {
  gross: number
  totalMiles: number
  fuel: number
  driver: number
  maintenance: number
  truckPayment: number
  insurance: number
  eldPermits: number
  factoring: number
  dispatch: number
  totalCost: number
  net: number
  allInRpm: number
  loadedRpm: number
  netPerDay: number
  marginPercent: number
  /** Rate at which this load nets exactly zero. Below it you pay to haul. */
  breakEvenRate: number
}

export function calcLoad(load: Load, s: TruckSettings): Breakdown {
  if (!(s.mpg > 0)) throw new Error('MPG must be greater than 0')
  if (!(load.loadedMiles > 0)) throw new Error('Loaded miles must be greater than 0')
  if (load.deadheadMiles < 0) throw new Error('Deadhead miles cannot be negative')
  if (!(load.transitDays > 0)) throw new Error('Transit days must be greater than 0')
  if (load.rate < 0) throw new Error('Rate cannot be negative')

  const driverCut = s.driverPay.mode === 'percent' ? s.driverPay.percentOfGross : 0
  const grossCutPercent = driverCut + s.factoringPercent + s.dispatchPercent
  if (grossCutPercent >= 100) {
    throw new Error('Driver + factoring + dispatch cuts must total under 100% of gross')
  }

  const gross = load.rate
  const totalMiles = load.loadedMiles + load.deadheadMiles

  const fuel = (totalMiles / s.mpg) * s.fuelPricePerGallon
  const driver =
    s.driverPay.mode === 'cpm'
      ? totalMiles * (s.driverPay.centsPerMile / 100)
      : gross * (s.driverPay.percentOfGross / 100)
  const maintenance = totalMiles * s.maintenanceCostPerMile
  const truckPayment = load.transitDays * s.truckPaymentPerDay
  const insurance = load.transitDays * s.insurancePerDay
  const eldPermits = load.transitDays * s.eldPermitsPerDay
  const factoring = gross * (s.factoringPercent / 100)
  const dispatch = gross * (s.dispatchPercent / 100)

  const totalCost = fuel + driver + maintenance + truckPayment + insurance + eldPermits + factoring + dispatch
  const net = gross - totalCost

  // Costs that don't scale with gross, divided by the share of gross we keep.
  const flatCosts =
    fuel + maintenance + truckPayment + insurance + eldPermits + (s.driverPay.mode === 'cpm' ? driver : 0)
  const breakEvenRate = flatCosts / (1 - grossCutPercent / 100)

  return {
    gross,
    totalMiles,
    fuel,
    driver,
    maintenance,
    truckPayment,
    insurance,
    eldPermits,
    factoring,
    dispatch,
    totalCost,
    net,
    allInRpm: gross / totalMiles,
    loadedRpm: gross / load.loadedMiles,
    netPerDay: net / load.transitDays,
    marginPercent: gross > 0 ? (net / gross) * 100 : 0,
    breakEvenRate,
  }
}
