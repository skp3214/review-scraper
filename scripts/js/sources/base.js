export class SourceError extends Error {}

export class BaseSource {
  constructor() {
    this.name = "base"
  }

  // async findProduct(company): returns { productName, reviewsUrl }
  async findProduct(company) {
    throw new SourceError("findProduct not implemented")
  }

  // async *iterReviews(reviewsUrl, start, end, maxPages)
  async *iterReviews(_reviewsUrl, _start, _end, _maxPages = 25) {
    // to be implemented by subclasses
  }

  // scrape: orchestrates and returns array of normalized reviews
  async scrape(company, start, end, maxPages = 25) {
    const { productName, reviewsUrl } = await this.findProduct(company)
    const results = []
    for await (const r of this.iterReviews(reviewsUrl, start, end, maxPages)) {
      results.push({
        title: r.title,
        description: r.description,
        date: r.date,
        rating: r.rating ?? null,
        reviewer: r.reviewer ?? null,
        url: r.url ?? null,
        source: r.source ?? this.name,
        product: productName,
        extra: r.extra ?? {},
      })
    }
    return results
  }
}
