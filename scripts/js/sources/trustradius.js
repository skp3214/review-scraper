import { BaseSource, SourceError } from "./base.js"
import { fetchWithRetry, parseDateFlexible, stripText, jitteredDelay } from "../utils.js"
import * as cheerio from 'cheerio'

const TRUSTRADIUS_BASE = "https://www.trustradius.com"

export class TrustRadiusSource extends BaseSource {
    constructor() {
        super();
        this.name = 'trustradius';
        // Direct product URLs for TrustRadius
        this.productUrls = {
            'slack': 'slack',
            'notion': 'notion',
            'asana': 'asana',
            'trello': 'trello',
            'microsoft-teams': 'microsoft-teams',
            'monday': 'monday-com',
            'clickup': 'clickup',
            'confluence': 'confluence',
            'zoom': 'zoom'
        };
    }

    async findProduct(company) {
        const q = String(company || "").trim().toLowerCase();
        console.log(`[TrustRadius] Searching for product: ${q}`);
        
        // Check if we have a direct URL for this product
        const productKey = q.replace(/\s+/g, '-');
        if (this.productUrls[productKey]) {
            const reviewsUrl = `${TRUSTRADIUS_BASE}/products/${this.productUrls[productKey]}/reviews`;
            console.log(`[TrustRadius] Using direct URL: ${reviewsUrl}`);
            return {
                productName: company,
                reviewsUrl: reviewsUrl
            };
        }

        // Alternative mapping for common variations
        const alternativeKey = this.getAlternativeKey(q);
        if (alternativeKey && this.productUrls[alternativeKey]) {
            const reviewsUrl = `${TRUSTRADIUS_BASE}/products/${this.productUrls[alternativeKey]}/reviews`;
            console.log(`[TrustRadius] Using direct URL (alternative): ${reviewsUrl}`);
            return {
                productName: company,
                reviewsUrl: reviewsUrl
            };
        }

        // Return generic path if no direct URL found
        console.log(`[TrustRadius] No direct URL found for ${company}, using generic path`);
        const reviewsUrl = `${TRUSTRADIUS_BASE}/products/${productKey}/reviews`;
        return {
            productName: company,
            reviewsUrl: reviewsUrl
        };
    }

    getAlternativeKey(company) {
        const alternatives = {
            'microsoft teams': 'microsoft-teams',
            'teams': 'microsoft-teams',
            'monday.com': 'monday',
            'click up': 'clickup',
            'atlassian confluence': 'confluence'
        };
        return alternatives[company];
    }

    async scrapeReviews(companyPath, startDate, endDate, maxPages = 5) {
        console.log(`[TrustRadius] Starting scrape for ${companyPath}`);
        
        const reviews = [];
        let hasMorePages = true;
        let currentPage = 1;

        while (hasMorePages && currentPage <= maxPages) {
            try {
                const url = currentPage === 1 
                    ? `${TRUSTRADIUS_BASE}${companyPath}` 
                    : `${TRUSTRADIUS_BASE}${companyPath}?page=${currentPage}`;
                
                console.log(`[TrustRadius] Fetching: ${url}`);
                
                const response = await fetchWithRetry(url, {
                    js_render: true,
                    premium_proxy: true,
                    proxy_country: 'us',
                    antibot: true,
                    wait: 3000
                });

                if (response && response.data) {
                    console.log(`[TrustRadius] Success for ${url} (${response.data.length} chars)`);
                    
                    // Save HTML for extraction (HTML-first approach)
                    const fs = await import('fs');
                    const htmlFile = `trustradius-main.html`;
                    fs.writeFileSync(htmlFile, response.data);
                    console.log(`[TrustRadius] HTML saved to ${htmlFile} (${response.data.length} chars)`);
                    
                    // Extract reviews using improved targeting
                    console.log(`[TrustRadius] Extracting reviews from HTML using improved targeting...`);
                    const pageReviews = this.extractReviews(response.data, startDate, endDate);
                    
                    if (pageReviews.length === 0 && currentPage === 1) {
                        console.log(`[TrustRadius] No reviews found on first page - might be blocked or page structure changed`);
                        break;
                    }

                    reviews.push(...pageReviews);
                    console.log(`[TrustRadius] Extracted ${pageReviews.length} reviews using improved targeting`);
                    
                    // For now, just get first page to analyze structure
                    hasMorePages = false;
                    currentPage++;
                } else {
                    console.log(`[TrustRadius] No data received for page ${currentPage}`);
                    hasMorePages = false;
                }

            } catch (error) {
                console.error(`[TrustRadius] Error scraping page ${currentPage}:`, error.message);
                hasMorePages = false;
            }
        }

        return reviews;
    }

    async *iterReviews(reviewsUrl, _start, _end, maxPages = 5) {
        const { writeFile } = await import('node:fs/promises');
        
        // reviewsUrl should already be a complete URL from findProduct
        const url = reviewsUrl;
        
        console.log(`[TrustRadius] Fetching: ${url}`);
        
        const html = await fetchWithRetry(url, {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Referer': 'https://www.trustradius.com/',
            },
            zenRowsParams: {
                'proxy_country': 'us',
                'premium_proxy': 'true',
                'js_render': 'true',
                'antibot': 'true',
                'wait': '3000'
            }
        });
        
