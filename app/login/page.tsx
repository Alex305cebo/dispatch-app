import { sql } from '@/lib/db'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  // First run (no accounts yet) gets the "create the admin" form instead of sign-in
  // — the only door in is the one the owner walks through themselves.
  // is_demo excluded — the seeded public-demo account (lib/demo.ts) always exists,
  // and must never make a fresh install think an admin has already been created.
  const rows = await sql`SELECT 1 FROM users WHERE is_demo = FALSE LIMIT 1`
  return <LoginForm bootstrap={rows.length === 0} />
}
