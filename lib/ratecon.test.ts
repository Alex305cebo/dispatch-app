import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRateCon, toQrLoad, missingFields, formatDriverInfo } from './ratecon.ts'

// Typical broker rate con. Note the traps: an insurance limit far larger than the
// rate, a line-haul figure that is NOT the total, and "Total Miles" which must not
// be mistaken for a "Total" amount.
const TYPICAL = `
RATE CONFIRMATION
ABC Logistics LLC   MC# 123456
Phone: (555) 123-4567    Email: dispatch@abclogistics.com
Load #: 998877

PICK UP
Shipper: Acme Warehouse
1200 Industrial Blvd
Chicago, IL 60601
Pickup Date: 07/20/2026

DELIVERY
Consignee: Beta Distribution
900 Commerce St
Dallas, TX 75201
Delivery Date: 07/22/2026

Total Miles: 1075
Line Haul: $2,200.00
Fuel Surcharge: $200.00
Total Rate: $2,400.00

Carrier must maintain cargo insurance of $100,000.00 at all times.
`

test('reads a typical rate con', () => {
  const f = parseRateCon(TYPICAL)
  assert.equal(f.rate?.value, 2400)
  assert.equal(f.loadedMiles?.value, 1075)
  assert.equal(f.origin?.value, 'Chicago, IL')
  assert.equal(f.destination?.value, 'Dallas, TX')
  assert.equal(f.mcNumber?.value, '123456')
  assert.equal(f.brokerPhone?.value, '(555) 123-4567')
  assert.equal(f.brokerEmail?.value, 'dispatch@abclogistics.com')
  assert.equal(f.referenceId?.value, '998877')
  assert.equal(f.pickupDate?.value, '2026-07-20')
  assert.equal(f.deliveryDate?.value, '2026-07-22')
})

// The single most dangerous failure: quoting the insurance limit as the rate. A
// dispatcher would never double-check a number the app printed confidently.
test('never mistakes the insurance limit for the rate', () => {
  assert.notEqual(parseRateCon(TYPICAL).rate?.value, 100000)
})

test('prefers the total over line haul, wherever each sits', () => {
  assert.equal(parseRateCon(TYPICAL).rate?.value, 2400)
  // Total absent → line haul is the best available answer.
  const lineHaulOnly = 'Line Haul: $1,850.00\nFuel Surcharge: $150.00'
  assert.equal(parseRateCon(lineHaulOnly).rate?.value, 1850)
})

test('"Total Miles" is not a dollar total', () => {
  const f = parseRateCon('Total Miles: 1075\nCarrier Pay: $1,900.00')
  assert.equal(f.rate?.value, 1900)
  assert.equal(f.loadedMiles?.value, 1075)
})

test('bare "Total" needs both a colon and a dollar sign', () => {
  assert.equal(parseRateCon('Total: $2,400.00').rate?.value, 2400)
  // Would otherwise swallow a declared-value table.
  assert.equal(parseRateCon('Declared Value Total 100,000').rate, null)
})

test('the RATE CONFIRMATION heading is not a reference number', () => {
  const f = parseRateCon('RATE CONFIRMATION\nBroker: XYZ Freight\nOrder # A-4471')
  assert.equal(f.referenceId?.value, 'A-4471')
})

test('missing fields are null, never invented', () => {
  const f = parseRateCon('Some broker paperwork with no useful labels at all.')
  assert.equal(f.rate, null)
  assert.equal(f.loadedMiles, null)
  assert.equal(f.origin, null)
  assert.equal(f.destination, null)
  assert.deepEqual(missingFields(f).sort(), ['deadheadMiles', 'loadedMiles', 'rate', 'transitDays'])
})

test('deadhead is always flagged; transit days come from the rate con dates', () => {
  const gaps = missingFields(parseRateCon(TYPICAL))
  assert.ok(gaps.includes('deadheadMiles')) // depends on the truck, never the document
  // TYPICAL carries both pickup and delivery dates, so transit days are derived, not flagged.
  assert.ok(!gaps.includes('transitDays'))
  assert.ok(!gaps.includes('rate')) // this one WAS found
})

test('evidence quotes the source line so the human can check it', () => {
  const f = parseRateCon(TYPICAL)
  assert.match(f.rate!.evidence, /Total Rate/)
  assert.match(f.origin!.evidence, /Chicago/)
})

test('feeds the same LoadForm the QR path uses', () => {
  const load = toQrLoad(parseRateCon(TYPICAL))
  assert.equal(load.rate, 2400)
  assert.equal(load.loadedMiles, 1075)
  assert.equal(load.origin, 'Chicago, IL')
  assert.equal(load.transitDays, 2) // 07/20 → 07/22, straight from the rate con dates
  assert.equal(load.deadheadMiles, 0)
})

