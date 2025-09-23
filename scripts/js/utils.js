export const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]

export function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

export function stripText(s) {
  return (s || "").replace(/\s+/g, " ").trim()
}

export function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export function jitteredDelay(baseMs = 800, jitterMs = 300) {
  const n = Math.max(0, Math.round(baseMs + (Math.random() * 2 - 1) * jitterMs))
  return sleep(n)
}

export async function fetchText(url, { params, headers, timeoutMs = 30000 } = {}) {
  const u = new URL(url)
  if (params) {
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)))
  }
  const controller = new AbortController()
  const to = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(u.toString(), {
      headers,
      method: "GET",
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      const err = new Error(`HTTP ${res.status} ${res.statusText} on ${u}`)
      err.status = res.status
      err.body = text
      throw err
    }
    return await res.text()
  } finally {
    clearTimeout(to)
  }
}

export async function fetchWithRetry(url, opts = {}) {
  const {
    retries = 3,
    backoffBaseMs = 2000,
    backoffFactor = 2.0,
    statusRetry = new Set([429, 500, 502, 503, 504]),
  } = opts
  let attempt = 0
  // Attach default headers with randomized UA once
  const headers = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document", 
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    Pragma: "no-cache",
    "User-Agent": randomUA(),
    ...(opts.headers || {}),
  }

  // Add a small initial delay to avoid being too aggressive
  await sleep(500 + Math.random() * 1000)

  while (true) {
    try {
      console.log(`[Fetch] Attempt ${attempt + 1}/${retries + 1} for ${url}`)
      const response = await fetchText(url, { ...opts, headers })
      console.log(`[Fetch] Success for ${url} (${response.length} chars)`)
      return response
    } catch (e) {
      console.error(`[Fetch] Attempt ${attempt + 1} failed for ${url}: ${e.message}`)
      
      attempt += 1
      const status = e?.status
      if (attempt > retries || (status && !statusRetry.has(status))) {
        console.error(`[Fetch] All ${retries + 1} attempts failed for ${url}`)
        throw e
      }
      const delay = Math.round(backoffBaseMs * Math.pow(backoffFactor, attempt - 1))
      console.log(`[Fetch] Waiting ${delay}ms before retry...`)
      await sleep(delay)
    }
  }
}

// Returns Date or null
export function parseDateFlexible(text) {
  if (!text) return null
  let t = String(text).trim()
  t = t.replace(/(\d+)(st|nd|rd|th)/gi, "$1")

  // Try ISO inside string
  const iso = t.match(/\d{4}-\d{2}-\d{2}/)
  if (iso) {
    const d = new Date(iso[0])
    if (!isNaN(d)) return d
  }

  // Month day, year
  // e.g., Jan 02, 2024 or January 2, 2024
  const mdY = t.match(
    /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}/i,
  )
  if (mdY) {
    const d = new Date(mdY[0])
    if (!isNaN(d)) return d
  }

  // Month Year
  const mY = t.match(
    /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}/i,
  )
  if (mY) {
    const d = new Date(mY[0])
    if (!isNaN(d)) return d
  }

  // m/d/Y
  const mdY2 = t.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/)
  if (mdY2) {
    const [m, d, y] = mdY2[0].split("/").map((x) => Number.parseInt(x, 10))
    const dt = new Date(y, m - 1, d)
    if (!isNaN(dt)) return dt
  }

  return null
}

export function inRange(d, start, end) {
  if (!(d instanceof Date) || isNaN(d)) return false
  return d >= start && d <= end
}

export async function saveJson(path, data) {
  const { writeFile } = await import("node:fs/promises")
  await writeFile(path, JSON.stringify(data, null, 2), { encoding: "utf-8" })
}
