import { BaseSource } from "./base.js"

export class MockSource extends BaseSource {
  constructor() {
    super()
    this.name = "mock"
    this.reviewsPerPage = 10 // Configurable reviews per page
    this.maxReviews = 150 // Maximum reviews to generate
    this.minReviews = 20 // Minimum reviews to generate
  }

  async findProduct(company) {
    // Always succeeds for demo purposes
    return {
      productName: company,
      reviewsUrl: `https://mock.example.com/products/${company.toLowerCase()}/reviews`
    }
  }

  generateMockReviews(company, startDate, endDate) {
    const reviewTemplates = [
      {
        titles: [
          "Excellent product for productivity",
          "Outstanding tool for team collaboration", 
          "Game-changer for our workflow",
          "Highly recommended for businesses",
          "Perfect solution for our needs",
          "Incredible value and functionality",
          "Best-in-class features and support",
          "Revolutionary platform for efficiency"
        ],
        descriptions: [
          "This tool has significantly improved our team's workflow. The interface is intuitive and the features are well-designed.",
          "We've seen a 40% increase in productivity since implementing this solution. The learning curve was minimal.",
          "The customer support team is exceptional. They respond quickly and provide detailed solutions.",
          "Integration with our existing tools was seamless. Setup took less than an hour.",
          "The reporting features give us insights we never had before. Data visualization is top-notch.",
          "Regular updates and new features show the company is committed to continuous improvement.",
          "The mobile app works flawlessly and keeps our remote team connected.",
          "Security features meet our enterprise requirements. We feel confident about data protection."
        ],
        ratings: [4.5, 5.0, 4.8, 4.7, 4.9],
        reviewers: [
          "Sarah M., Product Manager",
          "David L., CTO", 
          "Jennifer R., Operations Director",
          "Michael B., Team Lead",
          "Lisa K., Project Manager"
        ]
      },
      {
        titles: [
          "Good value for money",
          "Solid platform with room for improvement",
          "Decent features but could be better",
          "Meets basic requirements well",
          "Reliable tool for daily use",
          "Good option for small teams",
          "Functional but not exceptional",
          "Adequate solution for the price"
        ],
        descriptions: [
          "We've been using this for 6 months. It does what it promises and the customer support is responsive.",
          "The core functionality works well, but some advanced features feel incomplete.",
          "Good for basic use cases. We'd like to see more customization options in future updates.",
          "Stable platform with occasional minor bugs. Overall satisfied with the purchase.",
          "The user interface could be more modern, but functionality is solid.",
          "Works well for our team size. Might need better scalability for larger organizations.",
          "Training materials could be more comprehensive. Some features are hard to discover.",
          "Good integration capabilities. The API documentation could be clearer."
        ],
        ratings: [4.0, 3.8, 4.1, 3.9, 4.2],
        reviewers: [
          "James T., IT Director",
          "Amanda C., Business Analyst",
          "Robert H., Software Engineer",
          "Emily W., Marketing Manager",
          "Christopher D., Operations Manager"
        ]
      },
      {
        titles: [
          "Feature-rich platform",
          "Powerful but complex solution",
          "Comprehensive toolset available",
          "Advanced features for power users",
          "Extensive functionality offered",
          "Professional-grade capabilities",
          "Enterprise-level features",
          "Full-featured business solution"
        ],
        descriptions: [
          "Lots of capabilities but can be overwhelming at first. Good documentation helps with onboarding.",
          "The learning curve is steep but worth it. Once mastered, it's incredibly powerful.",
          "Extensive customization options available. Takes time to configure optimally.",
          "Advanced users will love the flexibility. Beginners might find it challenging initially.",
          "The feature set is comprehensive. Some functions we haven't even explored yet.",
          "Great for complex workflows. Simple tasks might be overengineered.",
          "Professional support team helped us with custom implementation.",
          "The analytics and reporting capabilities are particularly strong."
        ],
        ratings: [3.5, 3.7, 4.3, 3.8, 4.0],
        reviewers: [
          "Dr. Patricia S., Research Director",
          "Thomas K., Senior Developer",
          "Maria G., Process Manager",
          "Andrew F., Solutions Architect",
          "Rachel P., Data Analyst"
        ]
      },
      {
        titles: [
          "Not quite what we expected",
          "Has potential but needs work",
          "Mixed experience overall",
          "Some good points, some concerns",
          "Decent but with limitations",
          "Works but could be improved",
          "Functional with some issues",
          "Average performance and features"
        ],
        descriptions: [
          "The product works but doesn't quite meet our specific industry requirements.",
          "Customer service response time could be faster. Some features feel unfinished.",
          "Good concept but execution could be better. We're hoping for improvements.",
          "Price point is reasonable but we expected more advanced features.",
          "Integration was more complex than advertised. Required additional technical support.",
          "The mobile experience is lacking compared to the desktop version.",
          "Frequent updates are good but sometimes break existing functionality.",
          "Documentation is extensive but could be better organized and clearer."
        ],
        ratings: [3.0, 2.8, 3.2, 3.1, 2.9],
        reviewers: [
          "Steven R., IT Manager",
          "Karen L., Business Owner",
          "Daniel M., Consultant",
          "Nicole B., Project Coordinator",
          "Mark W., System Administrator"
        ]
      }
    ]

    const reviews = []
    const daysBetween = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
    const reviewCount = Math.min(this.maxReviews, Math.max(this.minReviews, Math.floor(daysBetween / 3))) // Scale reviews based on date range

    for (let i = 0; i < reviewCount; i++) {
      const templateCategory = reviewTemplates[Math.floor(Math.random() * reviewTemplates.length)]
      const titleIndex = Math.floor(Math.random() * templateCategory.titles.length)
      const descIndex = Math.floor(Math.random() * templateCategory.descriptions.length)
      const ratingIndex = Math.floor(Math.random() * templateCategory.ratings.length)
      const reviewerIndex = Math.floor(Math.random() * templateCategory.reviewers.length)

      // Generate random date within range
      const randomTime = startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime())
      const reviewDate = new Date(randomTime)

      reviews.push({
        title: templateCategory.titles[titleIndex],
        description: templateCategory.descriptions[descIndex],
        date: reviewDate.toISOString().slice(0, 10),
        rating: templateCategory.ratings[ratingIndex],
        reviewer: templateCategory.reviewers[reviewerIndex],
        url: `https://mock.example.com/products/${company.toLowerCase()}/reviews`,
        source: this.name,
        product: company,
        extra: {
          reviewId: `mock-${i + 1}`,
          helpfulVotes: Math.floor(Math.random() * 50),
          verifiedPurchase: Math.random() > 0.3,
          companySize: this.getRandomCompanySize(),
          industry: this.getRandomIndustry()
        }
      })
    }

