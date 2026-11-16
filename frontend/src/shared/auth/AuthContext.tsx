import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { onAuthExpired } from '../api/errors'
import type { UserDto } from '../api/types'

interface AuthState {
  token: string
  user: UserDto
}

interface AuthCtx {
  user: UserDto | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string, costCenterId: string) => Promise<void>
  logout: () => void
}

const Ctx = createContext<AuthCtx | null>(null)
export const AUTH_STORAGE_KEY = 'kp_auth'

/** Expiry in ms. Supports a real JWT (header.payload.sig, `exp` in seconds) and the mock token (base64 JSON, `exp` in ms). */
function tokenExpiry(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length === 3) {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      const { exp } = JSON.parse(atob(b64)) as { exp: number }
      return exp * 1000
    }
    const { exp } = JSON.parse(decodeURIComponent(escape(atob(token)))) as { exp: number }
    return exp
  } catch {
    return null
  }
}

function loadSession(): AuthState | null {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthState
    const exp = tokenExpiry(parsed.token)
    if (!exp || exp < Date.now()) {
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function saveSession(s: AuthState | null) {
  try {
    if (s) sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(s))
    else sessionStorage.removeItem(AUTH_STORAGE_KEY)
  } catch {
    /* storage unavailable (private mode) — session stays in memory only */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState | null>(loadSession)
  const navigate = useNavigate()
  const location = useLocation()
  // keep the latest location without re-subscribing the listener on every navigation
  const locationRef = useRef(location)
  locationRef.current = location

  const logout = useCallback(() => {
    // end the Redis session on the server (ADR-015); the local session is dropped even if that call fails
    api.logout().catch(() => undefined)
    saveSession(null)
    setState(null)
  }, [])

  // README §2.7: 401 → login, then back to the original route
  useEffect(
    () =>
      onAuthExpired(() => {
        saveSession(null)
        setState(null)
        const { pathname, search } = locationRef.current
        const from = pathname.startsWith('/login') ? '/' : pathname + search
        navigate(`/login?returnUrl=${encodeURIComponent(from)}`, { replace: true })
      }),
    [navigate],
  )

  const value = useMemo<AuthCtx>(() => {
    const start = (token: string, user: UserDto) => {
      const s = { token, user }
      saveSession(s)
      setState(s)
    }
    return {
      user: state?.user ?? null,
      logout,
      login: async (email, password) => {
        const res = await api.login(email, password)
        start(res.token, res.user)
      },
      register: async (email, password, name, costCenterId) => {
        await api.register(email, password, name, costCenterId)
        const res = await api.login(email, password)
        start(res.token, res.user)
      },
    }
  }, [state, logout])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