test('an alternate broker layout still yields the money', () => {
  const alt = `
CARRIER CONFIRMATION SHEET
Reference: BK-55231
Origin: Shipper Location
  Laredo, TX 78045
Destination: Receiver Dock
  Atlanta, GA 30301
Distance: 942
Agreed Rate: $3,100.00
`
  const f = parseRateCon(alt)
  assert.equal(f.rate?.value, 3100)
  assert.equal(f.loadedMiles?.value, 942)
  assert.equal(f.origin?.value, 'Laredo, TX')
  assert.equal(f.destination?.value, 'Atlanta, GA')
  assert.equal(f.referenceId?.value, 'BK-55231')
})

// ─── Shapes taken from REAL rate cons. Every assertion below started as a bug. ───

// Five Star Logistics / project44 report: no "$" anywhere, amount labelled PAYABLE,
// currency written after the number.
test('real: PAYABLE 1,600.00 USD is a rate', () => {
  const f = parseRateCon('Rate\nIn Execution |\nPAYABLE 1,600.00 USD WEBSETTLE HOLDS --')
  assert.equal(f.rate?.value, 1600)
})

test('real: "Total Distance 718 mi" is mileage, not a dollar total', () => {
  const f = parseRateCon('Total Distance 718 mi\nPAYABLE 1,600.00 USD')
  assert.equal(f.loadedMiles?.value, 718)
  assert.equal(f.rate?.value, 1600)
})

// FLS Transportation: dollar sign AFTER the currency code.
test('real: "Totals USD$ 4,000.00" beats "LineHaul Fixed Cost USD$ 4000.00"', () => {
  const f = parseRateCon('LineHaul Fixed Cost USD$ 4000.00\nTotals USD$ 4,000.00')
  assert.equal(f.rate?.value, 4000)
})

// FLS spells states out; the app stores two-letter codes.
test('real: states spelled out are normalized ("South Dakota" → SD)', () => {
  const f = parseRateCon('Pickup# 1: ACTUS NUTRITION 2002 SD HWY 314, YANKTON, South Dakota\n-YANKTON 57078')
  assert.equal(f.origin?.value, 'YANKTON, SD')
})

// The letterhead lists the broker's own address under a "Shipper" table header,
// while the real route sits under "Origin" pages later.
test('real: "Origin" outranks a "Shipper" letterhead header', () => {
  const doc = `Shipper Carrier
Current Type TENDER LOAD ELGIN, IL 60124 US ELGIN, IL 60124 US
Origin ST. CHARLES TRADING, INC.
8AM-4PM (CST), FCFS //
ELGIN, IL US
Destination BLENDTECH, INC.
WICHITA, KS US`
  const f = parseRateCon(doc)
  assert.equal(f.origin?.value, 'ELGIN, IL')
  assert.equal(f.destination?.value, 'WICHITA, KS')
})

// Legal boilerplate contains the word "origin" and ", in" — which read as a city in
// Indiana. This is the exact string that produced "OR BROKER'S CUSTOMER, IN".
test('real: legal boilerplate is not a route', () => {
  const f = parseRateCon(
    'WITH A BROKEN SEAL AND/OR WITH EVIDENCE OF TAMPERING, THE LOAD IS REFUSED BY ' +
      "CONSIGNEE OR BROKER'S CUSTOMER, IN WHICH CASE CARRIER PAYS.",
  )
  assert.equal(f.origin, null)
  assert.equal(f.destination, null)
})

// A third real layout: stops introduced by "Pick up Address:" / "Delivery Address:",
// a bare "Rate: $1,700.00", and the load id written "LOAD ID: #S4139751".
const ADDRESS_STYLE = `LOAD ID: #S4139751

Pick up Address:

BSH Home Appliances Corporation

Executive Parkway #300
New Bern, NC 28562

__________________________
Time: 07/16/2026 | 13:00
__________________________
Ref: SID: 928427188,
BOL: 2212154237

Delivery Address:

LOWE'S GREER SC BDC #3461

Inland Parkway #21
Greer, SC 29651

_______________________
Time: 07/17/2026 | 17:00
_______________________
Rate: $1,700.00
Commodity: Home Appliances
Weight: 16,228 lbs`

test('real: "Pick up Address:" / "Delivery Address:" layout', () => {
  const f = parseRateCon(ADDRESS_STYLE)
  assert.equal(f.rate?.value, 1700)
  assert.equal(f.origin?.value, 'New Bern, NC')
  assert.equal(f.destination?.value, 'Greer, SC')
  assert.equal(f.referenceId?.value, 'S4139751') // "#" between the colon and the id
  assert.equal(f.pickupDate?.value, '2026-07-16') // 200-char reach to "Time:"
})

