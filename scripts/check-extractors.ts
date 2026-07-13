import { strict as assert } from "node:assert"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import {
  type ExtractionContext,
  extractMaps,
  extractSearch,
  extractWebsite,
} from "../extension/extractors"

async function fixture(name: string, url: string): Promise<ExtractionContext> {
  document.open()
  document.write(
    await Bun.file(`${import.meta.dir}/../tests/fixtures/${name}`).text(),
  )
  document.close()
  return { document, pageUrl: url, capturedAt: "2026-07-12T00:00:00.000Z" }
}

GlobalRegistrator.register()

const website = extractWebsite(
  await fixture("business.html", "https://northstar.example/"),
  "website",
)
assert.equal(website.length, 1)
assert.deepEqual(website[0]?.emails, ["hello@northstar.example"])
assert.deepEqual(website[0]?.phones, ["+91 98765 43210"])
assert.deepEqual(website[0]?.socialProfiles, [
  "https://instagram.com/northstarplumbing",
])
assert.equal(
  website[0]?.evidence.some((item) => item.field === "socialProfile"),
  true,
)

const search = extractSearch(
  await fixture(
    "google-search.html",
    "https://www.google.com/search?q=plumbers+pune",
  ),
)
assert.equal(search.length, 2)
assert.deepEqual(
  search.map((lead) => lead.website),
  ["https://northstar.example/", "https://second.example/"],
)

const maps = extractMaps(
  await fixture(
    "google-maps.html",
    "https://www.google.com/maps/search/plumbers",
  ),
)
assert.equal(maps.length, 2)
assert.equal(maps[0]?.website, "https://northstar.example/")
assert.equal(maps[0]?.address, "14 North Street")
assert.deepEqual(maps[1]?.phones, ["+91 91234 56789"])
assert.equal(
  maps[0]?.evidence.some((item) => item.field === "website"),
  true,
)

GlobalRegistrator.unregister()
process.stdout.write("3 extractor fixtures passed\n")
