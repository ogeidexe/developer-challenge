// Company logo, served from frontend/public/logo.svg (also the favicon). Replace that file with the official
// Isoeste logo to rebrand the login card and the top bar; no code change is needed.
export function Logo({ height = 32 }: { height?: number }) {
  return <img src="/logo.svg" alt="Isoeste" height={height} style={{ display: 'block', height, width: 'auto' }} />
}
