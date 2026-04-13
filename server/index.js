import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(dirname(__dirname), '.env.local') })
dotenv.config()

const PORT = Number(process.env.PORT || 8787)
const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID || process.env.VITE_ADZUNA_APP_ID || ''
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY || process.env.VITE_ADZUNA_APP_KEY || ''

const app = express()
app.use(cors())
app.use(express.json())

function shouldPreferTechCategory(query) {
  const normalized = query.toLowerCase()
  const techSignals = [
    'software',
    'developer',
    'engineer',
    'data',
    'analyst',
    'cyber',
    'security',
    'ai',
    'machine learning',
    'frontend',
    'backend',
    'full stack',
    'devops',
    'cloud',
    'product',
    'ux',
    'designer',
    'qa',
    'automation',
    'it ',
    'tech',
  ]

  return techSignals.some((signal) => normalized.includes(signal))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitQueryTokens(query) {
  return query
    .toLowerCase()
    .split(/[\s,/-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
}

function matchesQuery(job, query) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  const haystack = `${job.title} ${job.company} ${job.description} ${job.location}`.toLowerCase()
  if (haystack.includes(normalizedQuery)) return true

  const tokens = splitQueryTokens(query)
  if (!tokens.length) return true

  const tokenMatches = tokens.filter((token) => {
    const pattern = new RegExp(`\\b${escapeRegExp(token)}`, 'i')
    return pattern.test(haystack)
  })

  return tokenMatches.length >= Math.max(1, Math.ceil(tokens.length * 0.6))
}

function formatSalary(min, max) {
  if (!min && !max) return 'Salary not listed'

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })

  if (min && max) return `${formatter.format(min)} - ${formatter.format(max)}`
  return formatter.format(min ?? max ?? 0)
}

async function fetchLiveJobs(query, location) {
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
    throw new Error('Adzuna credentials are missing on the server.')
  }

  const prefersTechCategory = shouldPreferTechCategory(query)
  const attempts = prefersTechCategory
    ? [
        { query, location, category: 'it-jobs', label: `Showing current tech roles near ${location}.` },
        { query, location, category: '', label: `Showing broader current roles near ${location}.` },
        { query, location: '', category: 'it-jobs', label: 'Showing current tech roles across the U.S.' },
        { query, location: '', category: '', label: 'Showing broader current roles across the U.S.' },
      ]
    : [
        { query, location, category: '', label: `Showing current roles near ${location}.` },
        { query, location: '', category: '', label: 'Showing current roles across the U.S.' },
      ]

  for (const attempt of attempts) {
    const url =
      `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${ADZUNA_APP_ID}` +
      `&app_key=${ADZUNA_APP_KEY}` +
      `&results_per_page=10` +
      `&what=${encodeURIComponent(attempt.query)}` +
      `&sort_by=date` +
      (attempt.location ? `&where=${encodeURIComponent(attempt.location)}` : '') +
      (attempt.category ? `&category=${encodeURIComponent(attempt.category)}` : '')

    const response = await fetch(url)
    if (!response.ok) continue

    const data = await response.json()
    const jobs =
      data.results?.map((job) => ({
        id: String(job.id),
        title: job.title,
        company: job.company?.display_name || 'Unknown company',
        location: job.location?.display_name || attempt.location || 'Location not listed',
        link: job.redirect_url,
        created: job.created,
        salary: formatSalary(job.salary_min, job.salary_max),
        description: job.description,
      }))
        .filter((job) => matchesQuery(job, query)) ?? []

    if (jobs.length) {
      return { jobs, notice: attempt.label }
    }
  }

  return {
    jobs: [],
    notice: '',
  }
}

// Health checks keep local development simple and give deploy targets
// a low-cost endpoint to verify the API is online.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

// The web app talks to Supabase directly for auth + tracker storage.
// This server is intentionally scoped to live job discovery only.
app.get('/api/jobs/search', async (req, res) => {
  const query = String(req.query.q || '').trim()
  const location = String(req.query.location || '').trim()

  if (!query) {
    res.status(400).json({ error: 'A search query is required.' })
    return
  }

  try {
    const result = await fetchLiveJobs(query, location)
    res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load live jobs right now.'
    res.status(500).json({ error: message })
  }
})

app.listen(PORT, () => {
  console.log(`ApplyFlow API listening on http://localhost:${PORT}`)
})
