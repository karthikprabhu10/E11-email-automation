import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FaGithub } from 'react-icons/fa6'
import { Download, Moon, Send, Square, Sun, Upload } from 'lucide-react'
import { Badge, Logo, Modal, Notice, Stat } from './components.jsx'
import { getStatus, startRun, stopRun } from './api.js'
import { companyFromEmail, download, fmtDuration, fmtTime, load, parseContacts, renderTemplate, store, toCsv } from './lib.js'

const GITHUB = 'https://github.com/karthikprabhu10'

const DEFAULT_SUBJECT = 'Any Java / Spring Boot openings?'
const DEFAULT_BODY = `Hi {first_name},

I’m Karthik, a CS student with experience in:

• Java
• Spring Boot & backend development
• SQL & REST APIs
• Problem solving & logical programming

Came across {company} and wanted to check if you guys have any openings where these skills could be a fit.

Attaching my resume here :)

Thanks,
Karthik`

function usePersisted(key, initial) {
  const [v, setV] = useState(() => load(key, initial))
  useEffect(() => store(key, v), [key, v])
  return [v, setV]
}

function useNow(ms) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo))

export default function App() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark')
  const [contacts, setContacts] = usePersisted('e11.contacts', [])
  const [subject, setSubject] = usePersisted('e11.subject', DEFAULT_SUBJECT)
  const [body, setBody] = usePersisted('e11.body', DEFAULT_BODY)
  const [limit, setLimit] = usePersisted('e11.limit', 40)
  const [delayMin, setDelayMin] = usePersisted('e11.delayMin', 20)
  const [delayMax, setDelayMax] = usePersisted('e11.delayMax', 45)
  const [run, setRun] = usePersisted('e11.run', null)

  const [sentLog, setSentLog] = useState([])
  const [conn, setConn] = useState({ state: 'checking', error: null })
  const [notice, setNotice] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [shown, setShown] = useState(50)
  const [logSearch, setLogSearch] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)
  const bodyRef = useRef(null)
  const now = useNow(5000)

  /* ---------- theme ---------- */
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('e11.theme', next) } catch {}
  }

  /* ---------- derived ---------- */
  const sentSet = useMemo(() => new Set(sentLog.map((r) => String(r.email).toLowerCase())), [sentLog])
  const queued = useMemo(() => new Set(run?.emails || []), [run])

  const statusOf = useCallback(
    (c) => {
      if (c.issue) return c.issue
      if (sentSet.has(c.email)) return 'sent'
      if (queued.has(c.email)) return 'queued'
      return 'pending'
    },
    [sentSet, queued],
  )

  const counts = useMemo(() => {
    const k = { valid: 0, pending: 0, sent: 0, skipped: 0 }
    contacts.forEach((c) => {
      if (c.issue) k.skipped++
      else {
        k.valid++
        sentSet.has(c.email) ? k.sent++ : k.pending++
      }
    })
    return k
  }, [contacts, sentSet])

  const lim = clamp(Math.round(Number(limit)), 1, 200)
  const dMin = clamp(Math.round(Number(delayMin)), 5, 60)
  const dMax = clamp(Math.round(Number(delayMax)), dMin, 60)
  const queue = useMemo(() => contacts.filter((c) => !c.issue && !sentSet.has(c.email)).slice(0, lim), [contacts, sentSet, lim])

  /* ---------- run phase ---------- */
  const phase = useMemo(() => {
    if (!run) return { name: 'idle', done: 0, total: 0 }
    const total = run.emails.length
    const times = sentLog
      .filter((r) => queued.has(String(r.email).toLowerCase()))
      .map((r) => Date.parse(r.sent_at))
      .filter((t) => !isNaN(t))
    const done = run.emails.filter((e) => sentSet.has(e)).length
    if (done >= total) return { name: 'done', done, total }
    const last = Math.max(run.startedAt, ...times)
    const idle = now - last
    const wait = (run.delayMax || 45) * 1000
    if (run.stopRequested) return { name: idle > wait + 20000 ? 'stopped' : 'stopping', done, total }
    return { name: idle > wait + 120000 ? 'stalled' : 'running', done, total }
  }, [run, sentLog, sentSet, queued, now])

  const active = phase.name === 'running' || phase.name === 'stopping'

  /* ---------- polling ---------- */
  const refresh = useCallback(async () => {
    try {
      const res = await getStatus()
      setSentLog(Array.isArray(res.sent) ? res.sent.filter((r) => r && r.email) : [])
      setConn({ state: 'ok', error: null })
    } catch (e) {
      setConn({ state: 'error', error: e })
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, active ? 4000 : 15000)
    const onVis = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refresh, active])

  /* ---------- contacts ---------- */
  const loadFile = async (file) => {
    if (!file) return
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      setNotice({ title: 'Not a CSV.', text: 'Upload a .csv file with first_name, last_name, email columns.' })
      return
    }
    const { rows, error } = parseContacts(await file.text())
    if (error) return setNotice({ title: 'Cannot read file.', text: error })
    setContacts(rows)
    setShown(50)
    setSearch('')
    setFilter('all')
    const bad = rows.filter((r) => r.issue).length
    setNotice({ title: `${rows.length - bad} contacts loaded.`, text: bad ? `${bad} skipped (invalid or duplicate email).` : 'All rows valid.' })
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return contacts.filter((c) => {
      if (q && !`${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q)) return false
      if (filter === 'all') return true
      const s = statusOf(c)
      if (filter === 'issues') return s === 'invalid' || s === 'duplicate'
      return s === filter
    })
  }, [contacts, search, filter, statusOf])

  /* ---------- message ---------- */
  const insert = (token) => {
    const el = bodyRef.current
    const a = el?.selectionStart ?? body.length
    const b = el?.selectionEnd ?? body.length
    setBody(body.slice(0, a) + token + body.slice(b))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(a + token.length, a + token.length)
    })
  }
  const sample = queue[0] || contacts.find((c) => !c.issue) || { first_name: 'Aarav', last_name: '', email: 'aarav@example.com' }

  /* ---------- actions ---------- */
  const canSend = conn.state === 'ok' && queue.length > 0 && subject.trim() && body.trim() && !active && !busy
  const avgDelay = (dMin + dMax) / 2

  const doSend = async () => {
    setConfirming(false)
    setBusy(true)
    try {
      await startRun({
        contacts: queue.map(({ first_name, last_name, email }) => ({ first_name, last_name, email })),
        subject: subject.trim(),
        message: body,
        max_per_run: queue.length,
        delay_min: dMin,
        delay_max: dMax,
      })
      setRun({ startedAt: Date.now(), emails: queue.map((c) => c.email), delayMax: dMax, stopRequested: false })
      setNotice(null)
      setTimeout(refresh, 2500)
    } catch (e) {
      setNotice({ title: 'Could not start.', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const doStop = async () => {
    try {
      await stopRun()
      setRun((r) => (r ? { ...r, stopRequested: true } : r))
    } catch (e) {
      setNotice({ title: 'Could not stop.', text: e.message })
    }
  }

  const clearRun = () => setRun(null)

  const sortedLog = useMemo(() => {
    const q = logSearch.trim().toLowerCase()
    return [...sentLog]
      .reverse()
      .filter((r) => !q || `${r.first_name} ${r.email} ${r.company}`.toLowerCase().includes(q))
  }, [sentLog, logSearch])

  /* ---------- render ---------- */
  const pct = phase.total ? Math.round((phase.done / phase.total) * 100) : 0
  const phaseText = {
    running: 'Running. Emails go out one at a time.',
    stopping: 'Stop requested. The run ends after the current wait.',
    stopped: 'Stopped.',
    stalled: 'No progress for a while. Check the Executions tab in n8n for an error (SMTP login is the usual cause).',
    done: 'Finished.',
  }[phase.name]

  return (
    <div className="page">
      <header className="header">
        <div className="wrap header-in">
          <Logo />
          <div className="header-actions">
            <span className="pill" role="status">
              <i className={`dot ${conn.state === 'ok' ? 'on' : ''} ${conn.state === 'checking' ? 'pulse' : ''}`} />
              <span className="txt">
                {conn.state === 'ok' ? 'n8n connected' : conn.state === 'checking' ? 'Connecting' : 'n8n offline'}
              </span>
            </span>
            <button className="btn icon" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      <main className="wrap main">
        {conn.state === 'error' && <Notice title="n8n is not reachable.">{conn.error?.message}</Notice>}
        {notice && (
          <Notice title={notice.title} onClose={() => setNotice(null)}>
            {notice.text}
          </Notice>
        )}

        <section className="stats" aria-label="Summary">
          <Stat k="Contacts" v={counts.valid} />
          <Stat k="Pending" v={counts.pending} />
          <Stat k="Sent" v={counts.sent} />
          <Stat k="Skipped" v={counts.skipped} />
        </section>

        <div className="cols">
          {/* ---------------- left ---------------- */}
          <div className="col">
            <section className="card">
              <div className="card-h">
                <div>
                  <h2 className="card-t">Contacts</h2>
                  <div className="card-s">CSV with first_name, last_name, email</div>
                </div>
                <div className="row">
                  <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = '' }} />
                  <button className="btn sm" onClick={() => fileRef.current.click()}>
                    <Upload size={14} /> {contacts.length ? 'Replace CSV' : 'Upload CSV'}
                  </button>
                  {contacts.length > 0 && (
                    <button className="btn sm" onClick={() => { setContacts([]); setShown(50) }}>
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {contacts.length === 0 ? (
                <div className="card-b">
                  <div
                    className={`drop ${dragOver ? 'over' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => fileRef.current.click()}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files[0]) }}
                  >
                    <Upload size={20} aria-hidden="true" />
                    <div className="drop-t">Drop your CSV here</div>
                    <div className="drop-s">or click to browse. Invalid and duplicate emails are skipped automatically.</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="toolbar">
                    <input className="input grow" placeholder="Search name or email" aria-label="Search contacts" value={search} onChange={(e) => { setSearch(e.target.value); setShown(50) }} />
                    <select className="select" style={{ width: 130 }} aria-label="Filter" value={filter} onChange={(e) => { setFilter(e.target.value); setShown(50) }}>
                      <option value="all">All</option>
                      <option value="pending">Pending</option>
                      <option value="queued">Queued</option>
                      <option value="sent">Sent</option>
                      <option value="issues">Skipped</option>
                    </select>
                  </div>
                  <div className="tbl-wrap">
                    <table>
                      <thead>
                        <tr><th>#</th><th>First name</th><th>Last name</th><th>Email</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, shown).map((c, i) => {
                          const s = statusOf(c)
                          return (
                            <tr key={c.email + i}>
                              <td className="num mono">{i + 1}</td>
                              <td>{c.first_name || <span style={{ color: 'var(--faint)' }}>-</span>}</td>
                              <td>{c.last_name || <span style={{ color: 'var(--faint)' }}>-</span>}</td>
                              <td className="email mono" title={c.email}>{c.email || '(empty)'}</td>
                              <td>
                                <Badge kind={s === 'sent' ? 'sent' : s === 'queued' ? 'queued' : s === 'pending' ? '' : 'bad'}>
                                  {{ sent: 'Sent', queued: 'Queued', pending: 'Pending', invalid: 'Invalid', duplicate: 'Duplicate' }[s]}
                                </Badge>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {filtered.length === 0 && <div className="empty">No contacts match.</div>}
                  </div>
                  {filtered.length > shown && (
                    <div className="more">
                      <button className="btn sm" onClick={() => setShown(shown + 100)}>
                        Show more ({filtered.length - shown})
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="card">
              <div className="card-h">
                <div>
                  <h2 className="card-t">Sent log</h2>
                  <div className="card-s">{sentLog.length} sent. Anyone listed here is never emailed again.</div>
                </div>
                <button
                  className="btn sm"
                  disabled={!sentLog.length}
                  onClick={() => download('sent_log.csv', toCsv(sentLog, ['email', 'first_name', 'company', 'sent_at']))}
                >
                  <Download size={14} /> Export
                </button>
              </div>
              {sentLog.length === 0 ? (
                <div className="empty">Nothing sent yet.</div>
              ) : (
                <>
                  <div className="toolbar">
                    <input className="input" placeholder="Search sent log" aria-label="Search sent log" value={logSearch} onChange={(e) => setLogSearch(e.target.value)} />
                  </div>
                  <div className="tbl-wrap" style={{ maxHeight: 320 }}>
                    <table>
                      <thead>
                        <tr><th>Time</th><th>Name</th><th>Email</th><th>Company</th></tr>
                      </thead>
                      <tbody>
                        {sortedLog.slice(0, 200).map((r, i) => (
                          <tr key={r.email + i}>
                            <td className="mono" style={{ color: 'var(--muted)' }}>{fmtTime(r.sent_at)}</td>
                            <td>{r.first_name}</td>
                            <td className="email mono" title={r.email}>{r.email}</td>
                            <td>{r.company}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </div>

          {/* ---------------- right ---------------- */}
          <div className="col">
            <section className="card">
              <div className="card-h">
                <div>
                  <h2 className="card-t">Message</h2>
                  <div className="card-s">Sent as plain text with your resume attached</div>
                </div>
                <button className="btn sm" onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</button>
              </div>
              <div className="card-b">
                <div className="field">
                  <label className="label" htmlFor="subject">Subject</label>
                  <input id="subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                {preview ? (
                  <div className="preview" aria-live="polite">
                    <div className="preview-to mono">To: {sample.email}</div>
                    <div className="preview-s">{renderTemplate(subject, sample)}</div>
                    <div className="preview-b">{renderTemplate(body, sample)}</div>
                  </div>
                ) : (
                  <div className="field">
                    <label className="label" htmlFor="body">Body</label>
                    <textarea id="body" ref={bodyRef} className="textarea" value={body} onChange={(e) => setBody(e.target.value)} />
                    <div className="chips" aria-label="Insert placeholder">
                      {['{first_name}', '{last_name}', '{company}'].map((t) => (
                        <button key={t} type="button" className="chip mono" onClick={() => insert(t)}>{t}</button>
                      ))}
                    </div>
                    <div className="hint">
                      {'{company}'} is the text between @ and the first dot of the email, for example {companyFromEmail('ritu@flipkart.com')} for ritu@flipkart.com.
                    </div>
                  </div>
                )}
                <div className="hint">
                  Resume: <span className="mono">resume/resume.pdf</span> inside your n8n files folder.
                </div>
              </div>
            </section>

            <section className="card">
              <div className="card-h">
                <div>
                  <h2 className="card-t">Run</h2>
                  <div className="card-s">One email at a time with a random pause</div>
                </div>
              </div>
              <div className="card-b">
                <div className="grid3">
                  <div className="field">
                    <label className="label" htmlFor="limit">Emails this run</label>
                    <input id="limit" className="input mono" type="number" min="1" max="200" value={limit} onChange={(e) => setLimit(e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="dmin">Pause min (s)</label>
                    <input id="dmin" className="input mono" type="number" min="5" max="60" value={delayMin} onChange={(e) => setDelayMin(e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="dmax">Pause max (s)</label>
                    <input id="dmax" className="input mono" type="number" min="5" max="60" value={delayMax} onChange={(e) => setDelayMax(e.target.value)} />
                  </div>
                </div>
                <div className="hint">
                  Around 40 a day from a personal Gmail is safe. Many more in one go gets flagged as spam. Pauses are capped at 60 seconds.
                </div>

                {run && (
                  <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="prog-line">
                      <span><b className="mono">{phase.done}</b> of <b className="mono">{phase.total}</b> sent</span>
                      <span className="mono">{pct}%</span>
                    </div>
                    <div className={`bar ${phase.name === 'running' ? 'live' : ''}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <i style={{ width: `${pct}%` }} />
                    </div>
                    <div className="hint">{phaseText}</div>
                  </div>
                )}

                <div className="row">
                  {active ? (
                    <button className="btn primary" onClick={doStop} disabled={phase.name === 'stopping'}>
                      <Square size={14} /> {phase.name === 'stopping' ? 'Stopping' : 'Stop'}
                    </button>
                  ) : (
                    <button className="btn primary" onClick={() => setConfirming(true)} disabled={!canSend}>
                      <Send size={14} /> Send {queue.length || ''} {queue.length === 1 ? 'email' : 'emails'}
                    </button>
                  )}
                  {run && !active && (
                    <button className="btn" onClick={clearRun}>Dismiss</button>
                  )}
                  {queue.length > 0 && !active && (
                    <span className="hint">About {fmtDuration(queue.length * avgDelay)}. Keep n8n running.</span>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="wrap footer-in">
          <span>Karthik Prabhu</span>
          <a href={GITHUB} target="_blank" rel="noopener noreferrer" aria-label="Karthik Prabhu on GitHub">
            <FaGithub size={18} />
          </a>
        </div>
      </footer>

      {confirming && (
        <Modal title={`Send ${queue.length} ${queue.length === 1 ? 'email' : 'emails'}?`} onClose={() => setConfirming(false)}>
          <dl className="kv">
            <dt>Subject</dt><dd>{subject}</dd>
            <dt>Attachment</dt><dd className="mono">resume.pdf</dd>
            <dt>Pause</dt><dd>{dMin} to {dMax} seconds between emails</dd>
            <dt>Takes</dt><dd>About {fmtDuration(queue.length * avgDelay)}</dd>
          </dl>
          <ul className="mono">
            {queue.slice(0, 4).map((c) => <li key={c.email}>{c.email}</li>)}
            {queue.length > 4 && <li>and {queue.length - 4} more</li>}
          </ul>
          <div className="hint">Sent emails cannot be recalled. You can press Stop at any time to end the run.</div>
          <div className="modal-f">
            <button className="btn" onClick={() => setConfirming(false)}>Cancel</button>
            <button className="btn primary" onClick={doSend}>Send</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
