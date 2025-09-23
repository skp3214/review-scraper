import { BaseSource, SourceError } from "./base.js"
import { fetchWithRetry, parseDateFlexible, stripText, jitteredDelay } from "../utils.js"

const CAPTERRA_BASE = "https://www.capterra.com"

export class CapterraSource extends BaseSource {
  constructor() {
    super()
    this.name = "capterra"
  }

  async findProduct(company) {
    const q = String(company || "").trim().toLowerCase()
    console.log(`[Capterra] Searching for product: ${q}`)
    
    // Direct URL mapping for known products using Capterra product IDs
    const directMappings = {
      'notion': '186596',
      'slack': '158654', 
      'zoom': '162994',
      'monday.com': '157846',
      'monday': '157846',
      'asana': '136067',
      'trello': '123024',
      'jira': '132322',
      'salesforce': '132495'
    }
    
    const productId = directMappings[q]
    const productName = q.replace(/[^a-z0-9\s]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    
    let reviewsUrl
    if (productId) {
      // Use the specific URL format: /p/{id}/{name}/reviews/
      const urlName = q.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'product'
      reviewsUrl = `${CAPTERRA_BASE}/p/${productId}/${urlName}/reviews/`
    } else {
      // Fallback for unknown products
      const slug = q.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      reviewsUrl = `${CAPTERRA_BASE}/software/${slug}/reviews/`
    }
    
    console.log(`[Capterra] Using direct URL: ${reviewsUrl}`)
    
    // Test if the URL is accessible
    try {
      const testHtml = await fetchWithRetry(reviewsUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        }
      })
      
      // Check if we got a valid reviews page
      if (testHtml.includes('review') || testHtml.includes('Review') || testHtml.includes('rating')) {
        console.log(`[Capterra] Successfully accessed reviews page for ${productName}`)
        return { productName, reviewsUrl }
      } else {
        throw new Error('Page does not contain reviews')
      }
    } catch (error) {
      console.error(`[Capterra] Direct URL failed: ${error.message}`)
      throw new SourceError(`Capterra: Unable to access reviews for '${company}' at ${reviewsUrl}. ${error.message}`)
    }
  }

  _parseReviewsOnPage(html, pageUrl) {
    const blocks = html.includes("review-card")
      ? html.split(/(?=<div[^>]+class="[^"]*review-card)/i)
      : html.split(/(?=<article )/i)

    const out = []
    for (const block of blocks) {
      // Title
      let title = null
      let m = block.match(/<h[23][^>]*class="[^"]*(?:title|heading)[^"]*"[^>]*>([\s\S]*?)<\/h[23]>/i)
      if (!m) m = block.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i)
      if (m) title = stripText((m[1] || "").replace(/<.*?>/g, " "))

      // Reviewer
      let reviewer = null
      m = block.match(/class="[^"]*(?:reviewer|author|user)[^"]*"[^>]*>([^<]{2,80})</i)
      if (m) reviewer = stripText(m[1])

      // Date
      let dateStr = null
      m =
        block.match(/<time[^>]*datetime="([^"]+)"/i) ||
        block.match(/(?:Reviewed|Review\s*Source|Date)\s*[:-]?\s*<\/?\w*>\s*([^<]{3,40})/i) ||
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
