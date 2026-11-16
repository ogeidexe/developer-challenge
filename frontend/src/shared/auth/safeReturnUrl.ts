// SEC-F02 (CWE-601): `returnUrl` comes from the query string, so anyone can craft a login link with it.
// Only same-origin, app-relative paths are honoured; everything else falls back to the dashboard.
// This also neutralises GHSA-wrjc-x8rr-h8h6 (React Router 6: open redirect via backslash in useNavigate),
// which has no 6.x fix.
export function safeReturnUrl(raw: string | null | undefined): string {
  if (!raw) return '/'
  // must be a path ("/x"), never protocol-relative ("//host"), never with a backslash ("/\host" is "//host" to
  // browsers), never with control characters (browsers strip tabs/newlines: "/\t/host" becomes "//host")
  // eslint-disable-next-line no-control-regex -- matching control characters is the point of this check
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || /[\u0000-\u001f\u007f]/.test(raw))
    return '/'
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin) return '/'
    if (url.pathname.startsWith('/login')) return '/' // no login → login loop
    return url.pathname + url.search + url.hash
  } catch {
    return '/'
  }
}
