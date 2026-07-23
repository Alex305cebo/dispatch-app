import { ImageResponse } from 'next/og'

export const size = { width: 192, height: 192 }
export const contentType = 'image/png'

// Generated at build time instead of hand-drawn PNGs — next/og is already here via Next.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(140deg, #6d5ae8 0%, #34d99b 100%)',
          color: '#fff',
          fontSize: 116,
          fontWeight: 700,
          letterSpacing: -6,
        }}
      >
        D
      </div>
    ),
    size,
  )
}
