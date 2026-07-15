import { describe, expect, test } from "bun:test"
import { prepareResearchResults } from "../src/research"
import type { Lead } from "../src/schemas"

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead:https://example.com",
    name: "Northstar Coffee",
    organization: "Northstar Coffee",
    category: "Coffee roaster",
    website: "https://example.com/",
    emails: [],
    phones: [],
    socialProfiles: [],
    address: "Pune",
    sourceUrl: "https://example.com/",
    sourceType: "website",
    capturedAt: "2026-07-15T00:00:00.000Z",
    evidence: [],
    confidence: 0.8,
    score: 0,
    tags: ["public-business-page"],
    ...overrides,
  }
}

describe("prepareResearchResults", () => {
  test("caps valid leads before persistence and rejects Google redirect websites", () => {
    const results = prepareResearchResults(
      [
        lead({
          id: "maps:1",
          sourceUrl: "https://www.google.com/maps/place/Northstar",
          website: "https://www.google.com/searchviewer/123",
          sourceType: "google-maps",
        }),
        lead({ id: "maps:2" }),
        lead({ id: "maps:3" }),
      ],
      2,
    )

    expect(results.accepted).toHaveLength(2)
    expect(results.accepted[0]?.website).toBe("")
    expect(results.skipped).toBe(1)
    expect(results.quarantined).toHaveLength(0)
  })

  test("quarantines private and account-scoped social pages", () => {
    const results = prepareResearchResults(
      [
        lead({
          id: "linkedin-person",
          sourceType: "social",
          sourceUrl: "https://www.linkedin.com/in/private-person/",
        }),
        lead({
          id: "instagram-inbox",
          sourceType: "social",
          sourceUrl: "https://www.instagram.com/direct/inbox/",
        }),
      ],
      5,
    )

    expect(results.accepted).toHaveLength(0)
    expect(results.quarantined).toHaveLength(2)
  })

  test("rejects personal destinations and unverified social profiles", () => {
    const results = prepareResearchResults(
      [
        lead({
          id: "search-person",
          sourceType: "google-search",
          sourceUrl: "https://www.google.co.in/search?q=person",
          website: "https://www.linkedin.com/in/private-person/",
        }),
        lead({
          id: "instagram-person",
          sourceType: "social",
          sourceUrl: "https://www.instagram.com/jane_doe/",
        }),
        lead({
          id: "website-personal-destination",
          socialProfiles: ["https://www.instagram.com/jane_doe/"],
        }),
        lead({
          id: "search-personal-portfolio",
          sourceType: "google-search",
          sourceUrl: "https://www.google.com/search?q=alice",
          website: "https://alice.example/about",
        }),
        lead({
          id: "forced-maps-adapter",
          sourceType: "google-maps",
          sourceUrl: "https://example.com/customer-portal",
        }),
      ],
      5,
    )

    expect(results.accepted).toHaveLength(0)
    expect(results.quarantined).toEqual([
      {
        reason: "Personal LinkedIn destinations are not business leads",
        sourceType: "google-search",
      },
      {
        reason:
          "Social extraction requires explicit public business-page evidence",
        sourceType: "social",
      },
      {
        reason:
          "Ambiguous personal social-profile destinations are not retained",
        sourceType: "website",
      },
      {
        reason:
          "Google Search candidates require explicit business-result evidence",
        sourceType: "google-search",
      },
      {
        reason: "Private, authenticated, or unsupported source page",
        sourceType: "google-maps",
      },
    ])
  })
})
