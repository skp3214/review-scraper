import fs from 'fs';
import * as cheerio from 'cheerio';

/**
 * Extract genuine user reviews from saved G2 HTML content
 * @param {string} htmlFilePath - Path to the saved G2 HTML file
 * @returns {Array} Array of extracted review objects
 */
export function extractG2Reviews(htmlFilePath = 'g2-main.html') {
    try {
        const html = fs.readFileSync(htmlFilePath, 'utf8');
        const $ = cheerio.load(html);
        const reviews = [];

        console.log('🔍 Extracting G2 reviews from saved HTML...');

        // Target specific patterns for actual review content
        $('p.elv-tracking-normal.elv-text-default').each((i, el) => {
            const $el = $(el);
            const text = $el.text().trim();
            
            // Filter out promotional/generic content
            const isPromoContent = text.includes('Thousands of people') || 
                                  text.includes('come to G2 to find out') ||
                                  text.includes('Share your real experiences') ||
                                  text.includes('Product Details') ||
                                  text.includes('CancelDone') ||
                                  text.includes('LinkedIn®') ||
                                  text.includes('Visit Website') ||
                                  text.includes('Product Website');
            
            // Check for genuine user review patterns
            const hasReviewContent = text.includes('using') || text.includes('software') || 
                                   text.includes('experience') || text.includes('recommend') || 
                                   text.includes('great') || text.includes('love') ||
                                   text.includes('issue') || text.includes('pros') || 
                                   text.includes('cons') || text.includes('helpful') || 
                                   text.includes('team') || text.includes('work') ||
                                   text.includes('like best') || text.includes('dislike');

            if (!isPromoContent && hasReviewContent && text.length > 50 && text.length < 800) {
                // Find associated question/title
                const $section = $el.closest('section');
                let title = 'User Review';
                
                if ($section.length) {
                    const sectionText = $section.text();
                    const questionMatch = sectionText.match(/(What do you [^?]+\?|How [^?]+\?|Why [^?]+\?)/i);
                    if (questionMatch) {
                        title = questionMatch[1].trim();
                    }
                }
                
                // Clean up content
                let cleanContent = text
                    .replace(/\s*Review collected by and hosted on G2\.com\.\s*$/i, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                
                if (cleanContent.length > 30) {
                    const review = {
                        id: `g2-review-${reviews.length + 1}`,
                        title: title,
                        content: cleanContent,
                        rating: null,
                        reviewer: '',
                        date: '',
                        company: '',
                        verified: false,
                        helpful: null,
                        source: 'G2'
                    };
                    
                    reviews.push(review);
                }
            }
        });

        console.log(`✅ Extracted ${reviews.length} genuine G2 reviews`);

        // Statistics
        if (reviews.length > 0) {
            const contentLengths = reviews.map(r => r.content.length);
            const avgLength = Math.round(contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length);
            
            console.log(`📊 Average content length: ${avgLength} characters`);
            console.log(`📊 Shortest: ${Math.min(...contentLengths)}, Longest: ${Math.max(...contentLengths)}`);
        }

        return reviews;

    } catch (error) {
        console.error('❌ Error extracting G2 reviews:', error.message);
        return [];
    }
}

// Run the extraction directly
const reviews = extractG2Reviews('g2-main.html');

if (reviews.length > 0) {
    // Save clean results
    fs.writeFileSync('g2-reviews.json', JSON.stringify(reviews, null, 2));
    console.log(`💾 Saved ${reviews.length} reviews to g2-reviews.json`);
    
    // Show samples
    console.log('\n🔍 Sample reviews:');
    reviews.slice(0, 3).forEach((review, i) => {
        console.log(`\n${i + 1}. ${review.title}`);
        console.log(`   "${review.content.slice(0, 120)}..."`);
    });
} else {
    console.log('⚠️ No reviews extracted. Check HTML file and patterns.');
}

// Export for module use
export { extractG2Reviews };

// Run extraction when called directly
extractG2Reviews();