// THE dangerous one. This layout carries "Ref: Pickup#: 18999631" INSIDE the pickup
// block; matching that bare "Pickup#" made the parser walk past the pickup city and
// report the DELIVERY city as the origin. Swapped trip ends look completely normal
// on screen — nothing about "Nashville, NC" says "this is the wrong end".
test('real: a "Pickup#" inside a Ref block never swaps the trip ends', () => {
  const f = parseRateCon(`LOAD ID: #560002236

Pick up Address:

SEA GARDEN CITY-ECOMM

140 Prosperity Dr
Garden City, GA 31408

__________________________
Time: 07/15/26 | 12:00 Appt.
__________________________
Ref: Pickup#: 18999631
__________________________

Delivery Address:

CLAYTON NASHVILLE BG 976

1001 Eastern Ave
Nashville, NC 27856

_______________________
Time: 07/16/26 | 08:00 Appt
_______________________
Rate: $1,600.00`)
  assert.equal(f.origin?.value, 'Garden City, GA') // two-word city, kept whole
  assert.equal(f.destination?.value, 'Nashville, NC')
  assert.equal(f.rate?.value, 1600)
  assert.equal(f.pickupDate?.value, '2026-07-15') // 2-digit year
})

test('real: "Rate:" needs its dollar sign — a heading is not a rate', () => {
  assert.equal(parseRateCon('RATE CONFIRMATION\nBroker: XYZ').rate, null)
  assert.equal(parseRateCon('Rate / mile $2.15').rate, null)
  assert.equal(parseRateCon('Rate: $1,700.00').rate?.value, 1700)
})

// ─── Driver Information: the block the dispatcher copies into the driver's chat ───

test('driver info reproduces the stop verbatim, refs and all', () => {
  const out = formatDriverInfo(parseRateCon(ADDRESS_STYLE))
  assert.match(out, /^LOAD ID: #S4139751$/m)
  assert.match(out, /^Pick up Address:$/m)
  assert.match(out, /^BSH Home Appliances Corporation$/m)
  assert.match(out, /^Executive Parkway #300$/m)
  assert.match(out, /^New Bern, NC 28562$/m)
  assert.match(out, /^Time: 07\/16\/2026 \| 13:00$/m)
  assert.match(out, /^Greer, SC 29651$/m)
  assert.match(out, /^Rate: \$1,700\.00$/m)
  assert.match(out, /^Commodity: Home Appliances$/m)
  assert.match(out, /^Weight: 16,228 lbs$/m)
})

test('driver info puts a blank line between the facility name and its address', () => {
  const out = formatDriverInfo(parseRateCon(ADDRESS_STYLE))
  // The driver matches the name against the sign and types the address into the GPS —
  // run together they read as one paragraph on a phone at the gate.
  assert.match(out, /^BSH Home Appliances Corporation\n\nExecutive Parkway #300$/m)
})

test('a stop that starts with a street number is left alone', () => {
  // No facility name printed: splitting after line 1 would strand "1200" from
  // "Industrial Blvd" and read as two separate places.
  const out = formatDriverInfo(parseRateCon(TYPICAL))
  assert.doesNotMatch(out, /^\d+\n\n/m)
})

test('driver info keeps a multi-line Ref whole', () => {
  const out = formatDriverInfo(parseRateCon(ADDRESS_STYLE))
  // Without the no-'m'-flag fix the capture stopped at the first newline and only
  // "SID:" survived — the driver would arrive missing the BOL.
  assert.match(out, /Ref: SID: 928427188,/)
  assert.match(out, /BOL: 2212154237/)
})

test('driver info falls back to the city when a layout has no quotable block', () => {
  // project44-style: stop data lives in a wide table, not an address block.
  const table = `Load ID 190648962 FIVE STAR LOGISTICS
Shipper Carrier
Current Type TENDER LOAD ELGIN, IL 60124 US
Origin ST. CHARLES TRADING, INC.
Density -- 8AM-4PM (CST), FCFS //
ELGIN, IL US
Comments
Pieces 620
Destination BLENDTECH, INC.
WICHITA, KS US Pallets 16
PAYABLE 1,600.00 USD`
  const out = formatDriverInfo(parseRateCon(table))
  // Each stop's city must be present and correct (a richer company+city block is fine).
  assert.match(out, /Pick up Address:[\s\S]*?ELGIN, IL/)
  assert.match(out, /Delivery Address:[\s\S]*?WICHITA, KS/)
  assert.match(out, /Rate: \$1,600\.00/)
  // The table must never reach the driver.
  for (const junk of ['Pieces 620', 'Max Lading', 'Density', 'Pallets', 'Current Type']) {
    assert.ok(!out.includes(junk), `table content leaked into driver info: ${junk}`)
  }
})

test('driver info never invents a rate it did not find', () => {
  const out = formatDriverInfo(parseRateCon('Pick up Address:\n\nAcme\nReno, NV 89501'))
  assert.ok(!/Rate:/.test(out), 'printed a Rate line with no rate in the document')
})

test('real: a document with no mileage says so instead of guessing', () => {
  const f = parseRateCon('Totals USD$ 4,000.00\nEquipment: 53\' Dry Van Trailer Weight: 42945 lbs')
  assert.equal(f.rate?.value, 4000)
  assert.equal(f.loadedMiles, null)
})
