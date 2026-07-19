import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dispatch — Load Profit',
    short_name: 'Dispatch',
    description: 'Take it or leave it: what a load actually nets on the truck.',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#08090d',
    theme_color: '#08090d',
    icons: [
      { src: '/icon', sizes: '192x192', type: 'image/png' },
      { src: '/icon', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
