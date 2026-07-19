import type { NextConfig } from 'next'

const config: NextConfig = {
  // The floating "N" pill bottom-left is Next.js's own dev-mode route indicator —
  // not part of this app's UI, just development tooling chrome. Off entirely.
  devIndicators: false,
  experimental: {
    serverActions: {
      // Document upload goes through a server action; default cap is 1MB and a
      // scanned rate con or a photo is bigger. Hard cap enforced again in the action.
      bodySizeLimit: '10mb',
    },
  },
}

export default config
