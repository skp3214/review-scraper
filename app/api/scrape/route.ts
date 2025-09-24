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
      // Use scraping script to save directly to final output file
      const scriptPath = path.join(process.cwd(), 'scripts', 'js', 'scrape-reviews.js')
      const outputPath = path.join(process.cwd(), `${source}-reviews.json`)
      
      const command = `node "${scriptPath}" --company "${company}" --start ${startDate} --end ${endDate} --source ${source} --out "${outputPath}" --max-pages 1`
      
      console.log(`[API] Running scraper: ${command}`)
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: 90000, // 90 second timeout
        cwd: process.cwd()
      })
      
      console.log(`[API] Scraper output: ${stdout}`)
      if (stderr) console.error(`[API] Scraper errors: ${stderr}`)
      
      // Check if the output file was created
      if (!fs.existsSync(outputPath)) {
        throw new Error(`Reviews file not created at ${outputPath}`)
      }
      
      // Read the reviews from the output file
      const fileContent = fs.readFileSync(outputPath, 'utf-8')
      const reviews = JSON.parse(fileContent)
      
      return NextResponse.json({
        success: true,
        message: `Successfully scraped ${reviews.length} reviews for ${company} from ${source}`,
        reviews: reviews,
        metadata: {
          company,
          source,
          dateRange: `${startDate} to ${endDate}`,
          totalFound: reviews.length,
          scrapedAt: new Date().toISOString()
        }
      })
      
    } catch (scrapeError: any) {
      console.error(`[API] Real scraping failed: ${scrapeError?.message || scrapeError}`)
      
      return NextResponse.json({
        success: false,
        error: `Real scraping failed for ${source}: ${scrapeError?.message || scrapeError}. This is common due to anti-bot protection.`,
        suggestion: "Real web scraping often encounters anti-bot measures. Try another source or check the logs."
      }, { status: 422 })
    }

  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error: ' + (error?.message || error) },
      { status: 500 }
    )
  }
}