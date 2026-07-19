// Photo if the driver has one uploaded, else initials on a gradient — same visual
// language as the app logo circle in the sidebar. Server-safe: no hooks, works both
// in server-rendered lists and inside client components like DriverCard.

function initialsOf(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function DriverAvatar({
  truckId,
  name,
  hasPhoto,
  size = 40,
}: {
  truckId: number
  name: string | null
  hasPhoto: boolean
  size?: number
}) {
  if (hasPhoto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/driver-photo/${truckId}`}
        alt={name ?? 'Водитель'}
        className="shrink-0 rounded-full object-cover ring-1 ring-white/10"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-haul-500/35 to-good-500/25 font-semibold text-white/80 ring-1 ring-white/10"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.34)) }}
    >
      {initialsOf(name)}
    </div>
  )
}
