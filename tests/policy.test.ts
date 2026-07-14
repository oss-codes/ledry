import { describe, expect, test } from "bun:test"
import { isAllowedUrl, permissionPatternForUrl } from "../extension/policy"

describe("source policy", () => {
  test("allows public HTTP sources", () => {
    expect(isAllowedUrl("https://www.google.com/maps/search/plumbers")).toBe(
      true,
    )
    expect(isAllowedUrl("https://example.com/contact")).toBe(true)
  })

  test("rejects LinkedIn and every subdomain", () => {
    expect(isAllowedUrl("https://linkedin.com/in/example")).toBe(false)
    expect(isAllowedUrl("https://uk.linkedin.com/in/example")).toBe(false)
    expect(
      isAllowedUrl("https://deep.region.linkedin.com/company/example"),
    ).toBe(false)
  })

  test("rejects privileged schemes", () => {
    expect(isAllowedUrl("file:///tmp/leads.html")).toBe(false)
    expect(isAllowedUrl("chrome://settings")).toBe(false)
  })

  test("rejects an incomplete browser URL without throwing", () => {
    expect(isAllowedUrl("")).toBe(false)
    expect(isAllowedUrl("not a URL")).toBe(false)
  })

  test("creates a permission pattern for only the approved origin", () => {
    expect(permissionPatternForUrl("https://example.com/leads?page=2")).toBe(
      "https://example.com/*",
    )
    expect(
      permissionPatternForUrl("https://linkedin.com/company/example"),
    ).toBe(null)
  })
})
