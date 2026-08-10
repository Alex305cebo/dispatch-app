// How one broker is told from another when a load carries no MC.
//
// Its own module, away from lib/brokers.ts, only because that file opens a database
// connection at import time — this rule is worth a test, and a test cannot load a
// module that needs DATABASE_URL to exist.

/** Free webmail is never a company: two different brokers who both use Gmail are not
 * one broker, and merging them would be worse than leaving them apart. */
const FREE_MAIL = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'aol.com',
  'icloud.com',
  'mail.ru',
  'yandex.ru',
])

/** The company part of an email address: Tyler.Simpson@chrobinson.com → chrobinson.com.
 * null for webmail and for anything that isn't an address. */
export function emailDomain(email: string | null): string | null {
  const d = (email ?? '').split('@')[1]?.toLowerCase().trim()
  return d && d.includes('.') && !FREE_MAIL.has(d) ? d : null
}
