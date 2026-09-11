import {
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Flame,
  Snowflake,
  ThermometerSnowflake,
  Tornado,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import type { WeatherKind } from '@/lib/weather-label'

// Одна иконка на вид погоды — Lucide, как везде в приложении, а не эмодзи, которые
// на каждой платформе рисуются по-своему и кричат громче самого предупреждения.
const ICON: Record<WeatherKind, LucideIcon> = {
  tornado: Tornado,
  hurricane: Wind,
  blizzard: CloudSnow,
  ice: Snowflake,
  snow: CloudSnow,
  cold: ThermometerSnowflake,
  heat: Flame,
  wind: Wind,
  storm: CloudLightning,
  flood: CloudRain,
  fog: CloudFog,
  dust: Wind,
  fire: Flame,
  other: TriangleAlert,
}

export function WeatherIcon({ kind, size = 12 }: { kind: WeatherKind; size?: number }) {
  const I = ICON[kind]
  return <I size={size} strokeWidth={2.2} className="relative -top-px inline shrink-0" aria-hidden />
}
