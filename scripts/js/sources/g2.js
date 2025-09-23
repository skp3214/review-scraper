import { BaseSource, SourceError } from "./base.js"
import { fetchWithRetry, parseDateFlexible, stripText, jitteredDelay } from "../utils.js"

const G2_BASE = "https://www.g2.com"

export class G2Source extends BaseSource {
  constructor() {
    super()
    this.name = "g2"
  }

  async findProduct(company) {
    const q = String(company || "").trim().toLowerCase()
    console.log(`[G2] Searching for product: ${q}`)
    
    // Direct URL mapping for known products to avoid search issues
    const directMappings = {
      'notion': 'notion',
      'slack': 'slack',
      'zoom': 'zoom',
      'monday.com': 'monday-com',
      'monday': 'monday-com',
      'asana': 'asana',
      'trello': 'trello',
      'jira': 'jira-software',
      'salesforce': 'salesforce-sales-cloud'
    }
    
    const productSlug = directMappings[q] || q.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    const productName = q.replace(/[^a-z0-9\s]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    const reviewsUrl = `${G2_BASE}/products/${productSlug}/reviews`
    
    console.log(`[G2] Using direct URL: ${reviewsUrl}`)
    
    // Test if the URL is accessible by making a quick request
    try {
      // First try without page parameter
      const testHtml = await fetchWithRetry(reviewsUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Referer': 'https://www.g2.com/',
        }
      })
      
      // Check if we got a valid reviews page
      if (testHtml.includes('review') || testHtml.includes('Review')) {
        console.log(`[G2] Successfully accessed reviews page for ${productName}`)
        return { productName, reviewsUrl }
      } else {
        throw new Error('Page does not contain reviews')
      }
    } catch (error) {
      console.error(`[G2] Direct URL failed: ${error.message}`)
      throw new SourceError(`G2: Unable to access reviews for '${company}' at ${reviewsUrl}. ${error.message}`)
    }
  }

  *_splitBlocks(html) {
    if (html.includes("data-review-id=")) {
      return html.split(/(?=data-review-id=)/)
    }
    return html.split(/(?=<article )/)
  }

  *_extractParagraphs(block) {
    const matches = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    for (const m of matches) {
      const text = stripText((m[1] || "").replace(/<.*?>/g, " "))
      if (text) yield text
    }
  }

  _parseReviewsOnPage(html, pageUrl) {
    console.log(`[G2] Parsing reviews from ${pageUrl}`)
    
    const blocks = Array.from(this._splitBlocks(html))
    const out = []
    
    for (const block of blocks) {
      if (!block.includes('review') && !block.includes('Review')) continue
      
      // Enhanced title extraction
      let title = null
      let titleSelectors = [
        /<h[1-6][^>]*class="[^"]*(?:review|title|heading)[^"]*"[^>]*>([\s\S]*?)<\/h[1-6]>/i,
        /<div[^>]*class="[^"]*(?:review.*title|title.*review)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<span[^>]*class="[^"]*(?:review.*title|title.*review)[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
        /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i
      ]
      
      for (const selector of titleSelectors) {
        const m = block.match(selector)
        if (m) {
          title = stripText((m[1] || "").replace(/<.*?>/g, " "))
          if (title && title.length > 5) break
        }
      }

      // Enhanced date extraction
      let dateStr = null
      let dateSelectors = [
        /<time[^>]*datetime="([^"]+)"/i,
        /<time[^>]*>([^<]+)<\/time>/i,
        /(?:reviewed|published|updated|posted)[\s:]*([^<]{3,40})/i,
        /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}/i,
        /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/
      ]
      
      for (const selector of dateSelectors) {
        const m = block.match(selector)
        if (m) {
          dateStr = stripText(m[1])
          break
        }
      }

      // Enhanced rating extraction  
      let rating = null
      let ratingSelectors = [
        /aria-label="([\d.]+)\s*(?:out of\s*5|stars?|\/5)"/i,
        /(?:rating|score)[\s:"]*([\d.]+)(?:\s*\/\s*5)?/i,
        /([\d.]+)\s*\/\s*5/i,
        /<span[^>]*class="[^"]*(?:rating|stars?)[^"]*"[^>]*>([\d.]+)/i
      ]
      
      for (const selector of ratingSelectors) {
        const m = block.match(selector)
        if (m) {
          const n = Number.parseFloat(m[1])
          if (!Number.isNaN(n) && n >= 0 && n <= 5) {
            rating = n
            break
          }
        }
      }

      // Enhanced reviewer extraction
      let reviewer = null
      let reviewerSelectors = [
        /<span[^>]*class="[^"]*(?:reviewer|author|user)[^"]*"[^>]*>([^<]{2,50})<\/span>/i,
        /<div[^>]*class="[^"]*(?:reviewer|author|user)[^"]*"[^>]*>([^<]{2,50})<\/div>/i,
        /(?:by|from|reviewer?)[\s:]*([^<,\n]{2,50})/i
      ]
      
      for (const selector of reviewerSelectors) {
        const m = block.match(selector)
        if (m) {
          reviewer = stripText(m[1])
          if (reviewer && reviewer.length > 1) break
        }
      }

      // Enhanced body/description extraction
      let body = null
      const paragraphs = Array.from(this._extractParagraphs(block))
      if (paragraphs.length) {
        body = paragraphs.join(" ").substring(0, 1000) // Limit length
      } else {
        // Fallback: extract text content from review blocks
        const reviewTextSelectors = [
          /<div[^>]*class="[^"]*(?:review.*content|content.*review|review.*text|text.*review)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
          /<p[^>]*class="[^"]*(?:review|content)[^"]*"[^>]*>([\s\S]*?)<\/p>/i
        ]
        
        for (const selector of reviewTextSelectors) {
          const m = block.match(selector)
          if (m) {
            body = stripText((m[1] || "").replace(/<.*?>/g, " ")).substring(0, 1000)
            if (body && body.length > 20) break
          }
        }
        
        if (!body) {
          const text = stripText(block.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<.*?>/g, " "))
          if (text.length > 50) {
            body = text.substring(0, 800)
          }
        }
      }

      // Only include if we have substantial content
      if ((title && title.length > 5) || (body && body.length > 20)) {
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
    
    console.log(`[G2] Extracted ${out.length} reviews from page`)
    return out
  }

  async *iterReviews(reviewsUrl, start, end, maxPages = 25) {
    for (let page = 1; page <= maxPages; page++) {
      const url = `${reviewsUrl}?page=${page}`
      const html = await fetchWithRetry(url)
      let countOnPage = 0
      const items = this._parseReviewsOnPage(html, url)
      for (const r of items) {
        countOnPage += 1
        // soft filter here; final filter happens in runner
        yield r
      }
      if (countOnPage === 0) break
      await jitteredDelay()
    }
  }
}
