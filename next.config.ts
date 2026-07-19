import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {
    serverActions: {
      // Document upload goes through a server action; default cap is 1MB and a
      // scanned rate con or a photo is bigger. Hard cap enforced again in the action.
      bodySizeLimit: '10mb',
    },
  },
}

export default config
