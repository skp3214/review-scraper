import { BaseSource, SourceError } from "./base.js"
import { fetchWithRetry, parseDateFlexible, stripText, jitteredDelay } from "../utils.js"

const GETAPP_BASE = "https://www.getapp.com"

export class GetAppSource extends BaseSource {
  constructor() {
    super()
    this.name = "getapp"
  }

  async findProduct(company) {
    const q = String(company || "").trim()
    const searchUrl = `${GETAPP_BASE}/search/`
    const html = await fetchWithRetry(searchUrl, { params: { query: q } })
    // /software/<slug> or /{category}/software/<slug>
    const m = html.match(/href="(\/(?:[a-z-]+\/)?software\/([^"/?#]+)\/?)"/i)
    if (!m) {
      throw new SourceError(`GetApp: Unable to find product for '${company}'`)
    }
    const path = m[1]
    const slug = m[2]
    const productName = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    const reviewsUrl = path.includes("/software/")
      ? `${GETAPP_BASE}${path.replace(/\/$/, "")}/reviews/`
      : `${GETAPP_BASE}/software/${slug}/reviews/`
    return { productName, reviewsUrl }
  }

  _parseReviewsOnPage(html, pageUrl) {
    const blocks = html.split(/(?=<div[^>]+class="[^"]*(?:review|ga-review)[^"]*)/i)
    const out = []
    for (const block of blocks) {
      // Title
      let title = null
      let m = block.match(/<h[23][^>]*class="[^"]*(?:title|heading)[^"]*"[^>]*>([\s\S]*?)<\/h[23]>/i)
      if (!m) m = block.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i)
      if (m) title = stripText((m[1] || "").replace(/<.*?>/g, " "))

      // Reviewer
      let reviewer = null
      m = block.match(/class="[^"]*(?:author|user|reviewer)[^"]*"[^>]*>([^<]{2,80})</i)
      if (m) reviewer = stripText(m[1])

      // Date
      let dateStr = null
      m =
        block.match(/<time[^>]*datetime="([^"]+)"/i) ||
        block.match(/(?:Reviewed|Published)\s*(?:on)?\s*[:-]?\s*<\/?\w*>\s*([^<]{3,40})/i) ||
        block.match(
          /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}/i,
        )
      if (m) dateStr = stripText(m[1])

      // Rating
      let rating = null
      m = block.match(/aria-label="([\d.]+)\s*out of\s*5"/i) || block.match(/([1-5](?:\.\d)?)\s*\/\s*5/)
      if (m) {
        const n = Number.parseFloat(m[1])
        if (!Number.isNaN(n)) rating = n
      }

      // Body
      let body = null
      const paragraphs = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
        .map((mm) => stripText((mm[1] || "").replace(/<.*?>/g, " ")))
        .filter(Boolean)
      if (paragraphs.length) {
        body = paragraphs.join(" ")
      } else {
        const text = stripText(block.replace(/<.*?>/g, " "))
        body = text.slice(0, 1200)
      }

      if (title || body || dateStr || rating || reviewer) {
        const d = parseDateFlexible(dateStr)
        out.push({
          title: title || "(no title)",
          description: body || "",
          date: d && !isNaN(d) ? d.toISOString().slice(0, 10) : "",
          rating,
          reviewer,
          url: pageUrl,
          source: this.name,
        })
      }
    }
    return out
  }

  async *iterReviews(reviewsUrl, _start, _end, maxPages = 25) {
    for (let page = 1; page <= maxPages; page++) {
      const url = `${reviewsUrl}?page=${page}`
      const html = await fetchWithRetry(url)
      const items = this._parseReviewsOnPage(html, url)
      let countOnPage = 0
      for (const r of items) {
        countOnPage += 1
        yield r
      }
      if (countOnPage === 0) break
      await jitteredDelay()
    }
  }
}
