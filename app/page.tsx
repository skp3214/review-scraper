"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function ReviewScraperApp() {
  const [company, setCompany] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [source, setSource] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [reviewsPerPage] = useState(5)

  // Function to create user-friendly error messages
  const getErrorMessage = (error: string) => {
    if (error.includes('403 Forbidden') || error.includes('anti-bot protection')) {
      return "Unable to access reviews - the website is blocking automated requests"
    }
    if (error.includes('404') || error.includes('not found')) {
      return "Product not found on the selected platform"
    }
    if (error.includes('timeout') || error.includes('ETIMEDOUT')) {
      return "Request timed out - the website is taking too long to respond"
    }
    if (error.includes('Command failed') || error.includes('scraping failed')) {
      return "Scraping failed due to website protection measures"
    }
    if (error.includes('Network error') || error.includes('fetch')) {
      return "Network connection error - please check your internet connection"
    }
    // Fallback for any other errors
    return "Unable to scrape reviews from this source"
  } 

  const handleScrape = async () => {
    if (!company || !startDate || !endDate || !source) {
      alert("Please fill in all fields")
      return
    }
    
    setIsLoading(true)
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company,
          startDate,
          endDate,
          source,
        }),
      })

      const data = await response.json()
      
      if (response.ok) {
        setResults(data)
        setCurrentPage(1) // Reset to first page when new results arrive
      } else {
        setResults({ error: data.error || 'Failed to scrape reviews' })
      }
    } catch (error) {
      console.error("Error:", error)
      setResults({ error: 'Network error occurred' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>SaaS Review Scraper</CardTitle>
          <CardDescription>
            Scrape product reviews from G2, Capterra, and TrustRadius
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="company">Company Name</Label>
            <Input
              id="company"
              placeholder="e.g., Notion"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          
          <div>
            <Label htmlFor="startDate">Start Date</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          
          <div>
            <Label htmlFor="endDate">End Date</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          
          <div>
            <Label htmlFor="source">Source</Label>
            <Select onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue placeholder="Select a source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="g2">G2 (Real Scraping)</SelectItem>
                <SelectItem value="capterra">Capterra (Real Scraping)</SelectItem>
                <SelectItem value="trustradius">TrustRadius (Real Scraping)</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-gray-500 mt-1">
              <strong>Real Scraping:</strong> Attempts to fetch actual reviews but may encounter anti-bot protection.<br/>
              <strong>Mock:</strong> Returns sample data for reliable testing and demonstration.
            </div>
          </div>
          
          <Button 
            onClick={handleScrape} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? "Scraping..." : "Scrape Reviews"}
          </Button>
          
          {results && (
            <div className="mt-4 space-y-4">
              {results.error ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">⚠️</span>
                    <div className="flex-1">
                      <strong>Scraping Failed</strong>
                      <p className="mt-1">{getErrorMessage(results.error)}</p>
                      <div className="mt-3 p-3 bg-red-100 rounded text-sm">
                        <strong>💡 What you can do:</strong>
                        <ul className="mt-1 ml-4 list-disc">
                          <li>Try the <strong>"Mock (Demo)"</strong> source for testing</li>
                          <li>Real web scraping often encounters anti-bot protection</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={`p-4 border rounded ${
                    results.metadata?.method === 'real-scraping' || results.metadata?.method === 'html-extraction' 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-blue-50 border-blue-200'
                  }`}>
                    <div className={`font-medium ${
                      results.metadata?.method === 'real-scraping' || results.metadata?.method === 'html-extraction'
                        ? 'text-green-800' 
                        : 'text-blue-800'
                    }`}>
                      {results.message}
                      {(results.metadata?.method === 'real-scraping' || results.metadata?.method === 'html-extraction') && " ✅ (Real Data)"}
                      {results.metadata?.method === 'mock-data' && " 🎭 (Mock Data)"}
                    </div>
                    {results.metadata && (
                      <div className={`text-sm mt-2 ${
                        results.metadata?.method === 'real-scraping' || 
                        results.metadata?.method === 'html-extraction' ||
                        results.metadata?.method === 'multi-source'
                          ? 'text-green-600' 
                          : 'text-blue-600'
                      }`}>
                        <div>Company: {results.metadata.company}</div>
                        <div>Source: {results.metadata.source}</div>
                        <div>Date Range: {results.metadata.dateRange}</div>
                        <div>Reviews Found: {results.metadata.totalFound}</div>
                        <div>Method: {
                          results.metadata.method === 'html-extraction' 
                            ? 'HTML Extraction (ZenRows + Cheerio)' 
                            : results.metadata.method === 'real-scraping' 
                            ? 'Real Web Scraping' 
                            : 'Demo Data'
                        }</div>
                        {results.metadata.htmlSaved && (
                          <div className="text-xs mt-1 opacity-75">HTML saved: {results.metadata.htmlSaved}</div>
                        )}
                        {results.metadata.jsonSaved && (
                          <div className="text-xs opacity-75">JSON saved: {results.metadata.jsonSaved}</div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {results.reviews && results.reviews.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="font-semibold text-lg">Reviews:</h3>
                        <div className="text-sm text-gray-500">
                          Page {currentPage} of {Math.ceil(results.reviews.length / reviewsPerPage)} • Showing {Math.min((currentPage - 1) * reviewsPerPage + 1, results.reviews.length)}-{Math.min(currentPage * reviewsPerPage, results.reviews.length)} of {results.reviews.length}
                        </div>
                      </div>
                      
                      {/* Display current page reviews */}
                      {results.reviews
                        .slice((currentPage - 1) * reviewsPerPage, currentPage * reviewsPerPage)
                        .map((review: any, index: number) => (
                        <div key={index} className="p-4 border rounded-lg bg-gray-50">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-medium">{review.title}</h4>
                            <div className="flex items-center gap-2">
                              {review.rating && (
                                <span className="text-sm font-medium text-yellow-600">★ {review.rating}/5</span>
                              )}
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                {review.source || results.metadata?.source}
                              </span>
                            </div>
                          </div>
                          <p className="text-gray-700 mb-3">{review.body || review.description}</p>
                          
                          {/* Show pros and cons if available */}
                          {(review.pros || review.cons) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                              {review.pros && (
                                <div className="p-2 bg-green-50 border border-green-200 rounded">
                                  <div className="text-xs font-medium text-green-800 mb-1">👍 PROS</div>
                                  <div className="text-sm text-green-700">{review.pros}</div>
                                </div>
                              )}
                              {review.cons && (
                                <div className="p-2 bg-red-50 border border-red-200 rounded">
                                  <div className="text-xs font-medium text-red-800 mb-1">👎 CONS</div>
                                  <div className="text-sm text-red-700">{review.cons}</div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          <div className="text-sm text-gray-500 flex flex-col sm:flex-row sm:justify-between gap-1">
                            <span>By: {review.author || review.reviewer || 'Anonymous'}</span>
                            <span>{review.date}</span>
                          </div>
                          
                          {/* Show additional info if available */}
                          {review.additionalInfo && (
                            <div className="text-xs text-gray-400 mt-2 border-t pt-2">
                              {review.additionalInfo}
                            </div>
                          )}
                          
                          {review.url && (
                            <div className="text-xs text-blue-600 mt-1">
                              <a href={review.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                View Original →
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {/* Pagination Controls */}
                      {results.reviews.length > reviewsPerPage && (
                        <div className="flex justify-center items-center gap-2 mt-6 pt-4 border-t">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                          >
                            Previous
                          </Button>
                          
                          <div className="flex gap-1">
                            {Array.from({ length: Math.ceil(results.reviews.length / reviewsPerPage) }, (_, i) => i + 1)
                              .filter(page => {
                                // Show first page, last page, current page, and pages around current
                                const totalPages = Math.ceil(results.reviews.length / reviewsPerPage)
                                return page === 1 || 
                                       page === totalPages || 
                                       Math.abs(page - currentPage) <= 1
                              })
                              .map((page, index, arr) => {
                                // Add ellipsis if there's a gap
                                const shouldShowEllipsis = index > 0 && page - arr[index - 1] > 1
                                return (
                                  <div key={page} className="flex items-center">
                                    {shouldShowEllipsis && <span className="mx-1 text-gray-400">...</span>}
                                    <Button
                                      variant={currentPage === page ? "default" : "outline"}
                                      size="sm"
                                      onClick={() => setCurrentPage(page)}
                                      className="w-8 h-8 p-0"
                                    >
                                      {page}
                                    </Button>
                                  </div>
                                )
                              })}
                          </div>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(results.reviews.length / reviewsPerPage)))}
                            disabled={currentPage === Math.ceil(results.reviews.length / reviewsPerPage)}
                          >
                            Next
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {(!results.reviews || results.reviews.length === 0) && (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-700">
                      <strong>No reviews found</strong> for the specified criteria. This could be due to:
                      <ul className="mt-2 ml-4 list-disc text-sm">
                        <li>No reviews in the specified date range</li>
                        <li>Product not found on the selected platform</li>
                      </ul>
                      <div className="mt-2 text-sm">
                        Try using the "Mock (Demo)" source to test the interface.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}