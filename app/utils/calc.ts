/**
 * Pure calculation helpers shared by the calculator and converter tools.
 * No Vue or Nuxt imports, so they stay directly testable.
 */

/* ------------------------------------------------------------------ */
/* Percentages and VAT                                                 */
/* ------------------------------------------------------------------ */

export function percentOf(percent: number, value: number): number {
  return (percent / 100) * value
}

export function whatPercent(part: number, whole: number): number | null {
  if (!whole) return null
  return (part / whole) * 100
}

export function percentChange(from: number, to: number): number | null {
  if (!from) return null
  return ((to - from) / Math.abs(from)) * 100
}

export function applyDiscount(price: number, percent: number) {
  const saved = (percent / 100) * price
  return { saved, final: price - saved }
}

/**
 * VAT both ways. `inclusive` means the price already contains the tax, which is
 * how prices are quoted in Uzbekistan and most of Europe - getting this
 * backwards is the single most common mistake in VAT calculators.
 */
export function vat(amount: number, rate: number, inclusive: boolean) {
  if (inclusive) {
    const net = amount / (1 + rate / 100)
    return { net, tax: amount - net, gross: amount }
  }
  const tax = (rate / 100) * amount
  return { net: amount, tax, gross: amount + tax }
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

export interface AgeParts {
  years: number
  months: number
  days: number
  totalDays: number
  totalWeeks: number
  totalMonths: number
}

/**
 * Add whole months, clamping to the end of a shorter target month, so
 * 31 January + 1 month is 28 February rather than spilling into March.
 */
function addMonths(date: Date, count: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + count, 1)
  const daysInTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(date.getDate(), daysInTarget))
  return target
}

/**
 * Calendar-aware difference between two dates.
 *
 * Works by advancing `start` in whole clamped months and then counting the
 * remaining days, rather than subtracting the fields and borrowing. Borrowing
 * breaks whenever the source day is longer than the borrowed month: 31 January
 * to 1 March would come out as minus two days.
 *
 * Consequence worth knowing: someone born on 29 February is a year older on
 * 28 February in a common year, which is how date libraries and most
 * jurisdictions treat it.
 */
export function dateDifference(from: Date, to: Date): AgeParts | null {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null

  const start = from <= to ? from : to
  const end = from <= to ? to : from

  // The naive count is either exact or one too many, never too few.
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  if (addMonths(start, months) > end) months -= 1

  const anchor = addMonths(start, months)
  const msPerDay = 86_400_000
  // Rounded, not floored: the inputs are local midnights, so the difference is
  // a whole number of days give or take a daylight-saving hour.
  const days = Math.round((end.getTime() - anchor.getTime()) / msPerDay)
  const totalDays = Math.round((end.getTime() - start.getTime()) / msPerDay)

  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days,
    totalDays,
    totalWeeks: Math.floor(totalDays / 7),
    totalMonths: months
  }
}

/* ------------------------------------------------------------------ */
/* BMI                                                                 */
/* ------------------------------------------------------------------ */

export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese'

export function bmi(kg: number, cm: number): { value: number; category: BmiCategory } | null {
  if (kg <= 0 || cm <= 0) return null
  const metres = cm / 100
  const value = kg / (metres * metres)

  let category: BmiCategory = 'normal'
  if (value < 18.5) category = 'underweight'
  else if (value < 25) category = 'normal'
  else if (value < 30) category = 'overweight'
  else category = 'obese'

  return { value, category }
}

/** The weight range that would put this height in the normal BMI band. */
export function healthyWeightRange(cm: number): { min: number; max: number } | null {
  if (cm <= 0) return null
  const metres = cm / 100
  return { min: 18.5 * metres * metres, max: 24.9 * metres * metres }
}

/* ------------------------------------------------------------------ */
/* Loans                                                               */
/* ------------------------------------------------------------------ */

export interface LoanResult {
  monthly: number
  totalPaid: number
  totalInterest: number
}

/**
 * Standard annuity payment. A zero rate is handled separately because the
 * formula divides by the rate, which would produce NaN for an interest-free
 * loan - a real case for instalment plans.
 */
export function loan(principal: number, annualRate: number, months: number): LoanResult | null {
  if (principal <= 0 || months <= 0) return null

  if (annualRate === 0) {
    const monthly = principal / months
    return { monthly, totalPaid: principal, totalInterest: 0 }
  }

  const r = annualRate / 100 / 12
  const factor = (1 + r) ** months
  const monthly = (principal * r * factor) / (factor - 1)
  const totalPaid = monthly * months

  return { monthly, totalPaid, totalInterest: totalPaid - principal }
}

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

export type UnitCategory = 'length' | 'weight' | 'temperature' | 'area' | 'volume' | 'speed'

/** Factors are "how many base units in one of this unit". */
export const UNITS: Record<UnitCategory, Record<string, number>> = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  weight: { mg: 0.000001, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237 },
  temperature: { c: 1, f: 1, k: 1 },
  area: { cm2: 0.0001, m2: 1, km2: 1_000_000, ha: 10_000, ft2: 0.09290304, ac: 4046.8564224 },
  volume: { ml: 0.001, l: 1, m3: 1000, gal: 3.785411784, qt: 0.946352946, floz: 0.0295735295625 },
  speed: { mps: 1, kmh: 0.2777777777777778, mph: 0.44704, kn: 0.5144444444444445 }
}

/** Temperature is offset-based, so it cannot use the factor table. */
function convertTemperature(value: number, from: string, to: string): number {
  let celsius = value
  if (from === 'f') celsius = ((value - 32) * 5) / 9
  else if (from === 'k') celsius = value - 273.15

  if (to === 'f') return (celsius * 9) / 5 + 32
  if (to === 'k') return celsius + 273.15
  return celsius
}

export function convertUnit(
  value: number,
  category: UnitCategory,
  from: string,
  to: string
): number | null {
  if (!Number.isFinite(value)) return null
  if (category === 'temperature') return convertTemperature(value, from, to)

  const table = UNITS[category]
  const fromFactor = table[from]
  const toFactor = table[to]
  if (!fromFactor || !toFactor) return null

  return (value * fromFactor) / toFactor
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** Trim to a sensible number of significant digits without scientific notation. */
export function tidyNumber(value: number, maxDecimals = 6): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'

  const abs = Math.abs(value)
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 4 : maxDecimals

  return Number(value.toFixed(decimals))
    .toLocaleString('en-US', { maximumFractionDigits: decimals })
    .replace(/,/g, ' ')
}
