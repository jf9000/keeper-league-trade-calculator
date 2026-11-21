/**
 * Careful HTTP for the build script: only known hosts over HTTPS, a generic user-agent,
 * timeouts, size caps, no redirects, and bounded retries that honor Retry-After.
 */

/** Every host this project is allowed to talk to. Anything else is refused. */
const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'api.myfantasyleague.com', // MFL's documented, public ADP export
  'fantasyfootballcalculator.com', // FFC's public ADP API
  'api.sleeper.app', // Sleeper's public, read-only API
])

// Deliberately generic: identifies the tool, not the person running it.
export const USER_AGENT = 'keeper-trade-calculator-build-script'

export function assertAllowedUrl(raw: string): URL {
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new Error(`Refusing non-HTTPS URL for ${url.hostname}`)
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error(`Refusing request to unlisted host: ${url.hostname}`)
  return url
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Seconds from a Retry-After header, capped so a bad value can't stall the build. */
function retryDelayMs(res: Response, attempt: number): number {
  const secs = Number(res.headers.get('retry-after'))
  const ms = Number.isFinite(secs) && secs > 0 ? secs * 1000 : 2000 * 2 ** attempt
  return Math.min(ms, 30_000)
}

export async function fetchJson<T>(rawUrl: string, opts: { maxBytes?: number } = {}): Promise<T> {
  const url = assertAllowedUrl(rawUrl)
  const maxBytes = opts.maxBytes ?? 5_000_000
  const MAX_RETRIES = 2

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
      redirect: 'error', // a redirect could point somewhere off the allowlist
    })
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      await sleep(retryDelayMs(res, attempt))
      continue
    }
    if (res.status === 429) {
      throw new Error(`${url.hostname} is rate-limiting this client (429). Wait a while and try again.`)
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url.hostname}`)

    const declared = Number(res.headers.get('content-length'))
    if (declared > maxBytes) throw new Error(`Response from ${url.hostname} is larger than ${maxBytes} bytes`)
    const text = await res.text()
    if (text.length > maxBytes) throw new Error(`Response from ${url.hostname} is larger than ${maxBytes} bytes`)
    return JSON.parse(text) as T // data only: parsed, never evaluated
  }
}
