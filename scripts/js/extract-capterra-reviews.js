// scripts/js/extract-capterra-reviews.js
// Extracts reviews from capterra-main.html and saves as JSON for frontend use
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const HTML_PATH = path.resolve('capterra-main.html');
const OUTPUT_PATH = path.resolve('capterra-reviews.json');

function extractReviews(html) {
  const $ = cheerio.load(html);
  const reviews = [];

  // Helper function to clean text
  function cleanText(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  // Capterra review cards - each review is in a div with class "space-y-4 lg:space-y-8"
  // Look for review containers that have the review structure
  $('.space-y-4.lg\\:space-y-8').each((i, el) => {
    const $el = $(el);
    
    // Check if this container has a review title (h3 with class "typo-20 font-semibold")
    const titleEl = $el.find('h3.typo-20.font-semibold');
    if (titleEl.length === 0) return; // Skip if no title found
    
    // Author - look for the reviewer name span with class "typo-20 text-neutral-99 font-semibold"
    const author = cleanText($el.find('span.typo-20.text-neutral-99.font-semibold').first().text());
    
    // Date - look for the div with class "typo-0 text-neutral-90"
    const date = cleanText($el.find('div.typo-0.text-neutral-90').first().text());
    
    // Rating - look for the overall rating span with class "sr2r3oj"
    let rating = null;
    const ratingEl = $el.find('span.sr2r3oj').first();
    if (ratingEl.length > 0) {
      rating = parseFloat(ratingEl.text().trim());
    }
    
    // Title - get the h3 title text and clean it, remove unnecessary quotes
    const title = cleanText(titleEl.text()).replace(/^"|"$/g, '');
    
    // Body - look for review content in paragraphs after the title
    let body = '';
    const bodyParagraphs = $el.find('p');
    bodyParagraphs.each((j, p) => {
      const pText = $(p).text().trim();
      if (pText && !pText.includes('Review Source') && !pText.includes('Used the software for')) {
        body += pText + ' ';
      }
    });
    body = cleanText(body);
    
    // Pros - look for content after "Pros" span (with positive icon)
    let pros = '';
    $el.find('span').each((j, span) => {
      const spanText = $(span).text().trim();
      if (spanText === 'Pros') {
        const prosContainer = $(span).parent().parent();
        const prosText = prosContainer.find('p').text().trim();
        if (prosText) pros = cleanText(prosText);
        return false; // break
      }
    });
    
    // Cons - look for content after "Cons" span (with negative icon)
    let cons = '';
    $el.find('span').each((j, span) => {
      const spanText = $(span).text().trim();
      if (spanText === 'Cons') {
        const consContainer = $(span).parent().parent();
        const consText = consContainer.find('p').text().trim();
        if (consText) cons = cleanText(consText);
        return false; // break
      }
    });

    // Additional info - company size, industry, etc.
    const additionalInfo = cleanText($el.find('.typo-10.text-neutral-90').first().text());

    if (title && author) {
      reviews.push({ 
        author, 
        date, 
        rating, 
        title, 
        body, 
        pros, 
        cons, 
        additionalInfo 
      });
    }
  });

  return reviews;
}

function main() {
  if (!fs.existsSync(HTML_PATH)) {
    console.error('HTML file not found:', HTML_PATH);
    process.exit(1);
  }
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  const reviews = extractReviews(html);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(reviews, null, 2), 'utf-8');
  console.log(`Extracted ${reviews.length} reviews to ${OUTPUT_PATH}`);
}

main();
