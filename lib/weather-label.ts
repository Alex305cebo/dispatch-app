// Погодное предупреждение человеческим языком.
//
// api.weather.gov отдаёт название события по-английски и канцелярской формулировкой:
// «Extreme Heat Warning», «Wind Chill Advisory». На русском интерфейсе это читалось
// как непонятная угроза красным — пугает, а что делать, не говорит. Здесь сырое
// название сводится к короткому понятному ярлыку, значку и одной строке о том, чем
// это грозит траку. Тон красный только там, где рейс реально останавливают.
//
// Чистый модуль без базы: тестируется голым node.

export type WeatherKind =
  | 'tornado'
  | 'hurricane'
  | 'blizzard'
  | 'ice'
  | 'snow'
  | 'cold'
  | 'heat'
  | 'wind'
  | 'storm'
  | 'flood'
  | 'fog'
  | 'dust'
  | 'fire'
  | 'other'

/** Порядок важен: «ice storm» должен поймать лёд, а не общую бурю. */
const RULES: [RegExp, WeatherKind][] = [
  [/tornado/i, 'tornado'],
  [/hurricane|tropical storm|typhoon/i, 'hurricane'],
  [/blizzard/i, 'blizzard'],
  [/ice storm|freezing rain|freezing drizzle|ice accretion/i, 'ice'],
  [/winter storm|winter weather|snow|lake effect/i, 'snow'],
  [/wind chill|extreme cold|cold weather/i, 'cold'],
  [/heat/i, 'heat'],
  [/wind/i, 'wind'],
  [/thunderstorm|hail|squall/i, 'storm'],
  [/flood/i, 'flood'],
  [/fog/i, 'fog'],
  [/dust|blowing sand/i, 'dust'],
  [/fire weather|red flag/i, 'fire'],
]

/** Красный только там, где рейс реально останавливают; остальное жёлтым. */
const BAD = new Set<WeatherKind>(['tornado', 'hurricane', 'blizzard', 'ice'])

export const WEATHER_ICON: Record<WeatherKind, string> = {
  tornado: '🌪',
  hurricane: '🌀',
  blizzard: '🌨',
  ice: '🧊',
  snow: '❄',
  cold: '🥶',
  heat: '🔥',
  wind: '💨',
  storm: '⛈',
  flood: '🌊',
  fog: '🌫',
  dust: '🏜',
  fire: '🔥',
  other: '⚠',
}

export function weatherKind(event: string): WeatherKind {
  for (const [re, kind] of RULES) if (re.test(event)) return kind
  return 'other'
}

export function weatherTone(kind: WeatherKind): 'bad' | 'warn' {
  return BAD.has(kind) ? 'bad' : 'warn'
}
