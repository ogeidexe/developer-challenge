// Form rules shared by the screens (antd Form `rules`). They mirror the backend constraints for fast feedback;
// the backend stays authoritative (README §2.7: server errors are still mapped to the fields).
import type { Rule } from 'antd/es/form'

/** First name and surname, letters only (accents allowed), single spaces — backend AdminDtos.NAME_PATTERN. */
export const FULL_NAME = /^\p{L}+( \p{L}+)+$/u

export const fullNameRules: Rule[] = [
  { required: true, whitespace: true, message: 'Informe seu nome completo' },
  { min: 5, max: 120, message: 'Use de 5 a 120 caracteres' },
  {
    pattern: FULL_NAME,
    message:
      'Informe nome e sobrenome, só com letras (acentos permitidos) e espaços simples — sem vírgula, hífen ou números',
  },
]

/** Backend: 8–72 characters (bcrypt limit) with letters and digits. */
export const passwordRules: Rule[] = [
  { required: true, message: 'Informe a senha' },
  { min: 8, max: 72, message: 'Use de 8 a 72 caracteres' },
  { pattern: /^(?=.*\p{L})(?=.*\d).+$/u, message: 'Use letras e números' },
]

export interface PasswordStrength {
  /** 0 (empty) to 4 (strong) */
  score: 0 | 1 | 2 | 3 | 4
  label: string
  color: string
}

/** Simple, explainable meter: length, upper + lower case, digits and symbols each add strength. */
export function passwordStrength(password: string | undefined): PasswordStrength {
  const p = password ?? ''
  if (!p) return { score: 0, label: '', color: '' }
  let points = 0
  if (p.length >= 8) points++
  if (p.length >= 12) points++
  if (/\p{Ll}/u.test(p) && /\p{Lu}/u.test(p)) points++
  if (/\d/.test(p)) points++
  if (/[^\p{L}\d]/u.test(p)) points++
  const meetsRules = p.length >= 8 && /\p{L}/u.test(p) && /\d/.test(p)
  const score = (!meetsRules ? 1 : points >= 5 ? 4 : points >= 4 ? 3 : 2) as PasswordStrength['score']
  const scale = {
    1: { label: 'Fraca', color: '#cf1322' },
    2: { label: 'Razoável', color: '#d48806' },
    3: { label: 'Boa', color: '#389e0d' },
    4: { label: 'Forte', color: '#237804' },
  } as const
  return { score, ...scale[score as 1 | 2 | 3 | 4] }
}

/** Money typed in an InputNumber (string mode): required, greater than zero unless `allowZero`, at most 13 integer digits. */
export function moneyRules(label: string, { allowZero = false }: { allowZero?: boolean } = {}): Rule[] {
  return [
    { required: true, message: `Informe ${label}` },
    {
      validator: (_, value?: string | null) => {
        if (value === undefined || value === null || value === '') return Promise.resolve()
        const n = Number(value)
        if (!Number.isFinite(n)) return Promise.reject(new Error('Valor inválido'))
        if (allowZero ? n < 0 : n <= 0)
          return Promise.reject(new Error(allowZero ? 'Não pode ser negativo' : 'Deve ser maior que zero'))
        if (Math.trunc(Math.abs(n)).toString().length > 13) return Promise.reject(new Error('Valor alto demais'))
        return Promise.resolve()
      },
    },
  ]
}
