import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { company, startDate, endDate, source } = body

    // Validate inputs
    if (!company || !startDate || !endDate || !source) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    console.log(`[API] Scraping ${source} for ${company} from ${startDate} to ${endDate}`)

    try {
      // Try to use the actual scraping script
      const scriptPath = path.join(process.cwd(), 'scripts', 'js', 'scrape-reviews.js')
      const outputPath = path.join(process.cwd(), `temp-${Date.now()}.json`)
      
      const command = `node "${scriptPath}" --company "${company}" --start ${startDate} --end ${endDate} --source ${source} --out "${outputPath}" --max-pages 5`
      
      console.log(`[API] Running: ${command}`)
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000, // 60 second timeout
        cwd: process.cwd()
      })
      
      console.log(`[API] Script output: ${stdout}`)
      if (stderr) console.error(`[API] Script errors: ${stderr}`)
      
      // Read the output file
      if (fs.existsSync(outputPath)) {
        const fileContent = fs.readFileSync(outputPath, 'utf-8')
        const reviews = JSON.parse(fileContent)
        
        // Clean up temp file
        fs.unlinkSync(outputPath)
        
        return NextResponse.json({
          success: true,
          message: `Successfully scraped ${reviews.length} reviews for ${company} from ${source}`,
          reviews: reviews,
          metadata: {
            company,
            source,
            dateRange: `${startDate} to ${endDate}`,
            totalFound: reviews.length,
            method: 'real-scraping'
          }
        })
      } else {
        throw new Error('Output file not created')
      }
      
    } catch (scrapeError: any) {
      console.error(`[API] Real scraping failed: ${scrapeError?.message || scrapeError}`)
      
      // Fallback to mock data only if user explicitly requests it
      if (source === 'mock') {
        const mockReviews = [
          {
            title: "Excellent product for productivity",
            description: "This tool has significantly improved our team's workflow. The interface is intuitive and the features are well-designed.",
            date: startDate,
            rating: 4.5,
            reviewer: "Product Manager",
            url: `https://mock.example.com/products/${company.toLowerCase()}/reviews`,
            source: source,
            product: company,
            extra: {}
          },
          {
            title: "Good value for money", 
            description: "We've been using this for 6 months. It does what it promises and the customer support is responsive.",
            date: new Date(new Date(startDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            rating: 4.0,
            reviewer: "IT Director",
            url: `https://mock.example.com/products/${company.toLowerCase()}/reviews`,
            source: source,
            product: company,
            extra: {}
          }
        ]

        return NextResponse.json({
          success: true,
          message: `Mock data: Found ${mockReviews.length} sample reviews for ${company}`,
          reviews: mockReviews,
          metadata: {
            company,
            source,
            dateRange: `${startDate} to ${endDate}`,
            totalFound: mockReviews.length,
            method: 'mock-data'
          }
        })
      } else {
        return NextResponse.json({
          success: false,
          error: `Real scraping failed for ${source}: ${scrapeError?.message || scrapeError}. This is common due to anti-bot protection. Try using 'mock' source for testing.`,
          suggestion: "Real web scraping often encounters anti-bot measures. For reliable testing, use the 'Mock (Demo)' source option."
        }, { status: 422 })
      }
    }

  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error: ' + (error?.message || error) },
      { status: 500 }
    )
  }
}