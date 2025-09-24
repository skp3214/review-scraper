import { BaseSource, SourceError } from "./base.js"
import { fetchWithRetry, parseDateFlexible, stripText, jitteredDelay, formatHtml, extractJsonFromHtml } from "../utils.js"

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
      'slack': '135003', 
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

  async _parseReviewsOnPage(html, pageUrl) {
    const out = []
    
    console.log('[Capterra] Attempting JSON extraction using jsdom parser...');
    
    // Try to extract JSON data using jsdom parser
    try {
      const reviewsData = await extractJsonFromHtml(html);
      
      if (reviewsData && reviewsData.length > 0) {
        console.log(`[Capterra] Successfully extracted ${reviewsData.length} reviews from JSON data`);
        
        for (const review of reviewsData) {
          if (review.title && (review.generalComments || review.prosText || review.consText)) {
            const rating = review.overallRating ? parseFloat(review.overallRating) : null;
            const date = review.writtenOn ? new Date(review.writtenOn).toISOString().slice(0, 10) : "";
            
            let description = "";
            if (review.generalComments) description += review.generalComments + " ";
            if (review.prosText) description += "Pros: " + review.prosText + " ";
            if (review.consText) description += "Cons: " + review.consText + " ";
            
            const reviewer = review.reviewer ? 
              `${review.reviewer.fullName || 'Anonymous'} - ${review.reviewer.jobTitle || ''} (${review.reviewer.industry || ''}, ${review.reviewer.companySize || ''})`.trim() :
              'Anonymous';
            
            out.push({
              title: stripText(review.title),
              description: stripText(description.trim()),
              date: date,
              rating: rating,
              reviewer: stripText(reviewer),
              url: pageUrl,
              source: this.name,
              product: pageUrl.includes('/') ? pageUrl.split('/').find(p => p && !p.includes('.')) : 'Unknown',
              extra: {
                verified: review.reviewer?.isValidated || false
              }
            });
          }
        }
        
        if (out.length > 0) {
          console.log(`[Capterra] Successfully parsed ${out.length} reviews from JSON data`);
          return out;
        }
      }
    } catch (error) {
      console.log(`[Capterra] jsdom JSON extraction failed: ${error.message}`);
    }

    // Fallback to HTML parsing if JSON extraction fails or produces no results
    if (out.length === 0) {
      console.log('[Capterra] Using fallback HTML parsing...');
      const blocks = html.includes("review-card")
        ? html.split(/(?=<div[^>]+class="[^"]*review-card)/i)
        : html.split(/(?=<article )/i)

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
    
    console.log(`[Capterra] Fallback HTML extraction found ${out.length} reviews`);
    }
    return out
  }

  async *iterReviews(reviewsUrl, _start, _end, maxPages = 25) {
    const { writeFile } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    
    // Only fetch the main reviews page (no ?page=1 etc)
    const url = reviewsUrl;
    const html = await fetchWithRetry(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      zenRowsParams: {
        'proxy_country': 'us',
        'premium_proxy': 'true',
        'js_render': 'true'
      }
    });
    
    // Save raw HTML to root folder (like G2 and TrustRadius)
    const htmlPath = resolve(process.cwd(), 'capterra-main.html');
    await writeFile(htmlPath, html, { encoding: 'utf-8' });
    console.log(`[Capterra] HTML saved to ${htmlPath} (${html.length} chars)`);
    
    // Extract reviews from HTML
    const items = await this._parseReviewsOnPage(html, url);
    
    // Save extracted reviews to JSON file in root folder (like G2 and TrustRadius)
    const jsonPath = resolve(process.cwd(), 'capterra-reviews.json');
    await writeFile(jsonPath, JSON.stringify(items, null, 2), { encoding: 'utf-8' });
    console.log(`[Capterra] Reviews saved to ${jsonPath} (${items.length} reviews)`);
    
    // Yield each review
    for (const r of items) {
      yield r;
    }
  }
}
