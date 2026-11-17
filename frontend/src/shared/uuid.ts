// RFC 4122 v4 UUID that also works on plain HTTP. `crypto.randomUUID()` exists only in secure contexts
// (HTTPS, localhost); on a site served over http:// (e.g. a demo at http://host:8080) it is undefined, and calling
// it threw before any request was sent ("Falha inesperada", nothing in the Network tab). `getRandomValues` is
// available in every context, so it is the fallback.
export function uuid(): string {
  const c = globalThis.crypto
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  c.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
