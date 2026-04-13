import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './App.css'

const AUTH_TOKEN_KEY = 'applyflow.auth.token'
const DEFAULT_JOB_QUERY = 'software engineer'
const DEFAULT_JOB_LOCATION = 'Nashville, TN'

const statuses = ['Saved', 'Applied', 'Interview', 'Offer', 'Rejected', 'Withdrawn', 'Archived'] as const
const sources = ['Manual', 'Referral', 'Career fair', 'LinkedIn', 'Company site', 'Live search'] as const
const filters = ['All', 'Active', 'Applied', 'Interview', 'Offer', 'Archived'] as const

type Status = (typeof statuses)[number]
type Source = (typeof sources)[number]
type Filter = (typeof filters)[number]

type User = {
  id: string
  name: string
  email: string
  createdAt: string
}

type Application = {
  id: string
  company: string
  role: string
  location: string
  source: Source
  status: Status
  appliedOn: string
  link: string
  notes: string
  createdAt: string
  updatedAt: string
}

type ApplicationInput = Omit<Application, 'id' | 'createdAt' | 'updatedAt'>

type LiveJob = {
  id: string
  title: string
  company: string
  location: string
  link: string
  created: string
  salary: string
  description: string
}

type AuthMode = 'login' | 'register'

const emptyDraft: ApplicationInput = {
  company: '',
  role: '',
  location: '',
  source: 'Manual',
  status: 'Saved',
  appliedOn: new Date().toISOString().slice(0, 10),
  link: '',
  notes: '',
}

const statusClass: Record<Status, string> = {
  Saved: 'saved',
  Applied: 'applied',
  Interview: 'interview',
  Offer: 'offer',
  Rejected: 'rejected',
  Withdrawn: 'withdrawn',
  Archived: 'archived',
}

function formatPostedDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Recently posted'
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error || 'Something went wrong.')
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export default function ProductApp() {
  const [token, setToken] = useState<string | null>(() => window.localStorage.getItem(AUTH_TOKEN_KEY))
  const [user, setUser] = useState<User | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [draft, setDraft] = useState<ApplicationInput>(emptyDraft)
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [liveQuery, setLiveQuery] = useState(DEFAULT_JOB_QUERY)
  const [liveLocation, setLiveLocation] = useState(DEFAULT_JOB_LOCATION)
  const [liveJobs, setLiveJobs] = useState<LiveJob[]>([])
  const [isLoadingJobs, setIsLoadingJobs] = useState(false)
  const [jobsError, setJobsError] = useState('')
  const [jobsNotice, setJobsNotice] = useState('')
  const [trackerNotice, setTrackerNotice] = useState('')
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' })
  const [authError, setAuthError] = useState('')
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false)
  const [isBooting, setIsBooting] = useState(true)

  useEffect(() => {
    if (!token) {
      setUser(null)
      setApplications([])
      setIsBooting(false)
      return
    }

    async function bootstrap() {
      try {
        const auth = await apiRequest<{ user: User }>('/api/auth/me', {}, token)
        setUser(auth.user)
        const apps = await apiRequest<{ applications: Application[] }>('/api/applications', {}, token)
        setApplications(apps.applications)
      } catch {
        window.localStorage.removeItem(AUTH_TOKEN_KEY)
        setToken(null)
        setUser(null)
      } finally {
        setIsBooting(false)
      }
    }

    void bootstrap()
  }, [token])

  useEffect(() => {
    if (!token) return
    void loadLiveJobs(DEFAULT_JOB_QUERY, DEFAULT_JOB_LOCATION)
    // Initial live search for signed-in users.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const filteredApplications = useMemo(() => {
    const query = search.trim().toLowerCase()
    return applications.filter((application) => {
      const matchesQuery =
        !query ||
        `${application.company} ${application.role} ${application.location} ${application.notes} ${application.status} ${application.source}`
          .toLowerCase()
          .includes(query)

      const matchesFilter =
        filter === 'All'
          ? true
          : filter === 'Active'
            ? !['Rejected', 'Withdrawn', 'Archived'].includes(application.status)
            : filter === 'Archived'
              ? ['Rejected', 'Withdrawn', 'Archived'].includes(application.status)
              : application.status === filter

      return matchesQuery && matchesFilter
    })
  }, [applications, filter, search])

  const selectedApplication =
    filteredApplications.find((application) => application.id === selectedId) ?? filteredApplications[0] ?? null

  const stats = useMemo(() => {
    const active = applications.filter((application) => !['Rejected', 'Withdrawn', 'Archived'].includes(application.status)).length
    const interviews = applications.filter((application) => application.status === 'Interview').length
    const offers = applications.filter((application) => application.status === 'Offer').length
    return { total: applications.length, active, interviews, offers }
  }, [applications])

  function updateDraft<K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function resetDraft() {
    setDraft({ ...emptyDraft, appliedOn: new Date().toISOString().slice(0, 10) })
    setEditingId(null)
  }

  async function refreshApplications(activeToken = token) {
    if (!activeToken) return
    const response = await apiRequest<{ applications: Application[] }>('/api/applications', {}, activeToken)
    setApplications(response.applications)
  }

  async function submitDraft() {
    if (!token || !draft.company.trim() || !draft.role.trim()) return

    const payload: ApplicationInput = {
      ...draft,
      company: draft.company.trim(),
      role: draft.role.trim(),
      location: draft.location.trim(),
      link: draft.link.trim(),
      notes: draft.notes.trim(),
    }

    if (editingId) {
      const response = await apiRequest<{ application: Application }>(
        `/api/applications/${editingId}`,
        { method: 'PUT', body: JSON.stringify(payload) },
        token,
      )
      setApplications((current) => current.map((application) => (application.id === editingId ? response.application : application)))
      setSelectedId(editingId)
      setTrackerNotice('Tracker entry updated.')
      resetDraft()
      return
    }

    const response = await apiRequest<{ application: Application }>(
      '/api/applications',
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    )
    setApplications((current) => [response.application, ...current])
    setSelectedId(response.application.id)
    setTrackerNotice('Application added to your tracker.')
    resetDraft()
  }

  function loadForEdit(application: Application) {
    setEditingId(application.id)
    setDraft({
      company: application.company,
      role: application.role,
      location: application.location,
      source: application.source,
      status: application.status,
      appliedOn: application.appliedOn,
      link: application.link,
      notes: application.notes,
    })
  }

  async function updateStatus(id: string, status: Status) {
    if (!token) return
    const existing = applications.find((application) => application.id === id)
    if (!existing) return

    const response = await apiRequest<{ application: Application }>(
      `/api/applications/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          company: existing.company,
          role: existing.role,
          location: existing.location,
          source: existing.source,
          status,
          appliedOn: existing.appliedOn,
          link: existing.link,
          notes: existing.notes,
        }),
      },
      token,
    )

    setApplications((current) => current.map((application) => (application.id === id ? response.application : application)))
    setTrackerNotice(`Status updated to ${status}.`)
  }

  async function archiveSelected() {
    if (!selectedApplication) return
    await updateStatus(selectedApplication.id, 'Archived')
  }

  async function removeSelected() {
    if (!token || !selectedApplication) return
    await apiRequest(`/api/applications/${selectedApplication.id}`, { method: 'DELETE' }, token)
    const remaining = applications.filter((application) => application.id !== selectedApplication.id)
    setApplications(remaining)
    setSelectedId(remaining[0]?.id ?? '')
    setTrackerNotice('Application removed from the tracker.')
    if (editingId === selectedApplication.id) resetDraft()
  }

  async function loadLiveJobs(query = liveQuery, location = liveLocation) {
    if (!token) return
    setIsLoadingJobs(true)
    setJobsError('')
    setJobsNotice('')

    try {
      const params = new URLSearchParams({ q: query.trim(), location: location.trim() })
      const response = await apiRequest<{ jobs: LiveJob[]; notice: string }>(`/api/jobs/search?${params.toString()}`, {}, token)
      setLiveJobs(response.jobs)
      setJobsNotice(response.notice)
      if (!response.jobs.length) {
        setJobsError('No live matches found yet. Try a more specific role or a different location.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load live jobs right now.'
      setJobsError(message)
    } finally {
      setIsLoadingJobs(false)
    }
  }

  async function addLiveJobToTracker(job: LiveJob) {
    if (!token) return

    const existing = applications.find(
      (application) =>
        application.link.trim().toLowerCase() === job.link.trim().toLowerCase() ||
        `${application.company}|${application.role}|${application.location}`.toLowerCase() ===
          `${job.company}|${job.title}|${job.location}`.toLowerCase(),
    )

    if (existing) {
      setSelectedId(existing.id)
      setTrackerNotice('That job is already in your tracker.')
      return
    }

    const response = await apiRequest<{ application: Application }>(
      '/api/applications',
      {
        method: 'POST',
        body: JSON.stringify({
          company: job.company,
          role: job.title,
          location: job.location,
          source: 'Live search',
          status: 'Saved',
          appliedOn: new Date().toISOString().slice(0, 10),
          link: job.link,
          notes: `Imported from live search. Posted ${formatPostedDate(job.created)}.`,
        }),
      },
      token,
    )

    setApplications((current) => [response.application, ...current])
    setSelectedId(response.application.id)
    setTrackerNotice('Live job saved to your tracker.')
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    setIsSubmittingAuth(true)

    try {
      const path = authMode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body =
        authMode === 'login'
          ? { email: authForm.email.trim(), password: authForm.password }
          : { name: authForm.name.trim(), email: authForm.email.trim(), password: authForm.password }

      const response = await apiRequest<{ token: string; user: User }>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      })

      window.localStorage.setItem(AUTH_TOKEN_KEY, response.token)
      setToken(response.token)
      setUser(response.user)
      setAuthForm({ name: '', email: '', password: '' })
      await refreshApplications(response.token)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to continue right now.')
    } finally {
      setIsSubmittingAuth(false)
    }
  }

  function signOut() {
    window.localStorage.removeItem(AUTH_TOKEN_KEY)
    setToken(null)
    setUser(null)
    setApplications([])
    setLiveJobs([])
    setTrackerNotice('')
    setJobsNotice('')
    setJobsError('')
  }

  if (isBooting) {
    return (
      <main className="app-shell">
        <section className="brand-bar">
          <div className="brand-lockup" aria-label="ApplyFlow">
            <div className="brand-mark">
              <span className="brand-dot brand-dot-one" />
              <span className="brand-dot brand-dot-two" />
              <span className="brand-dot brand-dot-three" />
            </div>
            <div>
              <p className="brand-name">ApplyFlow</p>
              <p className="brand-tag">Job search tracker</p>
            </div>
          </div>
        </section>
        <section className="panel auth-shell">
          <div className="empty-list">
            <h3>Loading your workspace</h3>
            <p>Bringing your account and applications online.</p>
          </div>
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="app-shell">
        <section className="brand-bar">
          <div className="brand-lockup" aria-label="ApplyFlow">
            <div className="brand-mark">
              <span className="brand-dot brand-dot-one" />
              <span className="brand-dot brand-dot-two" />
              <span className="brand-dot brand-dot-three" />
            </div>
            <div>
              <p className="brand-name">ApplyFlow</p>
              <p className="brand-tag">Job search tracker</p>
            </div>
          </div>
        </section>

        <section className="auth-shell">
          <div className="auth-hero panel">
            <p className="eyebrow">Real accounts. Real persistence.</p>
            <h1 className="auth-title">ApplyFlow is now set up as a real product, not just a local prototype.</h1>
            <p className="hero-text auth-copy">
              Create an account, search live jobs through the server, and keep your application tracker saved to your own profile.
            </p>
            <div className="auth-demo-card">
              <p className="panel-kicker">Demo account</p>
              <strong>demo@applyflow.app</strong>
              <span>Password: ApplyFlow123!</span>
            </div>
          </div>

          <form className="panel auth-card" onSubmit={handleAuthSubmit}>
            <div className="panel-header">
              <div>
                <p className="panel-kicker">{authMode === 'login' ? 'Welcome back' : 'Create account'}</p>
                <h2>{authMode === 'login' ? 'Sign in to your tracker' : 'Create your ApplyFlow account'}</h2>
              </div>
            </div>

            <div className="auth-toggle">
              <button type="button" className={`filter-chip ${authMode === 'login' ? 'active' : ''}`} onClick={() => setAuthMode('login')}>
                Login
              </button>
              <button type="button" className={`filter-chip ${authMode === 'register' ? 'active' : ''}`} onClick={() => setAuthMode('register')}>
                Register
              </button>
            </div>

            <div className="form-grid">
              {authMode === 'register' ? (
                <label className="full-width">
                  Name
                  <input
                    value={authForm.name}
                    onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Your name"
                  />
                </label>
              ) : null}
              <label className="full-width">
                Email
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="you@example.com"
                />
              </label>
              <label className="full-width">
                Password
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="At least 8 characters"
                />
              </label>
            </div>

            {authError ? <p className="inline-message warning-message">{authError}</p> : null}

            <div className="button-row">
              <button type="submit" className="primary-button">
                {isSubmittingAuth ? 'Working...' : authMode === 'login' ? 'Login' : 'Create account'}
              </button>
            </div>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="brand-bar">
        <div className="brand-lockup" aria-label="ApplyFlow">
          <div className="brand-mark">
            <span className="brand-dot brand-dot-one" />
            <span className="brand-dot brand-dot-two" />
            <span className="brand-dot brand-dot-three" />
          </div>
          <div>
            <p className="brand-name">ApplyFlow</p>
            <p className="brand-tag">Job search tracker</p>
          </div>
        </div>

        <div className="session-actions">
          <div className="session-chip">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button className="secondary-button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </section>

      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Track the search. Keep the momentum.</p>
          <h1 className="hero-title">One place for live roles, saved applications, and next steps.</h1>
          <p className="hero-text">
            Search current openings, save the ones worth pursuing, and update every application stage without
            bouncing between tabs, spreadsheets, and screenshots.
          </p>
        </div>

        <div className="stats-grid">
          <article className="stat-card">
            <span>Total tracked</span>
            <strong>{stats.total}</strong>
          </article>
          <article className="stat-card">
            <span>Active</span>
            <strong>{stats.active}</strong>
          </article>
          <article className="stat-card">
            <span>Interviews</span>
            <strong>{stats.interviews}</strong>
          </article>
          <article className="stat-card">
            <span>Offers</span>
            <strong>{stats.offers}</strong>
          </article>
        </div>
      </section>

      <section className="panel live-panel">
        <div className="panel-header live-header">
          <div>
            <p className="panel-kicker">Live job search</p>
            <h2>Find current openings that match what you typed</h2>
            <p className="section-copy">Server-backed search, real listings, and direct saves into your account.</p>
          </div>
        </div>

        <form
          className="live-controls"
          onSubmit={(event) => {
            event.preventDefault()
            void loadLiveJobs()
          }}
        >
          <label>
            Keywords
            <input value={liveQuery} onChange={(event) => setLiveQuery(event.target.value)} placeholder="software engineer, data analyst, cybersecurity" />
          </label>
          <label>
            Location
            <input value={liveLocation} onChange={(event) => setLiveLocation(event.target.value)} placeholder="Nashville, TN" />
          </label>
          <button type="submit" className="primary-button search-button">
            {isLoadingJobs ? 'Loading...' : 'Search live jobs'}
          </button>
        </form>

        {jobsNotice ? <p className="inline-message info-message">{jobsNotice}</p> : null}
        {jobsError ? <p className="inline-message warning-message">{jobsError}</p> : null}

        <div className="live-jobs-grid">
          {liveJobs.map((job) => (
            <article className="live-job-card" key={job.id}>
              <div className="live-job-top">
                <div>
                  <h3>{job.title}</h3>
                  <p className="live-company">{job.company}</p>
                </div>
                <span className="status-badge saved">Live</span>
              </div>

              <div className="live-meta">
                <span>{job.location}</span>
                <span>{formatPostedDate(job.created)}</span>
                <span>{job.salary}</span>
              </div>

              <p className="live-description">{job.description}</p>

              <div className="button-row">
                <button className="primary-button" onClick={() => void addLiveJobToTracker(job)}>
                  Save to tracker
                </button>
                <a className="secondary-button link-button" href={job.link} target="_blank" rel="noreferrer">
                  Open listing
                </a>
              </div>
            </article>
          ))}
        </div>

        {!isLoadingJobs && !liveJobs.length && !jobsError ? (
          <div className="empty-list">
            <h3>No live jobs loaded yet</h3>
            <p>Run a search and real listings will show up here.</p>
          </div>
        ) : null}
      </section>

      <section className="workspace-grid">
        <aside className="panel form-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{editingId ? 'Editing application' : 'Add application'}</p>
              <h2>{editingId ? 'Update tracker entry' : 'Track a new role'}</h2>
            </div>
            {editingId ? (
              <button className="text-button" onClick={resetDraft}>
                Cancel edit
              </button>
            ) : null}
          </div>

          <div className="form-grid">
            <label>
              Company
              <input value={draft.company} onChange={(event) => updateDraft('company', event.target.value)} placeholder="Company name" />
            </label>
            <label>
              Role
              <input value={draft.role} onChange={(event) => updateDraft('role', event.target.value)} placeholder="Role title" />
            </label>
            <label>
              Location
              <input value={draft.location} onChange={(event) => updateDraft('location', event.target.value)} placeholder="City, state or Remote" />
            </label>
            <label>
              Applied on
              <input type="date" value={draft.appliedOn} onChange={(event) => updateDraft('appliedOn', event.target.value)} />
            </label>
            <label>
              Source
              <select value={draft.source} onChange={(event) => updateDraft('source', event.target.value as Source)}>
                {sources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={draft.status} onChange={(event) => updateDraft('status', event.target.value as Status)}>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-width">
              Listing link
              <input value={draft.link} onChange={(event) => updateDraft('link', event.target.value)} placeholder="https://company.com/careers/role" />
            </label>
            <label className="full-width">
              Notes
              <textarea value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} placeholder="Add recruiter notes, follow-ups, or reminders." rows={4} />
            </label>
          </div>

          <div className="button-row">
            <button className="primary-button" onClick={() => void submitDraft()}>
              {editingId ? 'Save changes' : 'Add to tracker'}
            </button>
            <button className="secondary-button" onClick={resetDraft}>
              Reset
            </button>
          </div>
        </aside>

        <section className="panel tracker-panel">
          <div className="panel-header tracker-header">
            <div>
              <p className="panel-kicker">Application tracker</p>
              <h2>Search, filter, and review</h2>
            </div>
            <div className="toolbar">
              <input
                className="search-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search company, role, location, status..."
              />
            </div>
          </div>

          {trackerNotice ? <p className="inline-message success-message">{trackerNotice}</p> : null}

          <div className="filter-row">
            {filters.map((item) => (
              <button
                key={item}
                className={`filter-chip ${filter === item ? 'active' : ''}`}
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <p className="results-label">
            {filteredApplications.length} {filteredApplications.length === 1 ? 'application' : 'applications'} shown
          </p>

          <div className="tracker-layout">
            <div className="application-list">
              {filteredApplications.map((application) => (
                <button
                  key={application.id}
                  className={`application-card ${selectedApplication?.id === application.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(application.id)}
                >
                  <div className="application-row">
                    <div>
                      <h3>{application.company}</h3>
                      <p>{application.role}</p>
                    </div>
                    <span className={`status-badge ${statusClass[application.status]}`}>{application.status}</span>
                  </div>
                  <div className="application-meta">
                    <span>{application.location || 'Location not set'}</span>
                    <span>{application.appliedOn || 'No date'}</span>
                  </div>
                </button>
              ))}

              {!filteredApplications.length ? (
                <div className="empty-list">
                  <h3>No tracked applications yet</h3>
                  <p>Save a live job or add one manually to start building your application pipeline.</p>
                </div>
              ) : null}
            </div>

            <div className="detail-panel">
              {selectedApplication ? (
                <>
                  <div className="detail-header">
                    <div>
                      <p className="panel-kicker">{selectedApplication.source}</p>
                      <h2>{selectedApplication.company}</h2>
                      <p className="detail-role">{selectedApplication.role}</p>
                    </div>
                    <span className={`status-badge ${statusClass[selectedApplication.status]}`}>{selectedApplication.status}</span>
                  </div>

                  <div className="detail-grid">
                    <article>
                      <span className="detail-label">Location</span>
                      <strong>{selectedApplication.location || 'Not set'}</strong>
                    </article>
                    <article>
                      <span className="detail-label">Applied on</span>
                      <strong>{selectedApplication.appliedOn || 'Not set'}</strong>
                    </article>
                  </div>

                  <div className="detail-section">
                    <span className="detail-label">Notes</span>
                    <p>{selectedApplication.notes || 'No notes yet.'}</p>
                  </div>

                  <div className="detail-section">
                    <span className="detail-label">Status workflow</span>
                    <div className="status-row">
                      {statuses.map((status) => (
                        <button
                          key={status}
                          className={`status-pill ${selectedApplication.status === status ? 'active' : ''}`}
                          onClick={() => void updateStatus(selectedApplication.id, status)}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="button-row">
                    <button className="primary-button" onClick={() => loadForEdit(selectedApplication)}>
                      Edit entry
                    </button>
                    {selectedApplication.link ? (
                      <a className="secondary-button link-button" href={selectedApplication.link} target="_blank" rel="noreferrer">
                        Open listing
                      </a>
                    ) : null}
                  </div>

                  <div className="button-row danger-row">
                    <button className="secondary-button" onClick={() => void archiveSelected()}>
                      Move to archive
                    </button>
                    <button className="danger-button" onClick={() => void removeSelected()}>
                      Delete
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty-list">
                  <h3>No tracked applications yet</h3>
                  <p>Save a live job or add one manually to start building your application pipeline.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}
