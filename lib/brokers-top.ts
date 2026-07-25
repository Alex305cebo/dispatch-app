// A curated starter list of the biggest US freight brokers, by name only — NO MC
// numbers baked in, because a wrong MC on a known broker is worse than none. When
// FMCSA_WEBKEY is set, resolveTopBrokers() looks each name up live (FMCSA name
// search) to fill in the real MC/DOT/authority and cache it in `brokers`.
//
// Ranking source: Transport Topics "Top Freight Brokerage Firms" 2025.

export type TopBroker = { name: string; hq: string }

export const TOP_BROKERS: TopBroker[] = [
  { name: 'C.H. Robinson', hq: 'MN' },
  { name: 'Total Quality Logistics', hq: 'OH' },
  { name: 'J.B. Hunt Transport Services', hq: 'AR' },
  { name: 'RXO', hq: 'NC' },
  { name: 'Coyote Logistics', hq: 'IL' },
  { name: 'Echo Global Logistics', hq: 'IL' },
  { name: 'Landstar System', hq: 'FL' },
  { name: 'Uber Freight', hq: 'CA' },
  { name: 'Worldwide Express', hq: 'TX' },
  { name: 'Arrive Logistics', hq: 'TX' },
  { name: 'Hub Group', hq: 'IL' },
  { name: 'Schneider Logistics', hq: 'WI' },
  { name: 'England Logistics', hq: 'UT' },
  { name: 'Nolan Transportation Group', hq: 'GA' },
  { name: 'Molo Solutions', hq: 'IL' },
  { name: 'Redwood Logistics', hq: 'IL' },
  { name: 'BlueGrace Logistics', hq: 'FL' },
  { name: 'Circle Logistics', hq: 'IN' },
  { name: 'Armstrong Transport Group', hq: 'NC' },
  { name: 'Allen Lund Company', hq: 'CA' },
  { name: 'Trinity Logistics', hq: 'DE' },
  { name: 'Loadsmart', hq: 'IL' },
  { name: 'ITS Logistics', hq: 'NV' },
  { name: 'Choptank Transport', hq: 'MD' },
  { name: 'PLS Logistics Services', hq: 'PA' },
  { name: 'MODE Global', hq: 'TX' },
  { name: 'Sunset Transportation', hq: 'MO' },
  { name: 'Kingsgate Logistics', hq: 'OH' },
  { name: 'R2 Logistics', hq: 'FL' },
  { name: 'Surge Transportation', hq: 'FL' },
  { name: 'Priority1', hq: 'AR' },
  { name: 'AFN Logistics', hq: 'IL' },
  { name: 'Steam Logistics', hq: 'TN' },
  { name: 'Axle Logistics', hq: 'TN' },
  { name: 'Command Transportation', hq: 'IL' },
  { name: 'Tucker Company Worldwide', hq: 'NJ' },
]
