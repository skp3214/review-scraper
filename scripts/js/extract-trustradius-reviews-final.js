import fs from 'fs';
import * as cheerio from 'cheerio';

function extractTrustRadiusReviews() {
    console.log('🔍 Extracting TrustRadius reviews from saved HTML...');
    
    try {
        // Read the saved HTML file
        const html = fs.readFileSync('trustradius-main.html', 'utf8');
        const $ = cheerio.load(html);
        
        const reviews = [];
        
        // TrustRadius reviews are in article elements with ReviewNew_article__IlReR class
        const reviewArticles = $('article.ReviewNew_article__IlReR, article[class*="ReviewNew"]');
        
        console.log(`📦 Found ${reviewArticles.length} TrustRadius review articles`);
        
        reviewArticles.each((index, element) => {
            try {
                const $review = $(element);
                
                // Extract review title from header h4
                const title = $review.find('header h4 a').text().trim() || 
                             $review.find('h1, h2, h3, h4, h5, h6').first().text().trim() || 
                             'No title';
                
                // Extract rating from data-rating attribute or text
                let rating = null;
                const starsContainer = $review.find('[data-rating]');
                if (starsContainer.length > 0) {
                    rating = parseInt(starsContainer.attr('data-rating'));
                } else {
                    const ratingText = $review.text().match(/Rating:\s*(\d+)\s*out\s*of\s*(\d+)/i);
                    if (ratingText) {
                        rating = parseInt(ratingText[1]);
                    }
                }
                
                // Extract date from header
                let date = new Date().toISOString().split('T')[0]; // Default to current date
                const dateElement = $review.find('.Header_date__bW46N, [class*="Header_date"]');
                if (dateElement.length > 0) {
                    const dateText = dateElement.text().trim();
                    // Try to parse the date (format might be "July 29, 2025")
                    try {
                        const parsedDate = new Date(dateText);
                        if (!isNaN(parsedDate.getTime())) {
                            date = parsedDate.toISOString().split('T')[0];
                        }
                    } catch (err) {
                        // Keep default date
                    }
                }
                
                // Extract reviewer information from Author article (sibling element)
                let reviewer = 'Anonymous';
                let company = null;
                let jobTitle = null;
                
                const authorElement = $review.find('article.Author_author__LLjip, article[class*="Author"]');
                if (authorElement.length > 0) {
                    // Extract reviewer name from byline
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
                    
                    // Look for job title and company in the full author text
                    const authorText = authorElement.text();
                    const lines = authorText.split('\n').map(line => line.trim()).filter(line => line.length > 2);
                    
                    for (const line of lines) {
                        if (line.includes('employees') && !company) {
                            company = line;
                        } else if (line.length > 2 && line.length < 50 && 
                                 !jobTitle && 
                                 !line.includes('employees') && 
                                 !line.includes('experience') &&
                                 !line.includes('Review') &&
                                 !line.includes('Vetted') &&
                                 !line.includes('View profile') &&
                                 line !== reviewer) {
                            jobTitle = line;
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
                            if (sectionTitle === 'Pros') {
                                allSectionContent.push(`Pros: ${contentLines.join(' ')}`);
                            } else if (sectionTitle === 'Cons') {
                                allSectionContent.push(`Cons: ${contentLines.join(' ')}`);
                            } else if (contentLines.join(' ').length > 50) {
                                allSectionContent.push(contentLines.join(' '));
                            }
                        }
                    });
                    
                    content = allSectionContent.join(' | ');
                }
                
                // If no content from sections, try to extract from the full review body
                if (!content || content.length < 50) {
                    const fullBodyText = reviewBody.text().trim();
                    const lines = fullBodyText.split('\n').map(line => line.trim()).filter(line => line.length > 30);
                    
                    // Find meaningful content lines
                    const meaningfulLines = lines.filter(line => 
                        !line.includes('Use Cases') &&
                        !line.includes('Deployment') &&
                        !line.includes('Scope') &&
                        !line.includes('Likelihood to Recommend') &&
                        !line.includes('Pros') &&
                        !line.includes('Cons') &&
                        line.length > 50
                    );
                    
                    if (meaningfulLines.length > 0) {
                        content = meaningfulLines.slice(0, 3).join(' | ');
                    }
                }
                
                // Skip if no meaningful content found
                if (!content || content.length < 30) {
                    console.log(`⚠️ Skipping review ${index + 1}: insufficient content (${content ? content.length : 0} chars)`);
                    return;
                }
                
                // Create review object
                const review = {
                    source: 'TrustRadius',
                    title: title,
                    reviewer: reviewer,
                    job_title: jobTitle,
                    company: company,
                    rating: rating,
                    date: date,
                    content: content.substring(0, 2000), // Limit content length
                    helpful_count: null,
                    verified: true, // TrustRadius typically has verified reviews
                    review_type: 'general'
                };
                
                reviews.push(review);
                
            } catch (error) {
                console.error(`❌ Error processing review ${index + 1}:`, error.message);
            }
        });
        
        console.log(`✅ Extracted ${reviews.length} TrustRadius reviews`);
        
        if (reviews.length > 0) {
            // Calculate stats
            const avgLength = Math.round(reviews.reduce((sum, r) => sum + r.content.length, 0) / reviews.length);
            const withRating = reviews.filter(r => r.rating !== null).length;
            const avgRating = withRating > 0 ? 
                reviews.filter(r => r.rating !== null).reduce((sum, r) => sum + r.rating, 0) / withRating : 0;
            
            console.log(`📊 Average content length: ${avgLength} characters`);
            console.log(`📊 Reviews with rating: ${withRating}/${reviews.length}`);
            if (withRating > 0) {
                console.log(`📊 Average rating: ${avgRating.toFixed(1)}/10`);
            }
            
            // Save to JSON
            fs.writeFileSync('trustradius-reviews.json', JSON.stringify(reviews, null, 2));
            console.log('💾 Saved reviews to trustradius-reviews.json');
            
            // Show sample reviews
            console.log('\n🔍 Sample reviews:');
            reviews.slice(0, 3).forEach((review, i) => {
                console.log(`\n${i + 1}. ${review.title}`);
                console.log(`   Reviewer: ${review.reviewer}${review.job_title ? ` (${review.job_title})` : ''}`);
                if (review.rating) console.log(`   Rating: ${review.rating}/10`);
                console.log(`   Content: "${review.content.substring(0, 200)}..."`);
                console.log(`   Verified: ${review.verified}`);
            });
        } else {
            console.log('❌ No reviews were extracted');
        }
        
        return reviews;
        
    } catch (error) {
        console.error('❌ Error reading HTML file:', error.message);
        console.error('Make sure trustradius-main.html exists in the current directory');
        return [];
    }
}

// Run the extraction when called directly
extractTrustRadiusReviews();

export { extractTrustRadiusReviews };