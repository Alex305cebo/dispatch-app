import fs from 'node:fs'
const raw = {
  stops: [
    { role: 'pickup', city: 'Kansas City', company: 'AM&C- Kansas City', refs: [], state: 'KS', street: '1700 Kansas Ave', time: '08/31/26 09:30-14:00', zip: '66105' },
    { role: 'delivery', city: 'Pasadena', company: 'BAYPORT POLYMERS LLC', refs: ['4502554052'], state: 'TX', street: '12212 Port Road', time: '09/01/26 08:00-15:00', zip: '77507' },
  ],
  brokerEmail: 'LoadDocs@CHRobinson.com', brokerName: 'C.H. Robinson', brokerPhone: '(312) 944-7277',
  commodity: 'Silica', deliveryDate: '09/01/2026', importantNotes: 'x', loadedMiles: null, mcNumber: null,
  payVia: null, pickupDate: '08/31/2026', rate: 2050, referenceId: '566268741', weight: '10,000 lbs',
}
const mod: any = await import('./lib/ratecon-ai-contract.ts')
console.log('экспорты:', Object.keys(mod).join(', '))
const { aiToFields } = await import('./lib/ratecon-ai.ts').catch(() => ({} as any))
const f = (mod.aiToFields ?? aiToFields)?.(raw as any, 'gemini-3.1-flash-lite', 'ru')
console.log('origin:', JSON.stringify(f?.origin))
console.log('destination:', JSON.stringify(f?.destination))
console.log('pickupAddress:', JSON.stringify(f?.pickupAddress))
console.log('loadedMiles:', JSON.stringify(f?.loadedMiles))
