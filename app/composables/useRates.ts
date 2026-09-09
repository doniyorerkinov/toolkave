/**
 * Exchange rates, fetched straight from the browser.
 *
 * Both sources send `Access-Control-Allow-Origin: *`, so no server route is
 * needed and no Worker invocation is spent. That keeps the currency converter
 * inside the same browser-only promise as every other tool.
 *
 * CBU (Central Bank of Uzbekistan) is primary: it is the official UZS rate,
 * the number people here expect to see, and covers 70-odd currencies.
 * open.er-api.com is the fallback and covers ~160.
 *
 * Neither needs an API key. Note that exchangerate.host, which the plan
 * mentioned, now requires one.
 */

export interface RateTable {
  /** Units of the currency per 1 USD. */
  rates: Record<string, number>
  /** Date the source published these rates. */
  date: string
  source: 'cbu' | 'erapi'
}

const CBU_URL = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/'
const ERAPI_URL = 'https://open.er-api.com/v6/latest/USD'

const CACHE_KEY = 'toolkave:rates'

interface CbuRow {
  Ccy: string
  Rate: string
  Date: string
}

/**
 * CBU quotes everything against the som, so rates are rebased onto USD to give
 * one consistent table. UZS itself is added explicitly since CBU does not list
 * its own currency.
 */
async function fetchCbu(): Promise<RateTable> {
  const response = await fetch(CBU_URL)
  if (!response.ok) throw new Error(`cbu ${response.status}`)

  const rows = (await response.json()) as CbuRow[]
  const perUzs: Record<string, number> = {}
  for (const row of rows) {
    const value = Number(row.Rate)
    if (row.Ccy && Number.isFinite(value) && value > 0) perUzs[row.Ccy] = value
  }

  const usdPerUzs = perUzs.USD
  if (!usdPerUzs) throw new Error('cbu: no USD rate')

  const rates: Record<string, number> = { USD: 1, UZS: usdPerUzs }
  for (const [code, somPerUnit] of Object.entries(perUzs)) {
    if (code === 'USD') continue
    rates[code] = usdPerUzs / somPerUnit
  }

  const raw = rows[0]?.Date ?? ''
  // CBU returns DD.MM.YYYY.
  const [d, m, y] = raw.split('.')
  const date = y && m && d ? `${y}-${m}-${d}` : raw

  return { rates, date, source: 'cbu' }
}

async function fetchErApi(): Promise<RateTable> {
  const response = await fetch(ERAPI_URL)
  if (!response.ok) throw new Error(`erapi ${response.status}`)

  const data = (await response.json()) as {
    result: string
    rates: Record<string, number>
    time_last_update_utc: string
  }
  if (data.result !== 'success') throw new Error('erapi: unsuccessful')

  const date = new Date(data.time_last_update_utc)
  return {
    rates: data.rates,
    date: Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10),
    source: 'erapi'
  }
}

function readCache(): RateTable | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RateTable & { fetchedAt: number }
    // Rates are published once a day; an hour old is plenty fresh.
    if (Date.now() - parsed.fetchedAt > 3_600_000) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(table: RateTable) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...table, fetchedAt: Date.now() }))
  } catch {
    // Storage can be full or blocked; the table still works for this visit.
  }
}

/**
 * Rates for the session. Tries the cache, then CBU, then open.er-api.
 * Only public exchange-rate data crosses the network - never anything the user
 * typed.
 */
export function useRates() {
  const table = ref<RateTable | null>(null)
  const pending = ref(false)
  const failed = ref(false)

  async function load(force = false) {
    if (pending.value) return
    pending.value = true
    failed.value = false

    if (!force) {
      const cached = readCache()
      if (cached) {
        table.value = cached
        pending.value = false
        return
      }
    }

    try {
      table.value = await fetchCbu()
      writeCache(table.value)
    } catch {
      try {
        table.value = await fetchErApi()
        writeCache(table.value)
      } catch {
        failed.value = true
      }
    } finally {
      pending.value = false
    }
  }

  return { table, pending, failed, load }
}

/** Convert between two currencies using a USD-based table. */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number | null {
  const fromRate = rates[from]
  const toRate = rates[to]
  if (!fromRate || !toRate || !Number.isFinite(amount)) return null
  return (amount / fromRate) * toRate
}