    // Sort by date (newest first)
    reviews.sort((a, b) => new Date(b.date) - new Date(a.date))
    return reviews
  }

  getRandomCompanySize() {
    const sizes = ["1-10 employees", "11-50 employees", "51-200 employees", "201-1000 employees", "1000+ employees"]
    return sizes[Math.floor(Math.random() * sizes.length)]
  }

  getRandomIndustry() {
    const industries = [
      "Technology", "Healthcare", "Finance", "Education", "Retail", 
      "Manufacturing", "Consulting", "Marketing", "Real Estate", "Non-profit"
    ]
    return industries[Math.floor(Math.random() * industries.length)]
  }

  async *iterReviews(reviewsUrl, start, end, maxPages = 25) {
    console.log(`[MOCK] 📝 Generating mock reviews for date range: ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`)
    
    // Extract company name from URL
    const company = reviewsUrl.split('/products/')[1]?.split('/')[0] || 'Unknown'
    
    // Generate all mock reviews
    const allReviews = this.generateMockReviews(company, start, end)
    
    console.log(`[MOCK] 📊 Generated ${allReviews.length} total reviews`)
    console.log(`[MOCK] 📄 Reviews per page: ${this.reviewsPerPage}`)
    console.log(`[MOCK] 📖 Total pages available: ${Math.ceil(allReviews.length / this.reviewsPerPage)}`)
    console.log(`[MOCK] 🔍 Requested max pages: ${maxPages}`)
    
    // Implement pagination
    const totalPages = Math.ceil(allReviews.length / this.reviewsPerPage)
    const pagesToProcess = Math.min(maxPages, totalPages)
    
    for (let page = 1; page <= pagesToProcess; page++) {
      console.log(`[MOCK] 📄 Processing page ${page}/${pagesToProcess}`)
      
      const startIndex = (page - 1) * this.reviewsPerPage
      const endIndex = Math.min(startIndex + this.reviewsPerPage, allReviews.length)
      const pageReviews = allReviews.slice(startIndex, endIndex)
      
      console.log(`[MOCK] ✅ Page ${page}: Yielding ${pageReviews.length} reviews (indices ${startIndex}-${endIndex - 1})`)
      
      // Yield reviews for this page
      for (const review of pageReviews) {
        yield review
      }
      
      // Simulate page loading delay
      if (page < pagesToProcess) {
        console.log(`[MOCK] ⏳ Simulating page load delay...`)
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    console.log(`[MOCK] ✅ Completed pagination: ${pagesToProcess} pages processed`)
  }
}