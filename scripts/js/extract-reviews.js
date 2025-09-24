import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

function extractReviews(html, source) {
  const $ = cheerio.load(html);
  const reviews = [];

  // Helper function to clean text
  function cleanText(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  if (source === 'capterra') {
    return extractCapterraReviews($, cleanText);
  } else if (source === 'g2') {
    return extractG2Reviews($, cleanText);
  } else if (source === 'trustradius') {
    return extractTrustRadiusReviews($, cleanText);
  } else {
    throw new Error(`Unsupported source: ${source}`);
  }
}

function extractCapterraReviews($, cleanText) {
  const reviews = [];
  
  $('.space-y-4.lg\\:space-y-8').each((i, el) => {
    const $el = $(el);
    
    const titleEl = $el.find('h3.typo-20.font-semibold');
    if (titleEl.length === 0) return;
    
    const author = cleanText($el.find('span.typo-20.text-neutral-99.font-semibold').first().text());
    const date = cleanText($el.find('div.typo-0.text-neutral-90').first().text());
    
    let rating = null;
    const ratingEl = $el.find('span.sr2r3oj').first();
    if (ratingEl.length > 0) {
      rating = parseFloat(ratingEl.text().trim());
    }
    
    const title = cleanText(titleEl.text()).replace(/^"|"$/g, '');
    
    let body = '';
    const bodyParagraphs = $el.find('p');
    bodyParagraphs.each((j, p) => {
      const pText = $(p).text().trim();
      if (pText && !pText.includes('Review Source') && !pText.includes('Used the software for')) {
        body += pText + ' ';
      }
    });
    body = cleanText(body);
    
    let pros = '';
    $el.find('span').each((j, span) => {
      const spanText = $(span).text().trim();
      if (spanText === 'Pros') {
        const prosContainer = $(span).parent().parent();
        const prosText = prosContainer.find('p').text().trim();
        if (prosText) pros = cleanText(prosText);
        return false;
      }
    });
    
    let cons = '';
    $el.find('span').each((j, span) => {
      const spanText = $(span).text().trim();
      if (spanText === 'Cons') {
        const consContainer = $(span).parent().parent();
        const consText = consContainer.find('p').text().trim();
        if (consText) cons = cleanText(consText);
        return false;
      }
    });

    const additionalInfo = cleanText($el.find('.typo-10.text-neutral-90').first().text());

    if (title && author) {
      reviews.push({ author, date, rating, title, body, pros, cons, additionalInfo });
    }
  });

  return reviews;
}

function extractG2Reviews($, cleanText) {
  const reviews = [];
  const reviewSelectors = [
    '[data-testid="review-card"]',
    '.review-card',
    '.review-item',
    '.paper.paper--white.paper--box',
    '.review'
  ];

  let reviewsFound = false;

  for (const selector of reviewSelectors) {
    $(selector).each((i, el) => {
      const $el = $(el);
      
      let author = '';
      const authorSelectors = ['[data-testid="review-author"]', '.reviewer-name', '.review-author', '.user-name', '.author-name'];
      for (const authSel of authorSelectors) {
        const authorEl = $el.find(authSel);
        if (authorEl.length > 0) {
          author = cleanText(authorEl.first().text());
          break;
        }
      }
      
      let date = '';
      const dateSelectors = ['[data-testid="review-date"]', '.review-date', '.date', 'time', '.review-time'];
      for (const dateSel of dateSelectors) {
        const dateEl = $el.find(dateSel);
        if (dateEl.length > 0) {
          date = cleanText(dateEl.first().text());
          break;
        }
      }
      
      let rating = null;
      const ratingSelectors = ['[data-testid="review-rating"]', '.rating', '.stars', '.star-rating', '[class*="star"]'];
      for (const ratingSel of ratingSelectors) {
        const ratingEl = $el.find(ratingSel);
        if (ratingEl.length > 0) {
          const ratingText = ratingEl.attr('aria-label') || ratingEl.text();
          const ratingMatch = ratingText.match(/([0-9.]+)/);
          if (ratingMatch) {
            rating = parseFloat(ratingMatch[1]);
            break;
          }
        }
      }
      
      let title = '';
      const titleSelectors = ['[data-testid="review-title"]', '.review-title', '.review-headline', 'h3', 'h4', '.title'];
      for (const titleSel of titleSelectors) {
        const titleEl = $el.find(titleSel);
        if (titleEl.length > 0) {
          title = cleanText(titleEl.first().text()).replace(/^"|"$/g, '');
          break;
        }
      }
      
      let body = '';
      const bodySelectors = ['[data-testid="review-content"]', '.review-content', '.review-text', '.review-body', '.content', 'p'];
      for (const bodySel of bodySelectors) {
        const bodyEls = $el.find(bodySel);
        bodyEls.each((j, p) => {
          const pText = $(p).text().trim();
          if (pText && !pText.includes('Show more') && !pText.includes('Show less')) {
            body += pText + ' ';
          }
        });
        if (body.trim()) break;
      }
      body = cleanText(body);

      if (title || body || author) {
        reviews.push({ author, date, rating, title, body, pros: '', cons: '', additionalInfo: '' });
        reviewsFound = true;
      }
    });
    
    if (reviewsFound) break;
  }

  return reviews;
}

function extractTrustRadiusReviews($, cleanText) {
  const reviews = [];
  
  // TrustRadius reviews are in article elements with ReviewNew_article__IlReR class
  const reviewArticles = $('article.ReviewNew_article__IlReR, article[class*="ReviewNew"]');
  
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
      let author = 'Anonymous';
      const authorElement = $review.find('article.Author_author__LLjip, article[class*="Author"]');
      if (authorElement.length > 0) {
        const bylineElement = authorElement.find('.Byline_byline__Wr1dg, [class*="Byline"]');
        if (bylineElement.length > 0) {
          const nameText = bylineElement.text().trim();
          const lines = nameText.split('\n').map(line => line.trim()).filter(line => line);
          if (lines.length >= 2) {
            author = `${lines[0]} ${lines[1]}`.trim();
          } else if (lines.length === 1) {
            author = lines[0];
          }
        }
      }
      
      // Extract the main review content from ReviewNew_body sections
      let body = '';
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
        
        body = allSectionContent.join(' | ');
      }
      
      // Skip if no meaningful content found
      if (body && body.length >= 30) {
        reviews.push({ 
          author: cleanText(author), 
          date: date, 
          rating: rating, 
          title: cleanText(title), 
          body: cleanText(body.substring(0, 1000)), 
          pros: '', 
          cons: '', 
          additionalInfo: '' 
        });
      }
      
    } catch (error) {
      console.error(`Error processing TrustRadius review ${index + 1}:`, error.message);
    }
  });

  return reviews;
}

function main() {
  const args = process.argv.slice(2);
  let source = 'capterra';
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && i + 1 < args.length) {
      source = args[i + 1];
    }
  }

  const HTML_PATH = path.resolve(`${source}-main.html`);
  const OUTPUT_PATH = path.resolve(`${source}-reviews.json`);

  if (!fs.existsSync(HTML_PATH)) {
    console.error('HTML file not found:', HTML_PATH);
    process.exit(1);
  }
  
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  const reviews = extractReviews(html, source);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(reviews, null, 2), 'utf-8');
  console.log(`Extracted ${reviews.length} reviews to ${OUTPUT_PATH}`);
}

main();