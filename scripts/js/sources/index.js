import { G2Source } from "./g2.js"
import { CapterraSource } from "./capterra.js"
import { GetAppSource } from "./getapp.js"
import { MockSource } from "./mock.js"

export const SOURCES = {
  g2: G2Source,
  capterra: CapterraSource,
  getapp: GetAppSource, // bonus
  mock: MockSource, // for testing/demo purposes
}