        // Save raw HTML for debugging/extraction (HTML-first approach)
        const htmlPath = `trustradius-main.html`;
        await writeFile(htmlPath, html, { encoding: 'utf-8' });
        console.log(`[TrustRadius] HTML saved to ${htmlPath} (${html.length} chars)`);
        
        // Parse reviews from the saved HTML
        const items = this._parseReviewsOnPage(html, url);
        for (const r of items) {
            yield r;
        }
    }

    _parseReviewsOnPage(html, pageUrl) {
        const $ = cheerio.load(html);
        const reviews = [];
        
        console.log(`[TrustRadius] Extracting reviews from HTML using improved targeting...`);
        
        // TrustRadius reviews are in article elements with ReviewNew_article__IlReR class
        const reviewArticles = $('article.ReviewNew_article__IlReR, article[class*="ReviewNew"]');
        
        console.log(`[TrustRadius] Found ${reviewArticles.length} review articles`);
        
        reviewArticles.each((index, element) => {
            try {
                const $review = $(element);
                
                // Extract review title from header h4
                const title = $review.find('header h4 a').text().trim() || 
                             $review.find('h1, h2, h3, h4, h5, h6').first().text().trim() || 
                             'No title';
                
                // Extract rating from data-rating attribute
                let rating = null;
                const starsContainer = $review.find('[data-rating]');
                if (starsContainer.length > 0) {
                    const ratingValue = parseInt(starsContainer.attr('data-rating'));
                    // Convert from 10-point scale to 5-point scale for consistency
                    rating = ratingValue ? ratingValue / 2 : null;
                }
                
                // Extract date from header
                let date = new Date().toISOString().split('T')[0]; // Default to current date
                const dateElement = $review.find('.Header_date__bW46N, [class*="Header_date"]');
                if (dateElement.length > 0) {
                    const dateText = dateElement.text().trim();
                    try {
                        const parsedDate = new Date(dateText);
                        if (!isNaN(parsedDate.getTime())) {
                            date = parsedDate.toISOString().split('T')[0];
                        }
                    } catch (err) {
                        // Keep default date
                    }
                }
                
                // Extract reviewer information
                let reviewer = 'Anonymous';
                const authorElement = $review.find('article.Author_author__LLjip, article[class*="Author"]');
                if (authorElement.length > 0) {
                    const bylineElement = authorElement.find('.Byline_byline__Wr1dg, [class*="Byline"]');
                    if (bylineElement.length > 0) {
                        const nameText = bylineElement.text().trim();
                        const lines = nameText.split('\n').map(line => line.trim()).filter(line => line);
                        if (lines.length >= 2) {
                            reviewer = `${lines[0]} ${lines[1]}`.trim();
                        } else if (lines.length === 1) {
                            reviewer = lines[0];
                        }
                    }
                }
                
                // Extract the main review content from ReviewNew_body sections
                let content = '';
                const reviewBody = $review.find('.ReviewNew_body__Ul6dc, [class*="ReviewNew_body"]');
                
                if (reviewBody.length > 0) {
                    const sections = reviewBody.find('section.ReviewAnswer_review-answer__VDFSC, section[class*="ReviewAnswer"]');
                    
                    let allSectionContent = [];
                    
                    sections.each((i, section) => {
                        const $section = $(section);
                        const sectionTitle = $section.find('h1, h2, h3, h4, h5, h6').first().text().trim();
                        
                        // Skip certain sections
                        if (sectionTitle.includes('Likelihood to Recommend')) {
                            return;
                        }
                        
                        // Extract content from this section
                        const sectionText = $section.text().trim();
                        const lines = sectionText.split('\n').map(line => line.trim()).filter(line => line.length > 10);
                        
                        // Filter out title and find meaningful content
                        const contentLines = lines.filter(line => 
                            line !== sectionTitle && 
                            line.length > 20 &&
                            !line.includes('Use Cases') &&
                            !line.includes('Deployment') &&
                            !line.includes('Scope')
                        );
                        
                        if (contentLines.length > 0) {
                            const sectionContent = contentLines.join(' ');
                            if (sectionContent.length > 50) {
                                allSectionContent.push(sectionContent);
                            }
                        }
                    });
                    
                    content = allSectionContent.join(' | ');
                }
                
                // Skip if no meaningful content found
                if (!content || content.length < 30) {
                    return; // Skip this review
                }
                
                // Create review object in the expected format
                const review = {
                    title: title,
                    description: stripText(content.substring(0, 1000)), // Limit content length
                    date: date,
                    rating: rating,
                    reviewer: reviewer,
                    url: pageUrl,
                    source: 'trustradius',
                    extra: {
                        verified: true // TrustRadius typically has verified reviews
                    }
                };
                
                reviews.push(review);
                
            } catch (error) {
                console.error(`[TrustRadius] Error processing review ${index + 1}:`, error.message);
            }
        });
        
        console.log(`[TrustRadius] Extracted ${reviews.length} genuine reviews using improved targeting`);
        
        return reviews;
    }
}