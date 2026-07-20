import { sql } from '@/lib/db'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  // First run (no accounts yet) gets the "create the admin" form instead of sign-in
  // — the only door in is the one the owner walks through themselves.
  const rows = await sql`SELECT 1 FROM users LIMIT 1`
  return <LoginForm bootstrap={rows.length === 0} />
}
