import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLoadHash, parseLoadHash, missingForAnalysis, EMPTY, type QrLoad } from './qr-load.ts'

const full: QrLoad = {
  rate: 2400,
  loadedMiles: 1075,
  deadheadMiles: 75,
  transitDays: 2,
  origin: 'Chicago, IL',
  destination: 'Dallas, TX',
  truckLocation: 'Joliet, IL',
  spotRpm: 2.15,
  brokerMc: '123456',
  brokerEmail: 'ops@broker.com',
  brokerPhone: '(555) 123-4567',
  referenceId: '9911',
}

// The invariant that keeps the extension and the app in sync: whatever one
// encodes, the other decodes identically. Break the contract on either side and
// this fails instead of a load silently arriving with the wrong rate.
test('round-trips every field', () => {
  assert.deepEqual(parseLoadHash(buildLoadHash(full)), full)
})

test('round-trips through a real hash fragment, commas and all', () => {
  const url = new URL(`https://app.example/load#${buildLoadHash(full)}`)
  assert.deepEqual(parseLoadHash(url.hash), full)
})

// Pins the wire format to what the extension actually emits (its buildQrUrl in
// DispatchPro extension/content/dat-one.js). The two live in different repos, so
// this literal is the only thing standing between a renamed param and a load
// arriving with a silently missing rate.
test('parses the exact hash the extension builds', () => {
  const fromExtension =
    '#rate=2400&miles=1075&dh=75&spot=2.15&origin=Chicago%2C+IL&dest=Dallas%2C+TX' +
    '&truck=Joliet%2C+IL&mc=123456&email=ops%40broker.com&phone=%28555%29+123-4567&ref=9911'
  // Note the absent `days`: a load board cannot know transit days, so the extension
  // never sends them and the default stands until the dispatcher says otherwise.
  assert.deepEqual(parseLoadHash(fromExtension), { ...full, transitDays: 1 })
})

test('absent fields fall back to defaults, not garbage', () => {
  // What a "Call for rate" listing looks like: no rate, no deadhead, no days.
  const parsed = parseLoadHash(buildLoadHash({ loadedMiles: 500, origin: 'Reno, NV' }))
  assert.equal(parsed.loadedMiles, 500)
  assert.equal(parsed.origin, 'Reno, NV')
  assert.equal(parsed.rate, 0)
  assert.equal(parsed.deadheadMiles, 0)
  assert.equal(parsed.transitDays, 1)
  assert.equal(parsed.spotRpm, null)
  assert.equal(parsed.brokerMc, null)
})

test('zero rate survives — "Call for rate" is not the same as a missing param', () => {
  assert.equal(parseLoadHash(buildLoadHash({ ...full, rate: 0 })).rate, 0)
})

test('a mangled number never becomes a fabricated one', () => {
  const parsed = parseLoadHash('#rate=abc&miles=&spot=NaN&dh=1e999')
  assert.equal(parsed.rate, 0) // not NaN
  assert.equal(parsed.loadedMiles, 0)
  assert.equal(parsed.spotRpm, null)
  assert.equal(parsed.deadheadMiles, 0) // Infinity rejected
})

test('empty hash yields EMPTY', () => {
  assert.deepEqual(parseLoadHash(''), EMPTY)
  assert.deepEqual(parseLoadHash('#'), EMPTY)
})

test('reports exactly what calcLoad would throw on', () => {
  assert.deepEqual(missingForAnalysis(full), [])
  assert.deepEqual(missingForAnalysis(EMPTY), ['loadedMiles'])
  assert.deepEqual(missingForAnalysis({ ...full, transitDays: 0 }), ['transitDays'])
})
