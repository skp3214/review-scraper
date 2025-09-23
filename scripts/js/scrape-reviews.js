import { SOURCES } from "./sources/index.js"
import { parseDateFlexible, saveJson } from "./utils.js"

function parseArgs(argv) {
  // Minimal flag parser: --key value
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const tok = argv[i]
    if (tok.startsWith("--")) {
      const key = tok.slice(2)
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true
      args[key] = val
    }
  }
  return args
}

function parseISODate(s) {
  // accept YYYY-MM-DD strictly
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim())
  if (!m) throw new Error(`[v0] Invalid date '${s}'. Use format YYYY-MM-DD.`)
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
  if (isNaN(d)) throw new Error(`[v0] Invalid date '${s}'.`)
  return d
}
;(async function main() {
  try {
    const args = parseArgs(process.argv)
    const company = args.company
    const startStr = args.start
    const endStr = args.end
    const sourceKey = String(args.source || "").toLowerCase()
    const out = args.out || "reviews.json"
    const maxPages = args["max-pages"] ? Number.parseInt(args["max-pages"], 10) : 25

    if (!company || !startStr || !endStr || !sourceKey) {
      console.log(
        '[v0] Usage: node scripts/js/scrape-reviews.js --company "Notion" --start 2024-01-01 --end 2024-12-31 --source g2 --out notion-g2-2024.json',
      )
      process.exit(1)
    }
    if (!SOURCES[sourceKey]) {
      console.error(`[v0] Unsupported source '${sourceKey}'. Options: ${Object.keys(SOURCES).join(", ")}`)
      process.exit(1)
    }

    const start = parseISODate(startStr)
    const end = parseISODate(endStr)
    if (end.getTime() < start.getTime()) {
      console.error("[v0] End date must be on or after start date.")
      process.exit(1)
    }

    console.log(`[v0] Starting scrape: source=${sourceKey} company='${company}' range=${startStr}..${endStr}`)
    const SourceCls = SOURCES[sourceKey]
    const source = new SourceCls()

    const reviews = await source.scrape(company, start, end, maxPages)

    // Final strict date filter
    const filtered = reviews.filter((r) => {
      if (!r.date) return false
      const d = parseDateFlexible(r.date)
      return d && !isNaN(d) && d >= start && d <= end
    })

    console.log(`[v0] Scraped ${reviews.length} reviews; ${filtered.length} within date range.`)
    await saveJson(out, filtered)
    console.log(`[v0] Saved JSON to ${out}`)
  } catch (e) {
    console.error(`[v0] Error: ${e?.message || e}`)
    process.exit(2)
  }
})()
