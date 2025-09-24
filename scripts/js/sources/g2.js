import { BaseSource, SourceError } from "./base.js"
import { fetchWithRetry, parseDateFlexible, stripText, jitteredDelay, extractJsonFromHtml } from "../utils.js"
import * as cheerio from 'cheerio'

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
      // First try without page parameter - explicitly ensure US proxy for G2
      const testHtml = await fetchWithRetry(reviewsUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Referer': 'https://www.g2.com/',
        },
        // Explicitly ensure US proxy for G2 to avoid geo-restrictions
        zenRowsParams: {
          'proxy_country': 'us',
          'premium_proxy': 'true',
          'js_render': 'true'
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

  async _parseReviewsOnPage(html, pageUrl) {
    const out = []
    
    console.log('[G2] Attempting JSON extraction using jsdom parser...');
    
    // First try to extract JSON data using jsdom parser (like Capterra)
    try {
      const reviewsData = await extractJsonFromHtml(html);
      
      if (reviewsData && reviewsData.length > 0) {
        console.log(`[G2] Successfully extracted ${reviewsData.length} reviews from JSON data`);
        
        for (const review of reviewsData) {
          // Adapt to G2's JSON structure (may have different field names)
          if ((review.title || review.headline || review.review_title) && 
              (review.content || review.body || review.review_content || review.description)) {
            
            const rating = review.rating ? parseFloat(review.rating) : 
                          review.score ? parseFloat(review.score) : null;
            const date = review.date || review.created_at || review.review_date || "";
            
            let description = review.content || review.body || review.review_content || review.description || "";
            let title = review.title || review.headline || review.review_title || "User Review";
            
            const reviewer = review.reviewer ? 
              (typeof review.reviewer === 'string' ? review.reviewer : 
               review.reviewer.name || review.reviewer.display_name || 'Anonymous') :
              review.author || review.user || 'Anonymous';
            
            out.push({
              title: stripText(title),
              description: stripText(description),
              date: date,
              rating: rating,
              reviewer: stripText(reviewer),
              url: pageUrl,
              source: this.name,
              product: pageUrl.includes('/') ? pageUrl.split('/').find(p => p && !p.includes('.')) : 'Unknown',
              extra: {
                verified: review.verified || false
              }
            });
          }
        }
        
        if (out.length > 0) {
          console.log(`[G2] Successfully parsed ${out.length} reviews from JSON data`);
          return out;
        }
      }
    } catch (error) {
      console.log(`[G2] jsdom JSON extraction failed: ${error.message}`);
    }

    // Fallback to Cheerio-based HTML parsing if JSON extraction fails
    if (out.length === 0) {
      console.log('[G2] Using fallback Cheerio-based HTML parsing...');
      return this._parseReviewsWithCheerio(html, pageUrl);
    }
    
    return out;
  }

  _parseReviewsWithCheerio(html, pageUrl) {
    // Use improved G2 extraction logic with better content filtering
    try {
      const $ = cheerio.load(html);
      const reviews = [];

      console.log(`[G2] Extracting reviews from HTML using Cheerio targeting...`);

      // Look for review content in various G2 patterns
      const contentSelectors = [
        'div[data-testid*="review"]',  // Modern G2 review containers
        'article[data-testid*="review"]',
        '.review-content',
        '.user-review',
        'div.review-text',
        'p.elv-tracking-normal.elv-text-default'  // Original selector
      ];
      
      let reviewCount = 0;
      
      for (const selector of contentSelectors) {
        $(selector).each((i, el) => {
          const $el = $(el);
          const text = $el.text().trim();
          
          // Skip if already processed or too short/long
          if (text.length < 50 || text.length > 2000) return;
          
          // Filter out promotional/navigation content more aggressively
          const isNonReviewContent = 
            text.includes('Thousands of people') || 
            text.includes('come to G2 to find out') ||
            text.includes('Share your real experiences') ||
            text.includes('Product Details') ||
            text.includes('CancelDone') ||
            text.includes('LinkedIn®') ||
            text.includes('Visit Website') ||
            text.includes('Product Website') ||
            text.includes('Languages Supported') ||
            text.includes('Pricing provided by') ||
            text.includes('Show More') ||
            text.includes('View More Pricing') ||
            text.includes('What do users say about') ||
            text.includes('Integrations') ||
            text.match(/^\s*[\d.]+\s*$/) || // Just numbers/ratings
            text.includes('Overview by') ||
            text.includes('Head of Marketing') ||
            text.startsWith('Seller') ||
            text.startsWith('Discussions');
          
          // Check for genuine user review patterns - more specific
          const hasGenuineReviewContent = 
            (text.includes('experience') && (text.includes('using') || text.includes('with'))) ||
            (text.includes('recommend') && text.includes('software')) ||
            (text.includes('pros') && text.includes('cons')) ||
            (text.includes('love') && text.includes('feature')) ||
            (text.includes('helps') && text.includes('team')) ||
            (text.includes('easy to') && text.includes('use')) ||
            (text.includes('great') && text.includes('tool')) ||
            (text.includes('workflow') && text.includes('productivity')) ||
            (text.match(/\b(I|we|our team|my team)\b.*\b(use|used|find|found)\b/i));

          if (!isNonReviewContent && hasGenuineReviewContent) {
            // Clean up content more thoroughly
            let cleanContent = text
              .replace(/\s*Review collected by and hosted on G2\.com\.\s*$/i, '')
              .replace(/\s*Visit Website\s*/g, ' ')
              .replace(/\s*Product Website\s*/g, ' ')
              .replace(/\s*Show More\s*/g, ' ')
              .replace(/\s*CancelDone\s*/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            
            // Extract a reasonable title from the first sentence or question
            let title = 'User Review';
            const firstSentence = cleanContent.split(/[.!?]/)[0];
            if (firstSentence && firstSentence.length < 100) {
              title = firstSentence.trim();
            }
            
            // Ensure content is substantial
            if (cleanContent.length > 50 && cleanContent.length < 1000) {
              reviews.push({
                title: title,
                description: cleanContent,
                date: '',
                rating: null,
                reviewer: 'Anonymous',
                url: pageUrl,
                source: this.name,
                product: pageUrl.split('/products/')[1] ? pageUrl.split('/products/')[1].split('/')[0] : 'Unknown',
                extra: {}
              });
              reviewCount++;
            }
          }
        });
        
        if (reviewCount > 0) {
          console.log(`[G2] Found ${reviewCount} reviews using selector: ${selector}`);
          break; // Use the first selector that finds reviews
        }
      }

      // Deduplicate reviews by content
      const uniqueReviews = [];
      const seenContent = new Set();
      
      for (const review of reviews) {
        const contentHash = review.description.slice(0, 100); // Use first 100 chars as hash
        if (!seenContent.has(contentHash)) {
          seenContent.add(contentHash);
          uniqueReviews.push(review);
        }
      }

      console.log(`[G2] Extracted ${uniqueReviews.length} unique genuine reviews using Cheerio targeting`);
      return uniqueReviews;

    } catch (error) {
      console.error('[G2] Error in Cheerio extraction, falling back to original method:', error.message);
      
      // Fallback to original method if improved extraction fails
      return this._parseReviewsOnPageOriginal(html, pageUrl);
    }
  }

  _parseReviewsOnPageOriginal(html, pageUrl) {
    // Original parsing logic as backup
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

  async *iterReviews(reviewsUrl, _start, _end, maxPages = 25) {
    const { writeFile } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    
    // Only fetch the main reviews page (no pagination like Capterra)
    const url = reviewsUrl;
    const html = await fetchWithRetry(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://www.g2.com/',
      },
      zenRowsParams: {
        'proxy_country': 'us',
        'premium_proxy': 'true',
        'js_render': 'true'
      }
    });
    
    // Save raw HTML to root folder (like Capterra and TrustRadius)
    const htmlPath = resolve(process.cwd(), 'g2-main.html');
    await writeFile(htmlPath, html, { encoding: 'utf-8' });
    console.log(`[G2] HTML saved to ${htmlPath} (${html.length} chars)`);
    
    // Parse reviews from the saved HTML
    const items = await this._parseReviewsOnPage(html, url);
    
    // Save extracted reviews to JSON file in root folder (like Capterra and TrustRadius)
    const jsonPath = resolve(process.cwd(), 'g2-reviews.json');
    await writeFile(jsonPath, JSON.stringify(items, null, 2), { encoding: 'utf-8' });
    console.log(`[G2] Reviews saved to ${jsonPath} (${items.length} reviews)`);
    
    // Yield each review
    for (const r of items) {
      yield r;
    }
  }
}
