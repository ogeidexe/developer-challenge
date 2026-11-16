// Build-time feature flags, computed in vite.config.ts and inlined as literal true/false (`define`), so a
// disabled feature is dead code and is dropped from the bundle with everything only it imports.

/**
 * SEC-F04: the in-browser fake backend performs login and authorization in the browser and contains the seed
 * (fictional users and their password). Default: on for the dev server (`npm run dev`, Cypress), off for a
 * production build. `VITE_MOCK_BACKEND=true|false` overrides.
 */
export const USE_MOCK_BACKEND: boolean = __USE_MOCK_BACKEND__

/**
 * SEC-F04: the login screen's demo-user picker and pre-filled admin credentials. Default: on with the dev server
 * or the mock backend, off for a production build — a real deployment must not advertise default accounts.
 * A demo deployment against a seeded backend can set `VITE_DEMO_LOGIN=true` at build time.
 */
export const SHOW_DEMO_LOGIN: boolean = __SHOW_DEMO_LOGIN__
