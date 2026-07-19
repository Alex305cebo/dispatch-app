// 'server-only' makes any client component that transitively imports this module
// fail at BUILD with a clear message — instead of the old runtime "DATABASE_URL is
// not set" throw in the browser. Every db-touching lib flows through here, so this
// one guard covers the whole server/client boundary.
import 'server-only'
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error(
    'DATABASE_URL is not set. Create a free Neon project, then put the connection ' +
      'string in .env.local (see .env.local.example) and in Vercel env vars.',
  )
}

// Tagged template — sql`... ${id} ...` parameterizes automatically, so there is
// nothing for an ORM to protect us from here.
export const sql = neon(url)
