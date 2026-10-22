import Papa from 'papaparse'

export const EMAIL_RE = /^[^@\s*]+@[^@\s*]+\.[a-z]{2,}$/i

// Same rule as the n8n workflow: text between @ and the first dot.
const GENERIC = new Set(['gmail', 'yahoo', 'outlook', 'hotmail', 'rediffmail', 'icloud', 'proton', 'protonmail'])
export function companyFromEmail(email) {
  const label = String(email).split('@')[1]?.split('.')[0] || ''
  if (!label || GENERIC.has(label.toLowerCase())) return 'your company'
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function renderTemplate(tpl, c) {
  const map = {
    first_name: c.first_name || 'there',
    last_name: c.last_name || '',
    email: c.email,
    company: companyFromEmail(c.email),
  }
  return tpl.replace(/\{\s*(first_name|last_name|email|company)\s*\}/g, (_, k) => map[k])
}

const HEADER_ALIASES = {
  first_name: ['first_name', 'firstname', 'first', 'given_name'],
  last_name: ['last_name', 'lastname', 'last', 'surname', 'family_name'],
  email: ['email', 'email_address', 'e_mail', 'mail'],
}
const norm = (h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

function titleCase(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim()
  return s && (s === s.toUpperCase() || s === s.toLowerCase())
    ? s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase())
    : s
}

// Returns { rows, error }. rows: { first_name, last_name, email, issue: null|'invalid'|'duplicate' }
export function parseContacts(text) {
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: 'greedy', transformHeader: norm })
  const fields = parsed.meta.fields || []
  const pick = (key) => HEADER_ALIASES[key].find((a) => fields.includes(a))
  const col = { first_name: pick('first_name'), last_name: pick('last_name'), email: pick('email') }
  if (!col.email) return { rows: [], error: 'No email column found. The CSV needs a header row with: first_name, last_name, email.' }

  const seen = new Set()
  const rows = parsed.data.map((r) => {
    const email = String(r[col.email] || '').trim().toLowerCase()
    let issue = null
    if (!EMAIL_RE.test(email)) issue = 'invalid'
    else if (seen.has(email)) issue = 'duplicate'
    else seen.add(email)
    return {
      first_name: titleCase(col.first_name ? r[col.first_name] : ''),
      last_name: titleCase(col.last_name ? r[col.last_name] : '').replace(/^\.+$/, ''),
      email,
      issue,
    }
  })
  return { rows, error: null }
}

export function toCsv(rows, cols) {
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  return [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n')
}

export function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}
export function load(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

export function fmtTime(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return ''
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function fmtDuration(sec) {
  if (sec < 60) return `${Math.round(sec)}s`
  const m = Math.round(sec / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`
}
