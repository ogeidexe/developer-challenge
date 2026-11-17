// Client-side sorters and filters for antd Tables that hold the whole list in memory (inbox, dashboard,
// administration, items). The request list sorts and filters on the server instead.
import type { ColumnFilterItem } from 'antd/es/table/interface'

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

/** Accent- and case-insensitive text order (pt-BR). */
export const byText =
  <T>(get: (row: T) => string | null | undefined) =>
  (a: T, b: T) =>
    collator.compare(get(a) ?? '', get(b) ?? '')

/** Decimal strings ("4899.90") and numbers. */
export const byNumber =
  <T>(get: (row: T) => string | number | null | undefined) =>
  (a: T, b: T) =>
    Number(get(a) ?? 0) - Number(get(b) ?? 0)

/** ISO dates; empty values last. */
export const byDate =
  <T>(get: (row: T) => string | null | undefined) =>
  (a: T, b: T) =>
    (get(a) ? Date.parse(get(a)!) : Number.MAX_SAFE_INTEGER) - (get(b) ? Date.parse(get(b)!) : Number.MAX_SAFE_INTEGER)

/** antd `filters` built from the distinct values of a column. */
export function distinctFilters<T>(
  rows: T[] | undefined,
  get: (row: T) => string,
  label = (v: string) => v,
): ColumnFilterItem[] {
  return [...new Set((rows ?? []).map(get))].sort(collator.compare).map((v) => ({ text: label(v), value: v }))
}
