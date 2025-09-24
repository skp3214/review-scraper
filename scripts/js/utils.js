// ZenRows API configuration
export const ZENROWS_API_KEY = 'efc079b4c9b097cbda679ba532dd7667c1144b9b'
export const ZENROWS_API_URL = 'https://api.zenrows.com/v1/'

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

// Fetch through ZenRows proxy API to bypass anti-bot protection
export async function fetchWithZenRows(url, { params, headers, timeoutMs = 60000, zenRowsParams = {} } = {}) {
  const zenRowsUrl = new URL(ZENROWS_API_URL)
  zenRowsUrl.searchParams.set('url', url)
  zenRowsUrl.searchParams.set('apikey', ZENROWS_API_KEY)
  
  // Default ZenRows parameters for better success rate
  const defaultZenRowsParams = {
    'js_render': 'true',          // Enable JavaScript rendering
    'premium_proxy': 'true',      // Use premium proxies
    'antibot': 'true',           // Enable anti-bot bypass
    'proxy_country': 'us'        // Use US proxies to avoid georestrictions
  }
  
  // Merge default params with custom zenRowsParams (custom params take precedence)
  const finalZenRowsParams = { ...defaultZenRowsParams, ...zenRowsParams }
  
  // Add all ZenRows parameters
  Object.entries(finalZenRowsParams).forEach(([key, value]) => {
    zenRowsUrl.searchParams.set(key, String(value))
  })
  
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      const originalUrl = new URL(url)
      originalUrl.searchParams.set(k, String(v))
      zenRowsUrl.searchParams.set('url', originalUrl.toString())
    })
  }

  const controller = new AbortController()
  const to = setTimeout(() => controller.abort(), timeoutMs)
  try {
    console.log(`[ZenRows] Fetching: ${url}`)
    const res = await fetch(zenRowsUrl.toString(), {
      method: "GET",
      signal: controller.signal,
      headers: {
        ...(headers || {}),
        'Accept-Encoding': 'gzip, deflate',
      },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      const err = new Error(`ZenRows API error: HTTP ${res.status} ${res.statusText} for ${url}`)
      err.status = res.status
      err.body = text
      throw err
    }
    const responseText = await res.text()
    console.log(`[ZenRows] Success for ${url} (${responseText.length} chars)`)
    return responseText
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

  // Add a small initial delay to avoid being too aggressive
  await sleep(500 + Math.random() * 1000)

  while (true) {
    try {
      console.log(`[ZenRows] Attempt ${attempt + 1}/${retries + 1} for ${url}`)
      const response = await fetchWithZenRows(url, opts)
      console.log(`[ZenRows] Success for ${url} (${response.length} chars)`)
      return response
    } catch (e) {
      console.error(`[ZenRows] Attempt ${attempt + 1} failed for ${url}: ${e.message}`)
      
      attempt += 1
      const status = e?.status
      if (attempt > retries || (status && !statusRetry.has(status))) {
        console.error(`[ZenRows] All ${retries + 1} attempts failed for ${url}`)
        throw e
      }
      const delay = Math.round(backoffBaseMs * Math.pow(backoffFactor, attempt - 1))
      console.log(`[ZenRows] Waiting ${delay}ms before retry...`)
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

/**
 * Format HTML to make it more readable by adding line breaks after key tags
 * This is especially useful for minified HTML from sites like Capterra
 */
export function formatHtml(html) {
  if (!html || typeof html !== 'string') return html;
  
  return html
    // Add line breaks after closing tags
    .replace(/></g, '>\n<')
    // Add line breaks after opening script tags
    .replace(/<script([^>]*)>/g, '<script$1>\n')
    // Add line breaks before closing script tags
    .replace(/<\/script>/g, '\n</script>')
    // Add line breaks around JSON-like structures
    .replace(/(\{[^}]*"reviews"[^}]*:)/g, '\n$1')
    .replace(/(\{[^}]*"textReviews"[^}]*:)/g, '\n$1')
    // Clean up multiple consecutive line breaks
    .replace(/\n{3,}/g, '\n\n')
    // Trim whitespace
    .trim();
}

/**
 * Extract JSON data from HTML using jsdom for better parsing
 * Looks for script tags containing JSON data with review information
 */
export async function extractJsonFromHtml(html) {
  try {
    const reviews = [];
    
    console.log('[HTML Parser] Searching for review data in HTML...');
    
    // Search for different review identifier patterns
    const reviewPatterns = [
      'reviewId',      // Capterra
      'review_id',     // Alternative format
      'id.*review',    // G2 or other sites
      'review.*content', // Generic review content
      'user.*review',  // User review pattern
    ];
    
    let foundAny = false;
    
    for (const pattern of reviewPatterns) {
      let pos = 0;
      const regex = new RegExp(pattern, 'i');
      
      // Find all occurrences of this pattern and extract complete JSON objects
      while ((pos = html.search(regex)) !== -1) {
        foundAny = true;
        try {
          // Find the start of the JSON object by going backwards to find the opening brace
          let startPos = pos;
          while (startPos > 0 && html[startPos] !== '{') {
            startPos--;
          }
          
          if (startPos === 0 || html[startPos] !== '{') {
            // Remove the found pattern to continue searching
            html = html.slice(0, pos) + html.slice(pos + pattern.length);
            continue;
          }
          
          // Now find the end of the JSON object by counting braces
          let braceCount = 0;
          let endPos = startPos;
          let inString = false;
          let escaped = false;
          
          for (let i = startPos; i < html.length && i < startPos + 5000; i++) {
            const char = html[i];
            
            if (escaped) {
              escaped = false;
              continue;
            }
            
            if (char === '\\') {
              escaped = true;
              continue;
            }
            
            if (char === '"' && !escaped) {
              inString = !inString;
              continue;
            }
            
            if (!inString) {
              if (char === '{') braceCount++;
              if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                  endPos = i + 1;
                  break;
                }
              }
            }
          }
          
          let jsonStr = html.substring(startPos, endPos);
          
          // The JSON might be escaped, so try to unescape it
          if (jsonStr.includes('\\"')) {
            jsonStr = jsonStr.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          }
          
          const reviewObj = JSON.parse(jsonStr);
          
          // Check if this looks like a review object (flexible criteria)
          const hasReviewFields = (
            reviewObj.reviewId || reviewObj.review_id || reviewObj.id
          ) && (
            reviewObj.title || reviewObj.headline || reviewObj.review_title ||
            reviewObj.content || reviewObj.body || reviewObj.review_content ||
            reviewObj.description || reviewObj.generalComments ||
            reviewObj.prosText || reviewObj.consText
          );
          
          if (hasReviewFields) {
            reviews.push(reviewObj);
          }
          
        } catch (e) {
          // Skip invalid JSON and continue
        }
        
        // Move past this occurrence to continue searching
        html = html.slice(0, pos) + html.slice(pos + 8);
      }
      
      if (reviews.length > 0) {
        console.log(`[HTML Parser] Successfully extracted ${reviews.length} reviews using pattern: ${pattern}`);
        return reviews;
      }
    }
    
    if (!foundAny) {
      console.log('[HTML Parser] No review patterns found in HTML');
    } else {
      console.log('[HTML Parser] Found review patterns but no valid review objects');
    }
    
    return null;
    
  } catch (error) {
    console.log(`[HTML Parser] Extraction failed: ${error.message}`);
    return null;
  }
}

/**
 * Recursively search for review arrays in a JSON object
 */
function findReviewsInObject(obj, depth = 0) {
  if (depth > 10) return []; // Prevent infinite recursion
  
  const results = [];
  
  if (Array.isArray(obj)) {
    // Check if this looks like a reviews array
    if (obj.length > 0 && obj[0] && typeof obj[0] === 'object') {
      const firstItem = obj[0];
      if (firstItem.reviewId || firstItem.title || firstItem.generalComments || firstItem.prosText) {
        results.push(obj);
      }
    }
    
    // Also search within array items
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        results.push(...findReviewsInObject(item, depth + 1));
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    // Check direct properties for review arrays
    if (obj.reviews && Array.isArray(obj.reviews)) {
      results.push(obj.reviews);
    }
    if (obj.textReviews && Array.isArray(obj.textReviews)) {
      results.push(obj.textReviews);
    }
    
    // Recursively search other properties
    for (const key in obj) {
      if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
        results.push(...findReviewsInObject(obj[key], depth + 1));
      }
    }
  }
  
  return results;
}
